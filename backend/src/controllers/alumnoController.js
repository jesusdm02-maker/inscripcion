const Alumno = require('../models/alumnoModel');

async function list(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 8;

    if (req.query.page || req.query.limit) {
      const [data, total] = await Promise.all([
        Alumno.getAlumnosPage(page, limit),
        Alumno.getAlumnosCount(),
      ]);
      return res.json({ page, limit, total, data });
    }

    const rows = await Alumno.getAllAlumnos();
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener alumnos' });
  }
}

async function searchForPreinscripcion(req, res) {
  const searchTerm = String(req.query.q || '').trim();
  if (searchTerm.length < 2) {
    return res.status(400).json({ error: 'Escribe al menos dos caracteres para buscar un alumno.' });
  }
  try {
    const alumnos = await Alumno.searchAlumnosForPreinscripcion(searchTerm);
    res.json(alumnos);
  } catch (err) {
    console.error('No se pudieron buscar alumnos para preinscripción:', err);
    res.status(500).json({ error: 'No se pudieron buscar los alumnos registrados.' });
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
  const { nombres, apellidos, fecha_nacimiento, alergias_condiciones } = req.body || {};
  if (!Number.isInteger(id) || id <= 0 || !String(nombres || '').trim() || !String(apellidos || '').trim()) {
    return res.status(400).json({ error: 'Indica un alumno válido, su nombre y sus apellidos.' });
  }
  try {
    const alumno = await Alumno.updateAlumno(id, {
      nombres: String(nombres).trim(),
      apellidos: String(apellidos).trim(),
      fecha_nacimiento: fecha_nacimiento || null,
      alergias_condiciones: String(alergias_condiciones || '').trim()
    });
    res.json(alumno);
  } catch (err) {
    console.error('No se pudo actualizar el alumno:', err);
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    res.status(500).json({ error: 'No se pudo actualizar el alumno.' });
  }
}

async function removeMany(req, res) {
  const ids = validateIds(req.body?.ids);
  if (!ids) return res.status(400).json({ error: 'Selecciona uno o más alumnos válidos.' });
  try {
    res.json(await Alumno.deleteAlumnos(ids));
  } catch (err) {
    console.error('No se pudieron eliminar los alumnos:', err);
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    res.status(500).json({ error: 'No se pudieron eliminar los alumnos seleccionados.' });
  }
}

module.exports = { list, searchForPreinscripcion, update, removeMany };
