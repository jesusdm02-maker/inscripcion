const Grado = require('../models/gradoModel')

async function listGrados(req, res) {
  try {
    const grados = await Grado.getAllGrados()
    res.json(grados)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'No se pudieron obtener los grados' })
  }
}

async function listSecciones(req, res) {
  try {
    const secciones = await Grado.getAllSecciones()
    res.json(secciones)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'No se pudieron obtener las secciones' })
  }
}

async function createGrado(req, res) {
  const nombre_grado = String(req.body.nombre_grado || '').trim()
  const rawCapacity = req.body.cupos_disponibles
  const cupos_disponibles = rawCapacity === '' || rawCapacity === null || rawCapacity === undefined
    ? null
    : Number(rawCapacity)
  const id_secciones = Array.isArray(req.body.id_secciones)
    ? [...new Set(req.body.id_secciones.map(Number))]
    : []

  if (!nombre_grado) {
    return res.status(400).json({ error: 'El nombre del grado es obligatorio' })
  }
  if (nombre_grado.length > 50) {
    return res.status(400).json({ error: 'El nombre del grado no puede superar 50 caracteres' })
  }
  if (cupos_disponibles !== null && (!Number.isInteger(cupos_disponibles) || cupos_disponibles < 0)) {
    return res.status(400).json({ error: 'Los cupos deben ser un entero mayor o igual a cero' })
  }
  if (id_secciones.some((id) => !Number.isInteger(id) || id < 1)) {
    return res.status(400).json({ error: 'Las secciones seleccionadas no son válidas' })
  }

  try {
    const grado = await Grado.createGrado({ nombre_grado, cupos_disponibles, id_secciones })
    res.status(201).json(grado)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'No se pudo crear el grado' })
  }
}

async function createSeccion(req, res) {
  const nombre_seccion = String(req.body.nombre_seccion || '').trim()
  const id_grado = req.body.id_grado ? Number(req.body.id_grado) : null

  if (!nombre_seccion) {
    return res.status(400).json({ error: 'El nombre de la sección es obligatorio' })
  }
  if (nombre_seccion.length > 50) {
    return res.status(400).json({ error: 'El nombre de la sección no puede superar 50 caracteres' })
  }
  if (id_grado !== null && (!Number.isInteger(id_grado) || id_grado < 1)) {
    return res.status(400).json({ error: 'El grado seleccionado no es válido' })
  }

  try {
    const seccion = await Grado.createSeccion({ nombre_seccion, id_grado })
    res.status(201).json(seccion)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'No se pudo crear la sección' })
  }
}

async function updateGrado(req, res) {
  const id = Number(req.params.id)
  const nombre_grado = String(req.body.nombre_grado || '').trim()
  const rawCapacity = req.body.cupos_disponibles
  const cupos_disponibles = rawCapacity === '' || rawCapacity === null || rawCapacity === undefined
    ? null
    : Number(rawCapacity)

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'El grado seleccionado no es válido' })
  }
  if (!nombre_grado) {
    return res.status(400).json({ error: 'El nombre del grado es obligatorio' })
  }
  if (nombre_grado.length > 50) {
    return res.status(400).json({ error: 'El nombre del grado no puede superar 50 caracteres' })
  }
  if (cupos_disponibles !== null && (!Number.isInteger(cupos_disponibles) || cupos_disponibles < 0)) {
    return res.status(400).json({ error: 'Los cupos deben ser un entero mayor o igual a cero' })
  }

  try {
    const grado = await Grado.updateGrado(id, { nombre_grado, cupos_disponibles })
    if (!grado) return res.status(404).json({ error: 'No se encontró el grado' })
    res.json(grado)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'No se pudo actualizar el grado' })
  }
}

async function updateSeccion(req, res) {
  const id = Number(req.params.id)
  const nombre_seccion = String(req.body.nombre_seccion || '').trim()

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'La sección seleccionada no es válida' })
  }
  if (!nombre_seccion) {
    return res.status(400).json({ error: 'El nombre de la sección es obligatorio' })
  }
  if (nombre_seccion.length > 50) {
    return res.status(400).json({ error: 'El nombre de la sección no puede superar 50 caracteres' })
  }

  try {
    const seccion = await Grado.updateSeccion(id, { nombre_seccion })
    if (!seccion) return res.status(404).json({ error: 'No se encontró la sección' })
    res.json(seccion)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'No se pudo actualizar la sección' })
  }
}

async function deleteGrado(req, res) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'El grado seleccionado no es válido' })
  }

  try {
    const result = await Grado.deleteGrado(id)
    if (!result.deleted) return res.status(404).json({ error: 'No se encontró el grado' })
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(err.statusCode || 500).json({ error: err.message || 'No se pudo eliminar el grado' })
  }
}

async function deleteSeccion(req, res) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'La sección seleccionada no es válida' })
  }

  try {
    const result = await Grado.deleteSeccion(id)
    if (!result.deleted) return res.status(404).json({ error: 'No se encontró la sección' })
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(err.statusCode || 500).json({ error: err.message || 'No se pudo eliminar la sección' })
  }
}

function parseIds(value) {
  if (!Array.isArray(value) || value.length === 0) return null
  const ids = [...new Set(value.map(Number))]
  if (ids.some((id) => !Number.isInteger(id) || id < 1)) return null
  return ids
}

async function deleteGrados(req, res) {
  const ids = parseIds(req.body.ids)
  if (!ids) return res.status(400).json({ error: 'Selecciona uno o más grados válidos' })

  try {
    const result = await Grado.deleteGrados(ids)
    if (result.missing) return res.status(404).json({ error: 'Uno o más grados seleccionados ya no existen' })
    res.json({ success: true, deleted: result.deleted })
  } catch (err) {
    console.error(err)
    res.status(err.statusCode || 500).json({ error: err.message || 'No se pudieron eliminar los grados seleccionados' })
  }
}

async function deleteSecciones(req, res) {
  const ids = parseIds(req.body.ids)
  if (!ids) return res.status(400).json({ error: 'Selecciona una o más secciones válidas' })

  try {
    const result = await Grado.deleteSecciones(ids)
    if (result.missing) return res.status(404).json({ error: 'Una o más secciones seleccionadas ya no existen' })
    res.json({ success: true, deleted: result.deleted })
  } catch (err) {
    console.error(err)
    res.status(err.statusCode || 500).json({ error: err.message || 'No se pudieron eliminar las secciones seleccionadas' })
  }
}

module.exports = { listGrados, listSecciones, createGrado, createSeccion, updateGrado, updateSeccion, deleteGrado, deleteSeccion, deleteGrados, deleteSecciones }
