const Preinscripcion = require('../models/preinscripcionModel');

async function list(req, res) {
  try {
    const rows = await Preinscripcion.getAllPreinscripciones();
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener preinscripciones' });
  }
}

async function catalogos(req, res) {
  try {
    const rows = await Preinscripcion.getCatalogos();
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener catálogos' });
  }
}

function parseUpdateData(body = {}) {
  const requiredFields = [
    'nombres',
    'apellidos',
    'fecha_nacimiento',
    'documento',
    'representante_nombre',
    'representante_apellido',
    'representante_cedula',
    'representante_parentesco',
    'telefono',
    'correo',
    'direccion_municipio',
    'direccion_calle',
    'direccion_avenida',
    'direccion_num_casa'
  ];
  const data = Object.fromEntries(requiredFields.map((field) => [
    field,
    String(body[field] || '').trim()
  ]));
  data.alergias_condiciones = String(body.alergias_condiciones || '').trim();
  for (const field of ['grado_id', 'seccion_id', 'periodo_id']) {
    data[field] = Number(body[field]);
  }

  if (requiredFields.some((field) => !data[field]) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.correo) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data.fecha_nacimiento) ||
      ['grado_id', 'seccion_id', 'periodo_id'].some((field) =>
        !Number.isInteger(data[field]) || data[field] <= 0
      )) {
    return null;
  }
  return data;
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function update(req, res) {
  const id = parseId(req.params.id);
  const data = parseUpdateData(req.body);
  if (!id || !data) {
    return res.status(400).json({ error: 'Completa los datos del alumno, representante, contacto, domicilio y asignación académica.' });
  }
  try {
    res.json(await Preinscripcion.updatePreinscripcion(id, data));
  } catch (err) {
    console.error('No se pudo actualizar la preinscripción:', err);
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (['GRADE_NOT_FOUND', 'PERIOD_NOT_FOUND', 'SECTION_NOT_FOUND', 'NO_CUPOS'].includes(err.code)) {
      return res.status(409).json({ error: err.message });
    }
    res.status(500).json({ error: 'No se pudo actualizar la preinscripción.' });
  }
}

async function remove(req, res) {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Selecciona una preinscripción válida.' });
  try {
    res.json(await Preinscripcion.deletePreinscripcion(id));
  } catch (err) {
    console.error('No se pudo eliminar la preinscripción:', err);
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    res.status(500).json({ error: 'No se pudo eliminar la preinscripción.' });
  }
}

async function removeMany(req, res) {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.some((value) => !parseId(value))) {
    return res.status(400).json({ error: 'Selecciona una o más preinscripciones válidas.' });
  }
  const uniqueIds = [...new Set(ids.map(Number))];
  try {
    res.json(await Preinscripcion.deletePreinscripciones(uniqueIds));
  } catch (err) {
    console.error('No se pudieron eliminar las preinscripciones seleccionadas:', err);
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    res.status(500).json({ error: 'No se pudieron eliminar las preinscripciones seleccionadas.' });
  }
}

module.exports = { list, catalogos, update, remove, removeMany };
