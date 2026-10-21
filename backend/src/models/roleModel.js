const db = require('../db')

async function getAllRoles() {
  const [rows] = await db.query('SELECT id, cargo FROM rol ORDER BY id ASC')
  return rows
}

async function getRoleById(id) {
  const [rows] = await db.query('SELECT id, cargo FROM rol WHERE id = ?', [id])
  return rows[0]
}

async function getRoleByName(cargo) {
  const [rows] = await db.query('SELECT id, cargo FROM rol WHERE LOWER(cargo) = ?', [String(cargo).trim().toLowerCase()])
  return rows[0]
}

async function createRole({ cargo }) {
  const [result] = await db.query('INSERT INTO rol (cargo) VALUES (?)', [cargo])
  return { id: result.insertId, cargo }
}

async function updateRole(id, { cargo }) {
  const role = await getRoleById(id)
  if (!role) {
    const error = new Error('No se encontró el rol seleccionado.')
    error.code = 'NOT_FOUND'
    throw error
  }
  await db.query('UPDATE rol SET cargo = ? WHERE id = ?', [cargo, id])
  return { id: Number(id), cargo }
}

async function deleteRole(id) {
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()

    const [roleRows] = await connection.query('SELECT id, cargo FROM rol WHERE id = ? FOR UPDATE', [id])
    if (!roleRows.length) {
      const error = new Error('No se encontró el rol seleccionado.')
      error.code = 'NOT_FOUND'
      throw error
    }

    if (['admin', 'administrador'].includes(String(roleRows[0].cargo).trim().toLowerCase())) {
      const error = new Error('El rol administrador está protegido y no se puede eliminar.')
      error.code = 'PROTECTED_ROLE'
      throw error
    }

    const [[{ assignedUsers }]] = await connection.query(
      'SELECT COUNT(*) AS assignedUsers FROM r_u_r WHERE id_rol = ?',
      [id]
    )
    if (Number(assignedUsers) > 0) {
      const error = new Error('No se puede eliminar un rol asignado a usuarios. Reasigna esos usuarios primero.')
      error.code = 'ROLE_IN_USE'
      throw error
    }

    const [result] = await connection.query('DELETE FROM rol WHERE id = ?', [id])

    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

module.exports = { getAllRoles, getRoleById, getRoleByName, createRole, updateRole, deleteRole }
