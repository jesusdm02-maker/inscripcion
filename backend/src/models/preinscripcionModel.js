const db = require('../db');

async function getAllPreinscripciones() {
  const [rows] = await db.query(
    `SELECT p.id AS id_preinscripcion,
      a.id AS alumno_id,
      r.id AS representante_id,
      r.id_telefono AS telefono_id,
      r.id_direccion AS direccion_id,
      DATE_FORMAT(a.fecha_nacimiento, '%Y-%m-%d') AS fecha_nacimiento,
      a.nombres,
      a.apellidos,
      a.alergias_condiciones,
      r.nombres AS representante_nombre,
      r.apellidos AS representante_apellido,
      r.cedula AS representante_cedula,
      r.parentesco AS representante_parentesco,
      t.numero_telefono AS telefono,
      d.municipio AS direccion_municipio,
      d.calle AS direccion_calle,
      d.avenida AS direccion_avenida,
      d.num_casa AS direccion_num_casa,
      (SELECT s.documento
         FROM solicitudes_preinscripciones s
        WHERE (s.id_preinscripcion = p.id OR s.id_alumno = rad.id_alumno)
          AND s.documento NOT LIKE 'PENDIENTE-%'
        ORDER BY (s.id_preinscripcion = p.id) DESC, s.id DESC
        LIMIT 1) AS documento,
      (SELECT s.correo
         FROM solicitudes_preinscripciones s
        WHERE s.id_preinscripcion = p.id OR s.id_alumno = rad.id_alumno
        ORDER BY (s.id_preinscripcion = p.id) DESC, s.id DESC
        LIMIT 1) AS correo,
      rgs.id_grado AS grado_id,
      rgs.id_seccion AS seccion_id,
      p.id_periodo AS periodo_id,
      CONCAT(a.nombres, ' ', a.apellidos) AS alumno,
      g.nombre_grado,
      sec.nombre_seccion,
      per.fecha_inicio AS periodo,
      (SELECT u.nombre
         FROM solicitudes_preinscripciones su
         LEFT JOIN \`user\` u ON u.id = su.id_user
        WHERE su.id_preinscripcion = p.id
        ORDER BY su.id DESC
        LIMIT 1) AS usuario
     FROM preinscripciones p
    LEFT JOIN r_a_d rad ON p.id_r_a_d = rad.id
    LEFT JOIN alumno a ON rad.id_alumno = a.id
    LEFT JOIN representantes r ON a.id_representante = r.id
    LEFT JOIN telefono t ON r.id_telefono = t.id
    LEFT JOIN direccion d ON r.id_direccion = d.id
     LEFT JOIN r_g_s rgs ON p.id_r_g_s = rgs.id
     LEFT JOIN grados g ON rgs.id_grado = g.id
     LEFT JOIN seccion sec ON rgs.id_seccion = sec.id
     LEFT JOIN periodo per ON p.id_periodo = per.id
    WHERE rad.id_alumno IS NULL
       OR NOT EXISTS (
         SELECT 1
           FROM preinscripciones latest
           JOIN r_a_d latest_rad ON latest_rad.id = latest.id_r_a_d
          WHERE latest_rad.id_alumno = rad.id_alumno
            AND latest.id > p.id
       )`
  );
  return rows;
}

async function updatePreinscripcion(id, data, approvedSolicitudId = null) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[enrollment]] = await connection.query(
      `SELECT p.id, p.id_r_a_d, p.id_r_g_s, p.id_periodo,
              rad.id_alumno, a.id_representante,
              r.id_telefono, r.id_direccion,
              rgs.id_grado AS grado_actual_id
         FROM preinscripciones p
         JOIN r_a_d rad ON rad.id = p.id_r_a_d
         JOIN alumno a ON a.id = rad.id_alumno
         JOIN representantes r ON r.id = a.id_representante
         LEFT JOIN r_g_s rgs ON rgs.id = p.id_r_g_s
        WHERE p.id = ?
        FOR UPDATE`,
      [id]
    );
    if (!enrollment) {
      const error = new Error('La preinscripción seleccionada ya no existe.');
      error.code = 'NOT_FOUND';
      throw error;
    }
    if (approvedSolicitudId !== null) {
      const [[request]] = await connection.query(
        `SELECT id, estado, id_preinscripcion
           FROM solicitudes_preinscripciones
          WHERE id = ?
          FOR UPDATE`,
        [Number(approvedSolicitudId)]
      )
      if (!request || request.estado !== 'Aprobado' || Number(request.id_preinscripcion) !== Number(id)) {
        const error = new Error('Solo se pueden editar solicitudes aprobadas vinculadas a esta inscripción.')
        error.code = 'INVALID_APPROVED_REQUEST'
        throw error
      }
    }

    const [[grade]] = await connection.query(
      'SELECT id, nombre_grado, cupos_disponibles FROM grados WHERE id = ? FOR UPDATE',
      [data.grado_id]
    );
    if (!grade) {
      const error = new Error('El grado seleccionado no existe.');
      error.code = 'GRADE_NOT_FOUND';
      throw error;
    }
    const [[gradeSection]] = await connection.query(
      `SELECT rgs.id, sec.nombre_seccion
         FROM r_g_s rgs
         JOIN seccion sec ON sec.id = rgs.id_seccion
        WHERE rgs.id_grado = ? AND rgs.id_seccion = ?
        LIMIT 1`,
      [grade.id, data.seccion_id]
    );
    if (!gradeSection) {
      const error = new Error('La sección seleccionada no pertenece al grado indicado.');
      error.code = 'SECTION_NOT_FOUND';
      throw error;
    }
    const [[period]] = await connection.query(
      'SELECT id, fecha_inicio FROM periodo WHERE id = ?',
      [data.periodo_id]
    );
    if (!period) {
      const error = new Error('El período seleccionado no existe.');
      error.code = 'PERIOD_NOT_FOUND';
      throw error;
    }

    const currentGradeId = Number(enrollment.grado_actual_id);
    const nextGradeId = Number(grade.id);
    if (currentGradeId !== nextGradeId && grade.cupos_disponibles !== null &&
        Number(grade.cupos_disponibles) <= 0) {
      const error = new Error('El grado seleccionado no tiene cupos disponibles.');
      error.code = 'NO_CUPOS';
      throw error;
    }

    let addressId = enrollment.id_direccion;
    if (addressId) {
      const [[{ shared: sharedAddress }]] = await connection.query(
        'SELECT COUNT(*) > 1 AS shared FROM representantes WHERE id_direccion = ?',
        [addressId]
      );
      if (sharedAddress) {
        const [result] = await connection.query(
          'INSERT INTO direccion (municipio, calle, avenida, num_casa) VALUES (?, ?, ?, ?)',
          [data.direccion_municipio, data.direccion_calle, data.direccion_avenida, data.direccion_num_casa]
        );
        addressId = result.insertId;
      } else {
        await connection.query(
          'UPDATE direccion SET municipio = ?, calle = ?, avenida = ?, num_casa = ? WHERE id = ?',
          [data.direccion_municipio, data.direccion_calle, data.direccion_avenida, data.direccion_num_casa, addressId]
        );
      }
    } else {
      const [result] = await connection.query(
        'INSERT INTO direccion (municipio, calle, avenida, num_casa) VALUES (?, ?, ?, ?)',
        [data.direccion_municipio, data.direccion_calle, data.direccion_avenida, data.direccion_num_casa]
      );
      addressId = result.insertId;
    }

    let phoneId = enrollment.id_telefono;
    if (phoneId) {
      const [[{ shared: sharedPhone }]] = await connection.query(
        'SELECT COUNT(*) > 1 AS shared FROM representantes WHERE id_telefono = ?',
        [phoneId]
      );
      if (sharedPhone) {
        const [result] = await connection.query(
          'INSERT INTO telefono (numero_telefono) VALUES (?)',
          [data.telefono]
        );
        phoneId = result.insertId;
      } else {
        await connection.query(
          'UPDATE telefono SET numero_telefono = ? WHERE id = ?',
          [data.telefono, phoneId]
        );
      }
    } else {
      const [result] = await connection.query(
        'INSERT INTO telefono (numero_telefono) VALUES (?)',
        [data.telefono]
      );
      phoneId = result.insertId;
    }

    await connection.query(
      `UPDATE representantes
          SET nombres = ?, apellidos = ?, cedula = ?, parentesco = ?,
              id_direccion = ?, id_telefono = ?
        WHERE id = ?`,
      [
        data.representante_nombre,
        data.representante_apellido,
        data.representante_cedula,
        data.representante_parentesco,
        addressId,
        phoneId,
        enrollment.id_representante
      ]
    );
    await connection.query(
      `UPDATE alumno
          SET nombres = ?, apellidos = ?, fecha_nacimiento = ?, alergias_condiciones = ?
        WHERE id = ?`,
      [
        data.nombres,
        data.apellidos,
        data.fecha_nacimiento,
        data.alergias_condiciones || null,
        enrollment.id_alumno
      ]
    );

    if (currentGradeId !== nextGradeId) {
      if (grade.cupos_disponibles !== null) {
        const [capacityUpdate] = await connection.query(
          'UPDATE grados SET cupos_disponibles = cupos_disponibles - 1 WHERE id = ? AND cupos_disponibles > 0',
          [nextGradeId]
        );
        if (capacityUpdate.affectedRows !== 1) {
          const error = new Error('El grado seleccionado ya no tiene cupos disponibles.');
          error.code = 'NO_CUPOS';
          throw error;
        }
      }
      if (currentGradeId) {
        await connection.query(
          `UPDATE grados
              SET cupos_disponibles = cupos_disponibles + 1
            WHERE id = ? AND cupos_disponibles IS NOT NULL`,
          [currentGradeId]
        );
      }
    }

    await connection.query(
      'UPDATE preinscripciones SET id_r_g_s = ?, id_periodo = ? WHERE id = ?',
      [gradeSection.id, data.periodo_id, id]
    );

    const [relatedRequests] = await connection.query(
      `SELECT id, inscripcion_formal
         FROM solicitudes_preinscripciones
        WHERE id_preinscripcion = ? OR id_alumno = ?
        ORDER BY (id_preinscripcion = ?) DESC, id DESC
        LIMIT 1
        FOR UPDATE`,
      [id, enrollment.id_alumno, id]
    );
    const updatedForm = {
      ...data,
      alumno_id: Number(enrollment.id_alumno),
      grado_id: nextGradeId,
      grado_nombre: grade.nombre_grado,
      seccion_id: Number(data.seccion_id),
      seccion_nombre: gradeSection.nombre_seccion,
      periodo_id: Number(data.periodo_id),
      fecha_inicio: period.fecha_inicio
    };
    for (const request of relatedRequests) {
      let originalForm = request.inscripcion_formal || {};
      if (typeof originalForm === 'string') {
        try {
          originalForm = JSON.parse(originalForm);
        } catch (error) {
          console.error(`No se pudo interpretar la información de la solicitud ${request.id} al actualizar la preinscripción:`, error);
          originalForm = {};
        }
      }
      await connection.query(
        `UPDATE solicitudes_preinscripciones
            SET nombre_completo = ?, documento = ?, telefono = ?, correo = ?, contacto = ?,
                inscripcion_formal = ?, actualizado_en = NOW()
          WHERE id = ?`,
        [
          `${data.nombres} ${data.apellidos}`.trim(),
          data.documento,
          data.telefono,
          data.correo,
          data.telefono,
          JSON.stringify({ ...originalForm, ...updatedForm }),
          request.id
        ]
      );
    }

    await connection.commit();
    return { id_preinscripcion: Number(id), ...updatedForm };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('No se pudo revertir la actualización de la preinscripción:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function deletePreinscripcion(id) {
  await deletePreinscripciones([id]);
  return { deleted: Number(id) };
}

async function deletePreinscripciones(ids) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const placeholders = ids.map(() => '?').join(', ');
    const [enrollments] = await connection.query(
      `SELECT p.id, rgs.id_grado
         FROM preinscripciones p
         LEFT JOIN r_g_s rgs ON rgs.id = p.id_r_g_s
        WHERE p.id IN (${placeholders})
        ORDER BY p.id
        FOR UPDATE`,
      ids
    );
    if (enrollments.length !== ids.length) {
      const error = new Error('Una o más preinscripciones seleccionadas ya no existen.');
      error.code = 'NOT_FOUND';
      throw error;
    }

    const gradeCounts = new Map();
    for (const enrollment of enrollments) {
      if (!enrollment.id_grado) continue;
      gradeCounts.set(enrollment.id_grado, (gradeCounts.get(enrollment.id_grado) || 0) + 1);
    }
    for (const [gradeId, count] of gradeCounts) {
      await connection.query(
        `UPDATE grados
            SET cupos_disponibles = cupos_disponibles + ?
          WHERE id = ? AND cupos_disponibles IS NOT NULL`,
        [count, gradeId]
      );
    }
    await connection.query(
      `UPDATE solicitudes_preinscripciones
          SET estado = CASE WHEN estado IN ('Aprobado', 'Inscrito Activo') THEN 'Cancelada' ELSE estado END,
              id_preinscripcion = NULL,
              actualizado_en = NOW()
        WHERE id_preinscripcion IN (${placeholders})`,
      ids
    );
    await connection.query(
      `DELETE FROM preinscripciones WHERE id IN (${placeholders})`,
      ids
    );
    await connection.commit();
    return { deleted: ids };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error('No se pudo revertir la eliminación de la preinscripción:', rollbackError.message);
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function getCatalogos() {
  const [gradosRows] = await db.query(
    `SELECT g.id,
            g.nombre_grado,
            g.cupos_disponibles
       FROM grados g
       ORDER BY g.id`
  );

  const [seccionRows] = await db.query(
    `SELECT DISTINCT rgs.id_grado,
            s.id,
            s.nombre_seccion
       FROM r_g_s rgs
       JOIN seccion s ON s.id = rgs.id_seccion
       ORDER BY rgs.id_grado, s.id`
  );

  const [periodos] = await db.query(
    `SELECT id, fecha_inicio
       FROM periodo
       ORDER BY id`
  );

  const seccionesPorGrado = {};
  for (const row of seccionRows) {
    if (!seccionesPorGrado[row.id_grado]) {
      seccionesPorGrado[row.id_grado] = [];
    }
    seccionesPorGrado[row.id_grado].push({
      id_seccion: row.id,
      nombre_seccion: row.nombre_seccion
    });
  }

  const grados = gradosRows.map((grado) => ({
    ...grado,
    secciones: seccionesPorGrado[grado.id] || []
  }));

  const secciones = Object.values(seccionesPorGrado).flat();

  return { grados, secciones, periodos };
}

module.exports = {
  getAllPreinscripciones,
  getCatalogos,
  updatePreinscripcion,
  deletePreinscripcion,
  deletePreinscripciones
};
