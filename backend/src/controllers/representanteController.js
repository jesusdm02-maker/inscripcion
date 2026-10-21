const Representante = require('../models/representanteModel');

async function list(req, res) {
  try {
    const rows = await Representante.getAllRepresentantes();
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener representantes' });
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
  const { nombre, apellido, cedula, parentesco, municipio, calle, avenida, num_casa, numero_telefono } = req.body || {};
  if (!Number.isInteger(id) || id <= 0 ||
      [nombre, apellido, cedula, parentesco, numero_telefono].some((value) => !String(value || '').trim())) {
    return res.status(400).json({ error: 'Completa nombre, apellido, cédula, parentesco y teléfono.' });
  }
  try {
    res.json(await Representante.updateRepresentante(id, {
      nombre: String(nombre).trim(),
      apellido: String(apellido).trim(),
      cedula: String(cedula).trim(),
      parentesco: String(parentesco).trim(),
      municipio: String(municipio || '').trim(),
      calle: String(calle || '').trim(),
      avenida: String(avenida || '').trim(),
      num_casa: String(num_casa || '').trim(),
      numero_telefono: String(numero_telefono).trim()
    }));
  } catch (err) {
    console.error('No se pudo actualizar el representante:', err);
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe un representante con esa cédula.' });
    res.status(500).json({ error: 'No se pudo actualizar el representante.' });
  }
}

async function removeMany(req, res) {
  const ids = validateIds(req.body?.ids);
  if (!ids) return res.status(400).json({ error: 'Selecciona uno o más representantes válidos.' });
  try {
    res.json(await Representante.deleteRepresentantes(ids));
  } catch (err) {
    console.error('No se pudieron eliminar los representantes:', err);
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'HAS_STUDENTS') return res.status(409).json({ error: err.message });
    res.status(500).json({ error: 'No se pudieron eliminar los representantes seleccionados.' });
  }
}

module.exports = { list, update, removeMany };
