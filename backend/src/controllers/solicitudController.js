const Solicitud = require('../models/solicitudModel');
const Preinscripcion = require('../models/preinscripcionModel')
const RBAC = require('../models/rbacModel')

async function create(req, res) {
  const { nombre_completo, documento, telefono, correo, contacto, documentos } = req.body;
  if (!nombre_completo || !documento || !telefono || !correo || !contacto) {
    return res.status(400).json({ error: 'Todos los campos básicos son requeridos' });
  }

  try {
    const solicitud = await Solicitud.createSolicitud({ nombre_completo, documento, telefono, correo, contacto, documentos });
    res.status(201).json(solicitud);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear la solicitud de preinscripción' });
  }
}

async function createAdminInscripcion(req, res) {
  const payload = req.body || {}
  const uploadedFiles = req.files || {}
  const filePayload = {
    foto_cedula: uploadedFiles.foto_cedula?.[0] || payload.foto_cedula || null,
    foto_alumno: uploadedFiles.foto_alumno?.[0] || payload.foto_alumno || null
  }

  const requiredFields = [
    'nombres', 'apellidos', 'fecha_nacimiento', 'alergias_condiciones', 'documento',
    'representante_nombre', 'representante_apellido', 'representante_cedula', 'representante_parentesco',
    'telefono', 'correo', 'direccion_municipio', 'direccion_calle',
    'direccion_avenida', 'direccion_num_casa', 'grado_nombre', 'fecha_inicio'
  ]
  const missingFields = requiredFields.filter((field) => !String(payload[field] || '').trim())
  if (missingFields.length > 0) {
    const fieldLabels = {
      nombres: 'nombres del alumno',
      apellidos: 'apellidos del alumno',
      fecha_nacimiento: 'fecha de nacimiento',
      alergias_condiciones: 'alergias o condiciones médicas',
      documento: 'documento del alumno',
      representante_nombre: 'nombre del representante',
      representante_apellido: 'apellido del representante',
      representante_cedula: 'cédula del representante',
      representante_parentesco: 'parentesco',
      telefono: 'teléfono',
      correo: 'correo electrónico',
      direccion_municipio: 'municipio',
      direccion_calle: 'calle',
      direccion_avenida: 'avenida',
      direccion_num_casa: 'número de casa',
      grado_nombre: 'grado',
      fecha_inicio: 'período de ingreso'
    }
    const missingLabels = missingFields.map((field) => fieldLabels[field] || field)
    return res.status(400).json({
      error: `Completa los siguientes campos obligatorios: ${missingLabels.join(', ')}.`,
      missing_fields: missingFields
    })
  }
  if (!filePayload.foto_cedula) {
    return res.status(400).json({ error: 'Adjunta la foto de la cédula del representante.' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.correo)) {
    return res.status(400).json({ error: 'Ingresa un correo electrónico válido.' })
  }

  try {
    const userId = req.header('x-user-id') || req.body?.userId || null
    const result = await Solicitud.createPendingAdminInscripcion({
      ...payload,
      contacto: String(payload.telefono).trim(),
      ...filePayload,
      userId
    })
    res.status(201).json(result)
  } catch (err) {
    console.error('No se pudo guardar la solicitud pendiente:', {
      code: err.code,
      message: err.message,
      errno: err.errno,
      sqlState: err.sqlState
    })
    if (['GRADE_NOT_FOUND', 'SECTION_NOT_FOUND', 'NO_CUPOS'].includes(err.code)) {
      return res.status(400).json({ error: err.message })
    }
    if (err.code === 'ER_DATA_TOO_LONG') {
      return res.status(400).json({ error: 'Uno de los datos excede la longitud permitida. Revisa las cédulas y los campos de dirección.' })
    }
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Ya existe un registro con esos datos de identidad. Verifica la cédula del representante e inténtalo de nuevo.' })
    }
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ error: 'El grado, la sección o el usuario seleccionado ya no está disponible. Actualiza la página e inténtalo de nuevo.' })
    }
    res.status(500).json({ error: 'No se pudo guardar la solicitud de nuevo ingreso.' })
  }
}

async function createExistingStudentPreinscripcion(req, res) {
  try {
    const representative = await RBAC.userHasRole(req.authenticatedUserId, 'representante')
    const gradoId = Number(req.body?.grado_id)
    const representativeCedula = String(req.body?.representante_cedula || '').trim()
    const alumnoId = Number(req.body?.alumno_id)
    if (!Number.isInteger(gradoId) || gradoId <= 0 ||
        (representative
          ? !representativeCedula || representativeCedula.length > 20 || !Number.isInteger(alumnoId) || alumnoId <= 0
          : !Number.isInteger(alumnoId) || alumnoId <= 0)) {
      return res.status(400).json({
        error: representative
          ? 'Escribe la cédula del representante, selecciona un alumno y el grado solicitado.'
          : 'Selecciona un alumno registrado y el grado que solicita.'
      })
    }
    const userId = req.authenticatedUserId
    const solicitud = await Solicitud.createPendingExistingStudentPreinscripcion(
      representative ? null : alumnoId,
      gradoId,
      userId,
      representative ? { userId, cedula: representativeCedula, alumnoId } : null
    )
    res.status(201).json(solicitud)
  } catch (err) {
    console.error('No se pudo guardar la preinscripción pendiente de un alumno existente:', {
      code: err.code,
      message: err.message
    })
    if (['STUDENT_NOT_FOUND', 'STUDENT_ENROLLMENT_NOT_FOUND', 'GRADE_NOT_FOUND', 'SECTION_NOT_FOUND', 'NO_CUPOS', 'GRADE_UNCHANGED', 'GRADE_BEFORE_CURRENT'].includes(err.code)) {
      return res.status(400).json({ error: err.message })
    }
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ error: 'El alumno o grado seleccionado ya no está disponible. Actualiza la página e inténtalo de nuevo.' })
    }
    res.status(500).json({ error: 'No se pudo crear la solicitud de preinscripción.' })
  }
}

async function getRepresentativePreinscriptionStudents(req, res) {
  try {
    if (!await RBAC.userHasRole(req.authenticatedUserId, 'representante')) {
      return res.status(403).json({ error: 'Esta búsqueda está disponible solo para representantes.' })
    }
    const representativeCedula = String(req.query?.cedula || '').trim()
    if (!representativeCedula || representativeCedula.length > 20) {
      return res.status(400).json({ error: 'Escribe una cédula válida del representante.' })
    }
    const students = await Solicitud.getRepresentativePreinscriptionStudents(
      req.authenticatedUserId,
      representativeCedula
    )
    res.json(students)
  } catch (err) {
    console.error('No se pudieron consultar los alumnos del representante:', {
      code: err.code,
      message: err.message
    })
    if (err.code === 'REPRESENTATIVE_IDENTITY_MISMATCH') {
      return res.status(400).json({ error: err.message })
    }
    res.status(500).json({ error: 'No se pudieron consultar los alumnos registrados del representante.' })
  }
}

async function getDocumentos(req, res) {
  try {
    const [rows] = await require('../db').query(
      'SELECT id, nombre_documentos FROM documento ORDER BY id'
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al obtener los tipos de documentos' })
  }
}

async function getDocumentCatalogs(req, res) {
  try {
    const db = require('../db')
    const [[statuses], [movements]] = await Promise.all([
      db.query('SELECT id AS id_status, nombre_status FROM status ORDER BY id'),
      db.query('SELECT id AS id_movimiento, nombre_movimiento FROM movimiento ORDER BY id')
    ])
    res.json({ statuses, movements })
  } catch (err) {
    console.error('No se pudieron cargar los catálogos de documentos:', err)
    res.status(500).json({ error: 'No se pudieron cargar los estados y movimientos de documentos.' })
  }
}

async function list(req, res) {
  try {
    const solicitudes = await Solicitud.getAllSolicitudes();
    res.json(solicitudes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener solicitudes' });
  }
}

async function approve(req, res) {
  const { id } = req.params;
  const aprobado_por = req.body.aprobado_por || null;
  const seccion_id = Number(req.body.seccion_id);
  const status_id = Number(req.body.status_id);
  const movimiento_id = Number(req.body.movimiento_id);
  if (!Number.isInteger(seccion_id) || seccion_id <= 0) {
    return res.status(400).json({ error: 'El administrador debe seleccionar una sección válida para inscribir al alumno.' });
  }
  try {
    const userId = req.header('x-user-id') || null
    const solicitud = await Solicitud.approveSolicitud(
      id,
      aprobado_por,
      userId,
      seccion_id,
      Number.isInteger(status_id) && status_id > 0 ? status_id : null,
      Number.isInteger(movimiento_id) && movimiento_id > 0 ? movimiento_id : null
    );
    res.json(solicitud);
  } catch (err) {
    console.error('No se pudo aprobar e inscribir la solicitud:', {
      code: err.code,
      message: err.message,
      errno: err.errno,
      sqlState: err.sqlState
    })
    if (err.code === 'NOT_FOUND') {
      return res.status(404).json({ error: err.message })
    }
    if (err.code === 'INVALID_STATE') {
      return res.status(409).json({ error: err.message })
    }
    if (err.code === 'INVALID_PREINSCRIPTION_EDIT') {
      return res.status(400).json({ error: err.message })
    }
    if (['GRADE_NOT_FOUND', 'SECTION_NOT_FOUND', 'NO_CUPOS', 'STUDENT_NOT_FOUND', 'STUDENT_ENROLLMENT_CHANGED', 'GRADE_UNCHANGED', 'ER_NO_REFERENCED_ROW_2'].includes(err.code)) {
      return res.status(400).json({ error: err.message })
    }
    if (err.code === 'FORM_DATA_MISSING') {
      return res.status(400).json({ error: err.message })
    }
    res.status(500).json({ error: 'Error al aprobar la solicitud' });
  }
}

async function getById(req, res) {
  const { id } = req.params;
  try {
    const solicitud = await Solicitud.getSolicitudById(id);
    if (!solicitud) {
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }
    res.json(solicitud);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener la solicitud' });
  }
}

async function submitInscripcion(req, res) {
  const { id } = req.params;
  const inscripcion_formal = req.body;
  if (!inscripcion_formal || Object.keys(inscripcion_formal).length === 0) {
    return res.status(400).json({ error: 'Datos de inscripción formal requeridos' });
  }

  try {
    const solicitud = await Solicitud.submitInscripcion(id, inscripcion_formal);
    res.json(solicitud);
  } catch (err) {
    console.error(err);
    if (err.message === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }
    if (err.message === 'NOT_APPROVED') {
      return res.status(400).json({ error: 'La solicitud debe estar Aprobada antes de completar la inscripción formal' });
    }
    res.status(500).json({ error: 'Error al enviar la inscripción formal' });
  }
}

function validateIds(value) {
  const ids = Array.isArray(value) ? value : [value];
  const parsed = [...new Set(ids.map(Number))];
  if (parsed.length === 0 || parsed.some((id) => !Number.isInteger(id) || id <= 0)) return null;
  return parsed;
}

async function update(req, res) {
  const id = Number(req.params.id);
  const formData = req.body?.inscripcion_formal;
  if (!Number.isInteger(id) || id <= 0 || !formData || typeof formData !== 'object') {
    return res.status(400).json({ error: 'Los datos de la solicitud no son válidos.' });
  }
  let solicitud
  try {
    solicitud = await Solicitud.getSolicitudById(id)
  } catch (err) {
    console.error('No se pudo consultar la solicitud antes de editarla:', err)
    return res.status(500).json({ error: 'No se pudo consultar la solicitud seleccionada.' })
  }
  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada.' })
  if (solicitud.estado === 'Aprobado') {
    const requiredFields = [
      'nombres', 'apellidos', 'fecha_nacimiento', 'documento', 'representante_nombre',
      'representante_apellido', 'representante_cedula', 'representante_parentesco',
      'telefono', 'correo', 'direccion_municipio', 'direccion_calle',
      'direccion_avenida', 'direccion_num_casa'
    ]
    const academicFields = ['grado_id', 'seccion_id', 'periodo_id']
    if (!solicitud.id_preinscripcion ||
        requiredFields.some((field) => !String(formData[field] || '').trim()) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(formData.correo || '')) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(String(formData.fecha_nacimiento || '')) ||
        academicFields.some((field) => !Number.isInteger(Number(formData[field])) || Number(formData[field]) <= 0)) {
      return res.status(400).json({ error: 'Completa los datos personales, de contacto y académicos con valores válidos.' })
    }
    try {
      await Preinscripcion.updatePreinscripcion(
        Number(solicitud.id_preinscripcion),
        formData,
        id
      )
      return res.json(await Solicitud.getSolicitudById(id))
    } catch (err) {
      console.error('No se pudo actualizar la solicitud aprobada:', err)
      if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message })
      if (err.code === 'INVALID_APPROVED_REQUEST') return res.status(409).json({ error: err.message })
      if (['GRADE_NOT_FOUND', 'PERIOD_NOT_FOUND', 'SECTION_NOT_FOUND', 'NO_CUPOS'].includes(err.code)) {
        return res.status(400).json({ error: err.message })
      }
      return res.status(500).json({ error: 'No se pudo actualizar la solicitud aprobada.' })
    }
  }
  if (formData.tipo_solicitud !== 'preinscripcion_existente') {
    const requiredFields = [
      'nombres', 'apellidos', 'fecha_nacimiento', 'documento', 'representante_nombre',
      'representante_apellido', 'representante_cedula', 'representante_parentesco',
      'telefono', 'correo', 'direccion_municipio', 'direccion_calle',
      'direccion_avenida', 'direccion_num_casa', 'grado_nombre', 'fecha_inicio'
    ];
    if (requiredFields.some((field) => !String(formData[field] || '').trim()) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(formData.correo || ''))) {
      return res.status(400).json({ error: 'Completa los campos obligatorios con datos válidos.' });
    }
  }
  try {
    res.json(await Solicitud.updateSolicitud(id, { inscripcion_formal: formData }));
  } catch (err) {
    console.error('No se pudo actualizar la solicitud:', err);
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'INVALID_STATE') return res.status(409).json({ error: err.message });
    if (err.code === 'PENDING_DATA_NOT_FOUND') return res.status(409).json({ error: err.message });
    if (['INVALID_PREINSCRIPTION_EDIT', 'GRADE_NOT_FOUND', 'SECTION_NOT_FOUND', 'NO_CUPOS', 'GRADE_UNCHANGED'].includes(err.code)) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'No se pudo actualizar la solicitud.' });
  }
}

async function removeMany(req, res) {
  const ids = validateIds(req.body?.ids);
  if (!ids) return res.status(400).json({ error: 'Selecciona una o más solicitudes válidas.' });
  try {
    res.json(await Solicitud.deleteSolicitudes(ids));
  } catch (err) {
    console.error('No se pudieron eliminar las solicitudes:', err);
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'INVALID_STATE') return res.status(409).json({ error: err.message });
    res.status(500).json({ error: 'No se pudieron eliminar las solicitudes seleccionadas.' });
  }
}

module.exports = {
  create,
  createAdminInscripcion,
  createExistingStudentPreinscripcion,
  getRepresentativePreinscriptionStudents,
  getDocumentos,
  getDocumentCatalogs,
  list,
  approve,
  getById,
  submitInscripcion,
  update,
  removeMany
};
