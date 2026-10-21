const Role = require('../models/roleModel')

async function listRoles(req, res) {
  try {
    const roles = await Role.getAllRoles()
    res.json(roles)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'No se pudieron obtener los roles' })
  }
}

async function createRole(req, res) {
  const cargo = String(req.body?.cargo || '').trim()
  if (!cargo || cargo.length > 50) {
    return res.status(400).json({ error: 'El nombre del rol es obligatorio y debe tener como máximo 50 caracteres.' })
  }
  try {
    const existing = await Role.getRoleByName(cargo)
    if (existing) {
      return res.status(409).json({ error: 'El rol ya existe' })
    }
    const role = await Role.createRole({ cargo })
    res.status(201).json(role)
  } catch (err) {
    console.error(err)
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'El rol ya existe.' })
    res.status(500).json({ error: 'No se pudo crear el rol' })
  }
}

async function updateRole(req, res) {
  const id = Number(req.params.id)
  const cargo = String(req.body?.cargo || '').trim()
  if (!Number.isInteger(id) || id <= 0 || !cargo || cargo.length > 50) {
    return res.status(400).json({ error: 'Indica un rol válido con un nombre de hasta 50 caracteres.' })
  }
  try {
    const current = await Role.getRoleById(id)
    if (!current) return res.status(404).json({ error: 'No se encontró el rol seleccionado.' })
    if (['admin', 'administrador'].includes(String(current.cargo).trim().toLowerCase())) {
      if (String(current.cargo).trim().toLowerCase() === cargo.toLowerCase()) {
        return res.json(current)
      }
      return res.status(409).json({ error: 'El rol administrador está protegido y no se puede renombrar.' })
    }
    const existingName = await Role.getRoleByName(cargo)
    if (existingName && Number(existingName.id) !== id) {
      return res.status(409).json({ error: 'Ya existe un rol con ese nombre.' })
    }
    const role = await Role.updateRole(Number(id), { cargo })
    res.json(role)
  } catch (err) {
    console.error(err)
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message })
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe un rol con ese nombre.' })
    res.status(500).json({ error: 'No se pudo actualizar el rol' })
  }
}

async function deleteRole(req, res) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'El identificador del rol no es válido.' })
  try {
    await Role.deleteRole(Number(id))
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message })
    if (err.code === 'ROLE_IN_USE') return res.status(409).json({ error: err.message })
    if (err.code === 'PROTECTED_ROLE') return res.status(409).json({ error: err.message })
    res.status(500).json({ error: 'No se pudo eliminar el rol' })
  }
}

module.exports = { listRoles, createRole, updateRole, deleteRole }
