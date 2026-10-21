const db = require('../db');
const pendingSolicitudStorage = require('../services/pendingSolicitudStorage');

function normalizeCedula(value) {
  return String(value || '').replace(/\D/g, '')
}

async function createSolicitud({ nombre_completo, documento, telefono, correo, contacto, documentos }) {
  const payloadDocumentos = typeof documentos === 'string'
    ? documentos
    : JSON.stringify(documentos || {})

  const [result] = await db.query(
    `INSERT INTO solicitudes_preinscripciones
      (nombre_completo, documento, telefono, correo, contacto, documentos, estado)
     VALUES (?, ?, ?, ?, ?, ?, 'Pendiente')`,
    [nombre_completo, documento, telefono, correo, contacto, payloadDocumentos]
  );

  return {
    id_solicitud: result.insertId,
    nombre_completo,
    documento,
    telefono,
    correo,
    contacto,
    documentos: typeof documentos === 'string' ? JSON.parse(documentos) : (documentos || {}),
    estado: 'Pendiente'
  };
}

async function insertDocument(connection, { name, filename, mimetype, buffer, idStatus, idMovement }) {
  const content = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || [])
  const chunkSize = 256 * 1024
  const firstChunk = content.subarray(0, chunkSize)

  const [result] = await connection.query(
    'INSERT INTO documento (nombre_documentos, nombre_archivo, tipo_mime, tamano_bytes, archivo, id_status, id_movimiento) VALUES (?, ?, ?, ?, UNHEX(?), ?, ?)',
    [name, filename, mimetype, content.length, firstChunk.toString('hex'), idStatus, idMovement]
  )

  for (let offset = firstChunk.length; offset < content.length; offset += chunkSize) {
    await connection.query(
      'UPDATE documento SET archivo = CONCAT(archivo, UNHEX(?)) WHERE id = ?',
      [content.subarray(offset, offset + chunkSize).toString('hex'), result.insertId]
    )
  }

  const [[storedDocument]] = await connection.query(
    'SELECT OCTET_LENGTH(archivo) AS stored_bytes FROM documento WHERE id = ?',
    [result.insertId]
  )
  if (Number(storedDocument.stored_bytes) !== content.length) {
    const error = new Error(`El archivo no quedó almacenado íntegramente: ${storedDocument.stored_bytes ?? 'NULL'} de ${content.length} bytes.`)
    error.code = 'DOCUMENT_STORAGE_INCOMPLETE'
    throw error
  }

  return result.insertId
}

async function createPendingAdminInscripcion(data) {
  const {
    foto_cedula,
    foto_alumno,
    userId,
    seccion_id,
    seccion_nombre,
    ...formData
  } = data
  formData.tipo_solicitud = 'nuevo_ingreso'
  const connection = await db.getConnection()
  let solicitudId = null

  try {
    await connection.beginTransaction()
    const [requestResult] = await connection.query(
      `INSERT INTO solicitudes_preinscripciones
        (nombre_completo, documento, telefono, correo, contacto, estado, id_user)
       VALUES (?, ?, '', '', '', 'Pendiente', ?)`,
      [
        'Solicitud pendiente',
        `PENDIENTE-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        userId || null
      ]
    )
    solicitudId = requestResult.insertId
    await connection.query(
      'UPDATE solicitudes_preinscripciones SET nombre_completo = ?, documento = ? WHERE id = ?',
      [`Solicitud #${solicitudId}`, `PENDIENTE-${solicitudId}`, solicitudId]
    )
    await pendingSolicitudStorage.writePendingSolicitud(solicitudId, formData, {
      foto_cedula,
      foto_alumno
    })
    await connection.commit()
    return {
      id: solicitudId,
      nombre_completo: `${formData.nombres} ${formData.apellidos}`.trim(),
      estado: 'Pendiente'
    }
  } catch (error) {
    try {
      await connection.rollback()
    } catch (rollbackError) {
      console.error('No se pudo revertir el guardado de la solicitud pendiente:', {
        code: rollbackError.code,
        message: rollbackError.message
      })
    }
    if (solicitudId) {
      try {
        await pendingSolicitudStorage.removePendingSolicitud(solicitudId)
      } catch (cleanupError) {
        console.error('No se pudo limpiar el archivo temporal de una solicitud fallida:', cleanupError.message)
      }
    }
    throw error
  } finally {
    connection.release()
  }
}

async function getRepresentativePreinscriptionStudents(userId, representativeCedula) {
  const normalizedCedula = normalizeCedula(representativeCedula)
  const [[profile]] = await db.query(
    'SELECT cedula FROM usuarios WHERE id = ?',
    [Number(userId)]
  )
  if (!normalizedCedula || !profile?.cedula || normalizeCedula(profile.cedula) !== normalizedCedula) {
    const error = new Error('La cédula debe coincidir con la registrada en el perfil del representante autenticado.')
    error.code = 'REPRESENTATIVE_IDENTITY_MISMATCH'
    throw error
  }

  const [students] = await db.query(
    `SELECT a.id, a.nombres, a.apellidos, a.fecha_nacimiento, a.alergias_condiciones,
            CONCAT_WS(' ', r.nombres, r.apellidos) AS representante,
            r.cedula AS representante_cedula,
            r.parentesco AS representante_parentesco,
            t.numero_telefono AS telefono,
            d.municipio AS direccion_municipio,
            d.calle AS direccion_calle,
            d.avenida AS direccion_avenida,
            d.num_casa AS direccion_num_casa,
            (
              SELECT s.documento
                FROM solicitudes_preinscripciones s
               WHERE s.id_alumno = a.id
                 AND s.documento NOT LIKE 'PENDIENTE-%'
               ORDER BY s.id DESC
               LIMIT 1
            ) AS documento,
            (
              SELECT s.correo
                FROM solicitudes_preinscripciones s
               WHERE s.id_alumno = a.id
               ORDER BY s.id DESC
               LIMIT 1
            ) AS correo,
            p.id AS current_preinscripcion_id,
            p.id_r_a_d,
            p.id_periodo AS periodo_id,
            per.fecha_inicio AS periodo,
            g.id AS grado_actual_id,
            g.nombre_grado AS grado_actual
       FROM alumno a
       JOIN representantes r ON r.id = a.id_representante
       LEFT JOIN telefono t ON t.id = r.id_telefono
       LEFT JOIN direccion d ON d.id = r.id_direccion
       JOIN (
         SELECT rad.id_alumno, MAX(enrollment.id) AS latest_preinscripcion_id
           FROM preinscripciones enrollment
           JOIN r_a_d rad ON rad.id = enrollment.id_r_a_d
          GROUP BY rad.id_alumno
       ) latest ON latest.id_alumno = a.id
       JOIN preinscripciones p ON p.id = latest.latest_preinscripcion_id
       LEFT JOIN periodo per ON per.id = p.id_periodo
       LEFT JOIN r_g_s rgs ON rgs.id = p.id_r_g_s
       LEFT JOIN grados g ON g.id = rgs.id_grado
      WHERE REGEXP_REPLACE(TRIM(r.cedula), '[^0-9]', '') = ?
      ORDER BY a.apellidos, a.nombres, a.id`,
    [normalizedCedula]
  )
  return students
}

async function createPendingExistingStudentPreinscripcion(alumnoId, gradoId, userId, representativeIdentity = null) {
  const connection = await db.getConnection()
  let solicitudId = null
  try {
    await connection.beginTransaction()
    const [registeredStudents] = representativeIdentity
      ? await connection.query(
        `SELECT a.id
           FROM alumno a
           JOIN representantes r ON r.id = a.id_representante
           JOIN usuarios profile ON profile.id = ?
          WHERE REGEXP_REPLACE(TRIM(profile.cedula), '[^0-9]', '') = ?
            AND REGEXP_REPLACE(TRIM(r.cedula), '[^0-9]', '') = ?
            AND a.id = ?
            AND EXISTS (
              SELECT 1
                FROM preinscripciones enrollment
                JOIN r_a_d relation ON relation.id = enrollment.id_r_a_d
               WHERE relation.id_alumno = a.id
            )
          FOR UPDATE`,
        [
          Number(representativeIdentity.userId),
          normalizeCedula(representativeIdentity.cedula),
          normalizeCedula(representativeIdentity.cedula),
          Number(representativeIdentity.alumnoId)
        ]
      )
      : await connection.query(
        'SELECT id FROM alumno WHERE id = ? FOR UPDATE',
        [Number(alumnoId)]
      )
    const registeredAlumno = representativeIdentity
      ? registeredStudents.length === 1 ? registeredStudents[0] : null
      : registeredStudents[0]
    if (!registeredAlumno) {
      const error = new Error(representativeIdentity
        ? 'No se encontró un alumno inscrito asociado a ese representante.'
        : 'No se encontró el alumno seleccionado.')
      error.code = 'STUDENT_NOT_FOUND'
      throw error
    }

    alumnoId = Number(registeredAlumno.id)
    const [[alumno]] = await connection.query(
      `SELECT a.id, a.nombres, a.apellidos, a.fecha_nacimiento, a.alergias_condiciones,
              r.nombres AS representante_nombre, r.apellidos AS representante_apellido,
              r.cedula AS representante_cedula, r.parentesco AS representante_parentesco,
              t.numero_telefono AS telefono,
              d.municipio AS direccion_municipio, d.calle AS direccion_calle,
              d.avenida AS direccion_avenida, d.num_casa AS direccion_num_casa,
              (
                SELECT s.documento
                  FROM solicitudes_preinscripciones s
                 WHERE s.id_alumno = a.id
                   AND s.documento NOT LIKE 'PENDIENTE-%'
                 ORDER BY s.id DESC
                 LIMIT 1
              ) AS documento,
              (
                SELECT s.correo
                  FROM solicitudes_preinscripciones s
                 WHERE s.id_alumno = a.id
                 ORDER BY s.id DESC
                 LIMIT 1
              ) AS correo
         FROM alumno a
         LEFT JOIN representantes r ON r.id = a.id_representante
         LEFT JOIN telefono t ON t.id = r.id_telefono
         LEFT JOIN direccion d ON d.id = r.id_direccion
        WHERE a.id = ?`,
      [Number(alumnoId)]
    )
    const [[currentEnrollment]] = await connection.query(
      `SELECT p.id AS current_preinscripcion_id, p.id_r_a_d, p.id_periodo,
              per.fecha_inicio AS periodo, g.id AS grado_actual_id,
              g.nombre_grado AS grado_actual
         FROM preinscripciones p
         JOIN r_a_d rad ON rad.id = p.id_r_a_d
         LEFT JOIN periodo per ON per.id = p.id_periodo
         LEFT JOIN r_g_s rgs ON rgs.id = p.id_r_g_s
         LEFT JOIN grados g ON g.id = rgs.id_grado
        WHERE rad.id_alumno = ?
        ORDER BY p.id DESC
        LIMIT 1
        FOR UPDATE`,
      [Number(alumnoId)]
    )
    Object.assign(alumno, currentEnrollment || {})
    if (!alumno.current_preinscripcion_id || !alumno.id_periodo || !alumno.id_r_a_d) {
      const error = new Error('El alumno no tiene una inscripción actual desde la cual solicitar un cambio de grado.')
      error.code = 'STUDENT_ENROLLMENT_NOT_FOUND'
      throw error
    }
    if (Number(alumno.grado_actual_id) === Number(gradoId)) {
      const error = new Error('El grado solicitado debe ser distinto al grado actual del alumno.')
      error.code = 'GRADE_UNCHANGED'
      throw error
    }
    if (representativeIdentity && Number(gradoId) < Number(alumno.grado_actual_id)) {
      const error = new Error('El representante solo puede solicitar el grado actual o uno posterior.')
      error.code = 'GRADE_BEFORE_CURRENT'
      throw error
    }

    const [[grade]] = await connection.query(
      'SELECT id, nombre_grado, cupos_disponibles FROM grados WHERE id = ? FOR UPDATE',
      [Number(gradoId)]
    )
    if (!grade) {
      const error = new Error('El grado seleccionado ya no está disponible.')
      error.code = 'GRADE_NOT_FOUND'
      throw error
    }
    if (grade.cupos_disponibles !== null && Number(grade.cupos_disponibles) <= 0) {
      const error = new Error('El grado seleccionado no tiene cupos disponibles.')
      error.code = 'NO_CUPOS'
      throw error
    }
    const [[section]] = await connection.query(
      'SELECT id FROM r_g_s WHERE id_grado = ? LIMIT 1',
      [grade.id]
    )
    if (!section) {
      const error = new Error('El grado seleccionado no tiene secciones disponibles.')
      error.code = 'SECTION_NOT_FOUND'
      throw error
    }

    const formData = {
      tipo_solicitud: 'preinscripcion_existente',
      alumno_id: Number(alumno.id),
      nombres: alumno.nombres,
      apellidos: alumno.apellidos,
      documento: alumno.documento || `ALUMNO-${alumno.id}`,
      fecha_nacimiento: alumno.fecha_nacimiento,
      alergias_condiciones: alumno.alergias_condiciones,
      representante_nombre: alumno.representante_nombre,
      representante_apellido: alumno.representante_apellido,
      representante_cedula: alumno.representante_cedula,
      representante_parentesco: alumno.representante_parentesco,
      telefono: alumno.telefono || '',
      correo: alumno.correo || '',
      direccion_municipio: alumno.direccion_municipio || '',
      direccion_calle: alumno.direccion_calle || '',
      direccion_avenida: alumno.direccion_avenida || '',
      direccion_num_casa: alumno.direccion_num_casa || '',
      grado_actual_id: alumno.grado_actual_id,
      grado_actual: alumno.grado_actual,
      grado_id: Number(grade.id),
      grado_nombre: grade.nombre_grado,
      periodo_id: Number(alumno.id_periodo),
      fecha_inicio: alumno.periodo,
      current_preinscripcion_id: Number(alumno.current_preinscripcion_id),
      id_r_a_d: Number(alumno.id_r_a_d)
    }
    const [requestResult] = await connection.query(
      `INSERT INTO solicitudes_preinscripciones
        (nombre_completo, documento, telefono, correo, contacto, estado, id_user)
       VALUES (?, ?, ?, ?, ?, 'Pendiente', ?)`,
      [
        `${alumno.nombres} ${alumno.apellidos}`.trim(),
        `PENDIENTE-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        formData.telefono,
        formData.correo,
        formData.telefono,
        userId || null
      ]
    )
    solicitudId = requestResult.insertId
    await connection.query(
      'UPDATE solicitudes_preinscripciones SET documento = ? WHERE id = ?',
      [`PENDIENTE-${solicitudId}`, solicitudId]
    )
    await pendingSolicitudStorage.writePendingSolicitud(solicitudId, formData)
    await connection.commit()
    return {
      id: solicitudId,
      nombre_completo: `${alumno.nombres} ${alumno.apellidos}`.trim(),
      estado: 'Pendiente',
      tipo_solicitud: 'preinscripcion_existente',
      grado_nombre: grade.nombre_grado
    }
  } catch (error) {
    try {
      await connection.rollback()
    } catch (rollbackError) {
      console.error('No se pudo revertir el guardado de la preinscripción pendiente:', rollbackError.message)
    }
    if (solicitudId) {
      try {
        await pendingSolicitudStorage.removePendingSolicitud(solicitudId)
      } catch (cleanupError) {
        console.error('No se pudo limpiar el JSON temporal de una preinscripción fallida:', cleanupError.message)
      }
    }
    throw error
  } finally {
    connection.release()
  }
}

async function insertAdminEnrollment(connection, data) {
  const {
    nombres,
    apellidos,
    fecha_nacimiento,
    alergias_condiciones,
    documento,
    representante_cedula,
    representante_nombre,
    representante_apellido,
    representante_parentesco,
    direccion_municipio,
    direccion_calle,
    direccion_avenida,
    direccion_num_casa,
    telefono,
    correo,
    contacto,
    grado_nombre,
    grado_id,
    fecha_inicio,
    periodo_id,
    seccion_nombre,
    seccion_id,
    status_id,
    movimiento_id,
    foto_cedula,
    foto_alumno,
    userId = null
  } = data

    const gradeQuery = grado_id
      ? ['SELECT id, nombre_grado, cupos_disponibles FROM grados WHERE id = ? FOR UPDATE', [Number(grado_id)]]
      : ['SELECT id, nombre_grado, cupos_disponibles FROM grados WHERE nombre_grado = ? FOR UPDATE', [String(grado_nombre).trim()]]
    const [[grade]] = await connection.query(...gradeQuery)
    if (!grade) {
      const error = new Error('El grado seleccionado ya no está disponible.')
      error.code = 'GRADE_NOT_FOUND'
      throw error
    }
    if (grade.cupos_disponibles !== null && Number(grade.cupos_disponibles) <= 0) {
      const error = new Error('El grado seleccionado no tiene cupos disponibles.')
      error.code = 'NO_CUPOS'
      throw error
    }

    const sectionQuery = seccion_id
      ? [`SELECT s.id, s.nombre_seccion
            FROM r_g_s rgs
            JOIN seccion s ON s.id = rgs.id_seccion
           WHERE rgs.id_grado = ? AND rgs.id_seccion = ?
           LIMIT 1`, [grade.id, Number(seccion_id)]]
      : [`SELECT s.id, s.nombre_seccion
            FROM r_g_s rgs
            JOIN seccion s ON s.id = rgs.id_seccion
           WHERE rgs.id_grado = ? AND s.nombre_seccion = ?
           LIMIT 1`, [grade.id, String(seccion_nombre).trim()]]
    const [[section]] = await connection.query(...sectionQuery)
    if (!section) {
      const error = new Error('La sección seleccionada ya no está disponible.')
      error.code = 'SECTION_NOT_FOUND'
      throw error
    }

    const [[gradeSection]] = await connection.query(
      'SELECT id FROM r_g_s WHERE id_grado = ? AND id_seccion = ? LIMIT 1',
      [grade.id, section.id]
    )
    const relationId = gradeSection.id

    const [[existingRepresentative]] = await connection.query(
      'SELECT id, id_direccion, id_telefono FROM representantes WHERE cedula = ? FOR UPDATE',
      [String(representante_cedula).trim()]
    )

    let representativeId
    if (existingRepresentative) {
      let addressId = existingRepresentative.id_direccion
      if (addressId) {
        await connection.query(
          'UPDATE direccion SET municipio = ?, calle = ?, avenida = ?, num_casa = ? WHERE id = ?',
          [direccion_municipio, direccion_calle, direccion_avenida, direccion_num_casa, addressId]
        )
      } else {
        const [addressResult] = await connection.query(
          'INSERT INTO direccion (municipio, calle, avenida, num_casa) VALUES (?, ?, ?, ?)',
          [direccion_municipio, direccion_calle, direccion_avenida, direccion_num_casa]
        )
        addressId = addressResult.insertId
      }

      let phoneId = existingRepresentative.id_telefono
      if (phoneId) {
        await connection.query('UPDATE telefono SET numero_telefono = ? WHERE id = ?', [telefono, phoneId])
      } else {
        const [phoneResult] = await connection.query(
          'INSERT INTO telefono (numero_telefono) VALUES (?)',
          [telefono]
        )
        phoneId = phoneResult.insertId
      }

      representativeId = existingRepresentative.id
      await connection.query(
        'UPDATE representantes SET nombres = ?, apellidos = ?, parentesco = ?, id_direccion = ?, id_telefono = ? WHERE id = ?',
        [representante_nombre, representante_apellido, representante_parentesco, addressId, phoneId, representativeId]
      )
    } else {
      const [addressResult] = await connection.query(
        'INSERT INTO direccion (municipio, calle, avenida, num_casa) VALUES (?, ?, ?, ?)',
        [direccion_municipio, direccion_calle, direccion_avenida, direccion_num_casa]
      )
      const [phoneResult] = await connection.query(
        'INSERT INTO telefono (numero_telefono) VALUES (?)',
        [telefono]
      )
      const [representativeResult] = await connection.query(
        'INSERT INTO representantes (nombres, apellidos, cedula, parentesco, id_direccion, id_telefono) VALUES (?, ?, ?, ?, ?, ?)',
        [representante_nombre, representante_apellido, representante_cedula, representante_parentesco, addressResult.insertId, phoneResult.insertId]
      )
      representativeId = representativeResult.insertId
    }

    const hasStudentIdentityDocument = Boolean(foto_alumno)
    const studentIdentityPlaceholder = Buffer.from('El alumno no tiene cédula de identidad.')
    const studentDocumentId = await insertDocument(connection, {
      name: hasStudentIdentityDocument ? 'Foto de la cédula del alumno' : 'Cédula del alumno: no posee',
      filename: foto_alumno?.originalname || (hasStudentIdentityDocument
        ? `${nombres.trim()}-${apellidos.trim()}-cedula.jpg`
        : 'EL_ALUMNO_NO_POSEE_CEDULA.txt'),
      mimetype: foto_alumno?.mimetype || (hasStudentIdentityDocument ? 'image/jpeg' : 'text/plain'),
      buffer: foto_alumno?.buffer || studentIdentityPlaceholder,
      idStatus: status_id,
      idMovement: movimiento_id
    })

    const cedulaDocumentId = await insertDocument(connection, {
      name: 'Foto de la cédula del representante',
      filename: foto_cedula?.originalname || `${representante_nombre.trim()}-${representante_apellido.trim()}-cedula.jpg`,
      mimetype: foto_cedula?.mimetype || 'image/jpeg',
      buffer: foto_cedula?.buffer || Buffer.alloc(0),
      idStatus: status_id,
      idMovement: movimiento_id
    })

    const normalizedPeriodo = String(fecha_inicio || 'Nuevo Ingreso').trim() || 'Nuevo Ingreso'
    let finalPeriodoId = periodo_id || null
    if (!finalPeriodoId) {
      const [[existingPeriod]] = await connection.query(
        'SELECT id FROM periodo WHERE fecha_inicio = ? LIMIT 1',
        [normalizedPeriodo]
      )
      finalPeriodoId = existingPeriod?.id
      if (!finalPeriodoId) {
        const [periodResult] = await connection.query(
          'INSERT INTO periodo (fecha_inicio) VALUES (?)',
          [normalizedPeriodo]
        )
        finalPeriodoId = periodResult.insertId
      }
    }

    const [studentResult] = await connection.query(
      'INSERT INTO alumno (id_representante, nombres, apellidos, fecha_nacimiento, alergias_condiciones) VALUES (?, ?, ?, ?, ?)',
      [representativeId, nombres, apellidos, fecha_nacimiento, alergias_condiciones || null]
    )
    const [studentDocumentRelation] = await connection.query(
      'INSERT INTO r_a_d (id_alumno, id_documento, tipo_documento) VALUES (?, ?, ?)',
      [studentResult.insertId, studentDocumentId, hasStudentIdentityDocument
        ? 'Foto de la cédula del alumno'
        : 'Cédula del alumno: no posee']
    )
    await connection.query(
      'INSERT INTO r_a_d (id_alumno, id_documento, tipo_documento) VALUES (?, ?, ?)',
      [studentResult.insertId, cedulaDocumentId, 'Cédula del representante']
    )
    const [enrollmentResult] = await connection.query(
      'INSERT INTO preinscripciones (id_r_a_d, id_r_g_s, id_periodo) VALUES (?, ?, ?)',
      [studentDocumentRelation.insertId, relationId, finalPeriodoId]
    )
    if (grade.cupos_disponibles !== null) {
      const [capacityUpdate] = await connection.query(
        'UPDATE grados SET cupos_disponibles = cupos_disponibles - 1 WHERE id = ? AND cupos_disponibles > 0',
        [grade.id]
      )
      if (capacityUpdate.affectedRows !== 1) {
        const error = new Error('El grado seleccionado no tiene cupos disponibles.')
        error.code = 'NO_CUPOS'
        throw error
      }
    }

    return {
      id_alumno: studentResult.insertId,
      id_representante: representativeId,
      id_documento: studentDocumentId,
      id_documento_cedula: cedulaDocumentId,
      id_preinscripcion: enrollmentResult.insertId,
      grado_id: grade.id,
      grado_nombre: grade.nombre_grado,
      seccion_id: section.id,
      seccion_nombre: section.nombre_seccion
    }
}

async function insertExistingStudentEnrollment(connection, formData, selectedSectionId) {
  const [[alumno]] = await connection.query(
    'SELECT id, id_representante, nombres, apellidos FROM alumno WHERE id = ? FOR UPDATE',
    [Number(formData.alumno_id)]
  )
  if (!alumno) {
    const error = new Error('El alumno de esta solicitud ya no está registrado.')
    error.code = 'STUDENT_NOT_FOUND'
    throw error
  }

  const [[currentEnrollment]] = await connection.query(
    `SELECT p.id, p.id_r_a_d, p.id_periodo
       FROM preinscripciones p
       JOIN r_a_d rad ON rad.id = p.id_r_a_d
      WHERE rad.id_alumno = ?
      ORDER BY p.id DESC
      LIMIT 1
      FOR UPDATE`,
    [alumno.id]
  )
  if (!currentEnrollment ||
      Number(currentEnrollment.id) !== Number(formData.current_preinscripcion_id) ||
      Number(currentEnrollment.id_periodo) !== Number(formData.periodo_id) ||
      Number(currentEnrollment.id_r_a_d) !== Number(formData.id_r_a_d)) {
    const error = new Error('La inscripción actual del alumno cambió desde que se envió la solicitud. Actualiza la solicitud antes de aprobarla.')
    error.code = 'STUDENT_ENROLLMENT_CHANGED'
    throw error
  }
  const [[currentGrade]] = await connection.query(
    `SELECT rgs.id_grado
       FROM r_g_s rgs
      WHERE rgs.id = (
        SELECT p.id_r_g_s FROM preinscripciones p WHERE p.id = ?
      )`,
    [currentEnrollment.id]
  )
  if (Number(currentGrade?.id_grado) === Number(formData.grado_id)) {
    const error = new Error('El grado solicitado debe ser distinto al grado actual del alumno.')
    error.code = 'GRADE_UNCHANGED'
    throw error
  }

  const [[grade]] = await connection.query(
    'SELECT id, nombre_grado, cupos_disponibles FROM grados WHERE id = ? FOR UPDATE',
    [Number(formData.grado_id)]
  )
  if (!grade) {
    const error = new Error('El grado solicitado ya no está disponible.')
    error.code = 'GRADE_NOT_FOUND'
    throw error
  }
  if (grade.cupos_disponibles !== null && Number(grade.cupos_disponibles) <= 0) {
    const error = new Error('El grado solicitado no tiene cupos disponibles.')
    error.code = 'NO_CUPOS'
    throw error
  }

  const [[section]] = await connection.query(
    `SELECT s.id, s.nombre_seccion, rgs.id AS id_r_g_s
       FROM r_g_s rgs
       JOIN seccion s ON s.id = rgs.id_seccion
      WHERE rgs.id_grado = ? AND rgs.id_seccion = ?
      LIMIT 1`,
    [grade.id, Number(selectedSectionId)]
  )
  if (!section) {
    const error = new Error('La sección seleccionada no pertenece al grado solicitado.')
    error.code = 'SECTION_NOT_FOUND'
    throw error
  }

  const [enrollmentResult] = await connection.query(
    'INSERT INTO preinscripciones (id_r_a_d, id_r_g_s, id_periodo) VALUES (?, ?, ?)',
    [currentEnrollment.id_r_a_d, section.id_r_g_s, currentEnrollment.id_periodo]
  )
  if (grade.cupos_disponibles !== null) {
    const [capacityUpdate] = await connection.query(
      'UPDATE grados SET cupos_disponibles = cupos_disponibles - 1 WHERE id = ? AND cupos_disponibles > 0',
      [grade.id]
    )
    if (capacityUpdate.affectedRows !== 1) {
      const error = new Error('El grado solicitado ya no tiene cupos disponibles.')
      error.code = 'NO_CUPOS'
      throw error
    }
  }
  if (currentGrade?.id_grado) {
    await connection.query(
      `UPDATE grados
          SET cupos_disponibles = cupos_disponibles + 1
        WHERE id = ? AND cupos_disponibles IS NOT NULL`,
      [Number(currentGrade.id_grado)]
    )
  }

  return {
    id_alumno: Number(alumno.id),
    id_representante: Number(alumno.id_representante),
    id_preinscripcion: enrollmentResult.insertId,
    grado_id: Number(grade.id),
    grado_nombre: grade.nombre_grado,
    seccion_id: Number(section.id),
    seccion_nombre: section.nombre_seccion,
    periodo_id: Number(currentEnrollment.id_periodo)
  }
}

async function getAllSolicitudes() {
  const [rows] = await db.query(
    `SELECT solicitud.*
       FROM solicitudes_preinscripciones solicitud
      WHERE NOT (
        solicitud.estado IN ('Aprobado', 'Inscrito Activo')
        AND solicitud.id_alumno IS NOT NULL
        AND EXISTS (
          SELECT 1
            FROM solicitudes_preinscripciones solicitud_reciente
           WHERE solicitud_reciente.id_alumno = solicitud.id_alumno
             AND solicitud_reciente.estado IN ('Aprobado', 'Inscrito Activo')
             AND (
               COALESCE(solicitud_reciente.id_preinscripcion, 0) >
                 COALESCE(solicitud.id_preinscripcion, 0)
               OR (
                 COALESCE(solicitud_reciente.id_preinscripcion, 0) =
                   COALESCE(solicitud.id_preinscripcion, 0)
                 AND solicitud_reciente.id > solicitud.id
               )
             )
        )
      )
      ORDER BY solicitud.creado_en DESC`
  );
  return Promise.all(rows.map(hydrateSolicitud));
}

async function getSolicitudById(id) {
  const [rows] = await db.query(
    `SELECT * FROM solicitudes_preinscripciones WHERE id = ?`,
    [id]
  );
  return rows[0] ? hydrateSolicitud(rows[0]) : undefined;
}

async function hydrateSolicitud(solicitud) {
  if (solicitud.estado !== 'Pendiente') return solicitud;
  const staged = await pendingSolicitudStorage.readPendingSolicitud(solicitud.id);
  if (!staged) return solicitud;
  const formData = staged.formData;
  const attachments = {
    foto_cedula: formData.foto_cedula || null,
    foto_alumno: formData.foto_alumno || null
  };
  return {
    ...solicitud,
    tipo_solicitud: formData.tipo_solicitud || 'nuevo_ingreso',
    nombre_completo: `${formData.nombres || ''} ${formData.apellidos || ''}`.trim() || solicitud.nombre_completo,
    documento: formData.documento || solicitud.documento,
    telefono: formData.telefono || solicitud.telefono,
    correo: formData.correo || solicitud.correo,
    contacto: formData.telefono || solicitud.contacto,
    documentos: attachments,
    inscripcion_formal: formData
  };
}

async function approveSolicitud(id, aprobado_por, userId, selectedSectionId, selectedStatusId, selectedMovementId) {
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [[solicitud]] = await connection.query(
      'SELECT * FROM solicitudes_preinscripciones WHERE id = ? FOR UPDATE',
      [id]
    )
    if (!solicitud) {
      const error = new Error('Solicitud no encontrada.')
      error.code = 'NOT_FOUND'
      throw error
    }
    if (solicitud.estado !== 'Pendiente') {
      const error = new Error('Esta solicitud ya fue procesada.')
      error.code = 'INVALID_STATE'
      throw error
    }

    const pendingData = await pendingSolicitudStorage.readPendingSolicitud(id)
    const formData = pendingData?.formData
    const isExistingStudentRequest = formData?.tipo_solicitud === 'preinscripcion_existente'
    if (!formData?.nombres || (!formData?.grado_id && !formData?.grado_nombre) ||
        !Number.isInteger(Number(selectedSectionId)) || Number(selectedSectionId) <= 0 ||
        (!isExistingStudentRequest &&
          (!Number.isInteger(Number(selectedStatusId)) || Number(selectedStatusId) <= 0 ||
           !Number.isInteger(Number(selectedMovementId)) || Number(selectedMovementId) <= 0))) {
      const error = new Error('La solicitud no contiene todos los datos necesarios para inscribir al alumno.')
      error.code = 'FORM_DATA_MISSING'
      throw error
    }

    const enrolled = isExistingStudentRequest
      ? await insertExistingStudentEnrollment(connection, formData, selectedSectionId)
      : await insertAdminEnrollment(connection, {
          ...formData,
          seccion_id: Number(selectedSectionId),
          status_id: Number(selectedStatusId),
          movimiento_id: Number(selectedMovementId),
          foto_cedula: pendingData.files.foto_cedula,
          foto_alumno: pendingData.files.foto_alumno,
          userId: userId || null
        })
    const approvedFormData = {
      ...formData,
      grado_id: enrolled.grado_id,
      grado_nombre: enrolled.grado_nombre,
      seccion_id: enrolled.seccion_id,
      seccion_nombre: enrolled.seccion_nombre
    }
    const [updateResult] = await connection.query(
      `UPDATE solicitudes_preinscripciones
          SET nombre_completo = ?, documento = ?, telefono = ?, correo = ?, contacto = ?,
              documentos = ?, inscripcion_formal = ?, estado = 'Aprobado', aprobado_por = ?,
              id_alumno = ?, id_preinscripcion = ?, id_user = ?, actualizado_en = NOW()
        WHERE id = ? AND estado = 'Pendiente'`,
      [
        `${formData.nombres} ${formData.apellidos}`.trim(),
        formData.documento,
        formData.telefono,
        formData.correo,
        formData.telefono,
        JSON.stringify(isExistingStudentRequest ? {} : {
          foto_cedula: formData.foto_cedula || null,
          foto_alumno: formData.foto_alumno || null
        }),
        JSON.stringify(approvedFormData),
        aprobado_por,
        enrolled.id_alumno,
        enrolled.id_preinscripcion,
        userId || null,
        id
      ]
    )
    if (updateResult.affectedRows !== 1) {
      const error = new Error('La solicitud ya fue procesada por otro administrador.')
      error.code = 'INVALID_STATE'
      throw error
    }
    const supersededRequestIds = []
    let supersededEnrollmentIds = []
    if (isExistingStudentRequest) {
      const [previousEnrollments] = await connection.query(
        `SELECT p.id
           FROM preinscripciones p
           JOIN r_a_d rad ON rad.id = p.id_r_a_d
          WHERE rad.id_alumno = ? AND p.id <> ?
          FOR UPDATE`,
        [enrolled.id_alumno, enrolled.id_preinscripcion]
      )
      supersededEnrollmentIds = previousEnrollments.map((row) => Number(row.id))

      const enrollmentClause = supersededEnrollmentIds.length
        ? ` OR id_preinscripcion IN (${supersededEnrollmentIds.map(() => '?').join(', ')})`
        : ''
      const [previousRequests] = await connection.query(
        `SELECT id
           FROM solicitudes_preinscripciones
          WHERE id <> ? AND (id_alumno = ?${enrollmentClause})
          FOR UPDATE`,
        [Number(id), enrolled.id_alumno, ...supersededEnrollmentIds]
      )
      supersededRequestIds.push(...previousRequests.map((row) => Number(row.id)))

      if (supersededRequestIds.length) {
        await connection.query(
          `DELETE FROM solicitudes_preinscripciones
            WHERE id IN (${supersededRequestIds.map(() => '?').join(', ')})`,
          supersededRequestIds
        )
      }
      if (supersededEnrollmentIds.length) {
        await connection.query(
          `DELETE FROM preinscripciones
            WHERE id IN (${supersededEnrollmentIds.map(() => '?').join(', ')})`,
          supersededEnrollmentIds
        )
      }
    }
    await connection.commit()
    const temporalCleanupErrors = []
    for (const requestId of [Number(id), ...supersededRequestIds]) {
      try {
        await pendingSolicitudStorage.removePendingSolicitud(requestId)
      } catch (cleanupError) {
        temporalCleanupErrors.push(cleanupError.message)
        console.error(`La solicitud #${requestId} fue procesada, pero no se pudo eliminar su archivo temporal:`, cleanupError)
      }
    }
    return {
      ...await getSolicitudById(id),
      ...enrolled,
      temporal_cleanup_error: temporalCleanupErrors.length ? temporalCleanupErrors.join('; ') : null
    }
  } catch (error) {
    try {
      await connection.rollback()
    } catch (rollbackError) {
      console.error('No se pudo revertir la aprobación de la solicitud:', {
        code: rollbackError.code,
        message: rollbackError.message
      })
    }
    throw error
  } finally {
    connection.release()
  }
}

async function submitInscripcion(id, inscripcion_formal) {
  const solicitud = await getSolicitudById(id);
  if (!solicitud) {
    throw new Error('NOT_FOUND');
  }
  if (solicitud.estado !== 'Aprobado') {
    throw new Error('NOT_APPROVED');
  }

  await db.query(
    `UPDATE solicitudes_preinscripciones
       SET estado = 'Inscrito Activo', inscripcion_formal = ?, actualizado_en = NOW()
     WHERE id = ?`,
    [JSON.stringify(inscripcion_formal), id]
  );
  return getSolicitudById(id);
}

async function updateSolicitud(id, data) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[solicitud]] = await connection.query(
      'SELECT id, estado, documentos FROM solicitudes_preinscripciones WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!solicitud) {
      const error = new Error('Solicitud no encontrada.');
      error.code = 'NOT_FOUND';
      throw error;
    }
    if (solicitud.estado !== 'Pendiente') {
      const error = new Error('Solo se pueden editar solicitudes pendientes.');
      error.code = 'INVALID_STATE';
      throw error;
    }

    const formData = typeof data.inscripcion_formal === 'string'
      ? JSON.parse(data.inscripcion_formal)
      : data.inscripcion_formal;
    delete formData.seccion_id;
    delete formData.seccion_nombre;
    const staged = await pendingSolicitudStorage.readPendingSolicitud(id);
    if (!staged) {
      const error = new Error('No se encontraron los datos temporales de esta solicitud.');
      error.code = 'PENDING_DATA_NOT_FOUND';
      throw error;
    }
    if (staged.formData.tipo_solicitud === 'preinscripcion_existente') {
      const requestedGradeId = Number(formData.grado_id);
      if (!Number.isInteger(requestedGradeId) || requestedGradeId <= 0 ||
          Number(formData.alumno_id) !== Number(staged.formData.alumno_id) ||
          Number(formData.periodo_id) !== Number(staged.formData.periodo_id) ||
          Number(formData.current_preinscripcion_id) !== Number(staged.formData.current_preinscripcion_id) ||
          Number(formData.id_r_a_d) !== Number(staged.formData.id_r_a_d)) {
        const error = new Error('Solo se puede modificar el grado solicitado para esta preinscripción.')
        error.code = 'INVALID_PREINSCRIPTION_EDIT'
        throw error
      }
      const [[grade]] = await connection.query(
        'SELECT id, nombre_grado, cupos_disponibles FROM grados WHERE id = ?',
        [requestedGradeId]
      )
      if (!grade) {
        const error = new Error('El grado seleccionado ya no está disponible.')
        error.code = 'GRADE_NOT_FOUND'
        throw error
      }
      if (grade.cupos_disponibles !== null && Number(grade.cupos_disponibles) <= 0) {
        const error = new Error('El grado seleccionado no tiene cupos disponibles.')
        error.code = 'NO_CUPOS'
        throw error
      }
      const [[availableSection]] = await connection.query(
        'SELECT id FROM r_g_s WHERE id_grado = ? LIMIT 1',
        [grade.id]
      )
      if (!availableSection) {
        const error = new Error('El grado seleccionado no tiene secciones disponibles.')
        error.code = 'SECTION_NOT_FOUND'
        throw error
      }
      const [[currentEnrollment]] = await connection.query(
        `SELECT rgs.id_grado
           FROM preinscripciones p
           JOIN r_g_s rgs ON rgs.id = p.id_r_g_s
          WHERE p.id = ?`,
        [staged.formData.current_preinscripcion_id]
      )
      if (Number(currentEnrollment?.id_grado) === Number(grade.id)) {
        const error = new Error('El grado solicitado debe ser distinto al grado actual del alumno.')
        error.code = 'GRADE_UNCHANGED'
        throw error
      }
      const updatedFormData = {
        ...staged.formData,
        grado_id: Number(grade.id),
        grado_nombre: grade.nombre_grado
      }
      await pendingSolicitudStorage.writePendingSolicitud(id, updatedFormData, staged.files)
      await connection.query(
        'UPDATE solicitudes_preinscripciones SET actualizado_en = NOW() WHERE id = ?',
        [id]
      )
      await connection.commit()
      return await getSolicitudById(id)
    }
    await pendingSolicitudStorage.writePendingSolicitud(id, formData, staged.files);
    await connection.query(
      'UPDATE solicitudes_preinscripciones SET actualizado_en = NOW() WHERE id = ?',
      [id]
    );
    await connection.commit();
    return await getSolicitudById(id);
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('No se pudo revertir la actualización de la solicitud:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteSolicitudes(ids) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT id, estado FROM solicitudes_preinscripciones
        WHERE id IN (${ids.map(() => '?').join(', ')}) FOR UPDATE`,
      ids
    );
    if (rows.length !== ids.length) {
      const error = new Error('Una o más solicitudes seleccionadas ya no existen.');
      error.code = 'NOT_FOUND';
      throw error;
    }
    if (rows.some((row) => row.estado !== 'Pendiente')) {
      const error = new Error('Solo se pueden eliminar solicitudes pendientes. Las solicitudes procesadas se conservan como historial.');
      error.code = 'INVALID_STATE';
      throw error;
    }
    await connection.query(
      `DELETE FROM solicitudes_preinscripciones
        WHERE id IN (${ids.map(() => '?').join(', ')})`,
      ids
    );
    await connection.commit();
    const cleanupErrors = [];
    for (const id of ids) {
      try {
        await pendingSolicitudStorage.removePendingSolicitud(id);
      } catch (error) {
        cleanupErrors.push({ id, message: error.message });
        console.error(`No se pudo eliminar el archivo temporal de la solicitud #${id}:`, error);
      }
    }
    return { deleted: ids.length, cleanupErrors };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('No se pudo revertir la eliminación de solicitudes:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  createSolicitud,
  createPendingAdminInscripcion,
  createPendingExistingStudentPreinscripcion,
  getRepresentativePreinscriptionStudents,
  insertAdminEnrollment,
  getAllSolicitudes,
  getSolicitudById,
  approveSolicitud,
  submitInscripcion,
  updateSolicitud,
  deleteSolicitudes
};
