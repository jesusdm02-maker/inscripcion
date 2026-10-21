const db = require('../db')

async function ensureDireccionUsuario(connection, { calle, avenida, municipio }) {
  const normalizedCalle = (calle ?? '').trim()
  const normalizedAvenida = (avenida ?? '').trim()
  const normalizedMunicipio = (municipio ?? '').trim()

  if (!normalizedCalle && !normalizedAvenida && !normalizedMunicipio) {
    return null
  }

  const [[existing]] = await connection.query(
    'SELECT id AS id_direccion_usuario FROM direccion_usuario WHERE calle <=> ? AND avenida <=> ? AND municipio <=> ? LIMIT 1',
    [normalizedCalle || null, normalizedAvenida || null, normalizedMunicipio || null]
  )

  if (existing) {
    return existing.id_direccion_usuario
  }

  const [result] = await connection.query(
    'INSERT INTO direccion_usuario (calle, avenida, municipio) VALUES (?, ?, ?)',
    [normalizedCalle || null, normalizedAvenida || null, normalizedMunicipio || null]
  )

  return result.insertId
}

async function syncUsuarioProfile(connection, userId, { nombre, telefono, cedula, calle, avenida, municipio }) {
  if (!userId) return null

  const [[existing]] = await connection.query(
    'SELECT id, nombre, telefono, cedula, id_direccion_usuario FROM usuarios WHERE id = ?',
    [userId]
  )
  const addressWasProvided = calle !== undefined || avenida !== undefined || municipio !== undefined
  let addressValues = { calle, avenida, municipio }
  if (addressWasProvided && existing?.id_direccion_usuario) {
    const [[currentAddress]] = await connection.query(
      'SELECT calle, avenida, municipio FROM direccion_usuario WHERE id = ?',
      [existing.id_direccion_usuario]
    )
    addressValues = {
      calle: calle === undefined ? currentAddress?.calle : calle,
      avenida: avenida === undefined ? currentAddress?.avenida : avenida,
      municipio: municipio === undefined ? currentAddress?.municipio : municipio
    }
  }
  const direccionId = addressWasProvided
    ? await ensureDireccionUsuario(connection, addressValues)
    : existing?.id_direccion_usuario ?? null
  const nextTelefono = telefono === undefined ? existing?.telefono ?? null : telefono || null
  const nextCedula = cedula === undefined ? existing?.cedula ?? null : cedula || null

  if (existing) {
    await connection.query(
      'UPDATE usuarios SET nombre = ?, telefono = ?, cedula = ?, id_direccion_usuario = ? WHERE id = ?',
      [nombre || existing.nombre || null, nextTelefono, nextCedula, direccionId, userId]
    )
  } else {
    await connection.query(
      'INSERT INTO usuarios (id, nombre, telefono, cedula, id_direccion_usuario) VALUES (?, ?, ?, ?, ?)',
      [userId, nombre || null, nextTelefono, nextCedula, direccionId]
    )
  }

  if (existing?.id_direccion_usuario && existing.id_direccion_usuario !== direccionId) {
    const [[linkedAddress]] = await connection.query(
      'SELECT COUNT(*) AS total FROM usuarios WHERE id_direccion_usuario = ?',
      [existing.id_direccion_usuario]
    )

    if (Number(linkedAddress?.total || 0) === 0) {
      await connection.query('DELETE FROM direccion_usuario WHERE id = ?', [existing.id_direccion_usuario])
    }
  }

  const [[address]] = direccionId
    ? await connection.query('SELECT calle, avenida, municipio FROM direccion_usuario WHERE id = ?', [direccionId])
    : [[null]]

  return {
    id: existing?.id ?? userId,
    telefono: nextTelefono || '',
    cedula: nextCedula || '',
    calle: address?.calle || '',
    avenida: address?.avenida || '',
    municipio: address?.municipio || ''
  }
}

async function findByCorreo(correo) {
  const [rows] = await db.query('SELECT * FROM `user` WHERE correo = ?', [correo])
  return rows[0]
}

async function findById(id) {
  const [rows] = await db.query('SELECT id, nombre, apellido, correo FROM `user` WHERE id = ?', [id])
  return rows[0]
}

async function getAllUsers() {
  const [rows] = await db.query('SELECT id, nombre, apellido, correo FROM `user` ORDER BY id ASC')
  return rows
}

async function getAllUsersWithRoles() {
  const [rows] = await db.query(
    `SELECT u.id,
            u.nombre,
            u.apellido,
            u.correo,
            profile.telefono,
            profile.cedula,
            address.calle,
            address.avenida,
            address.municipio,
            r.id AS id_rol,
            LOWER(r.cargo) AS rol
     FROM \`user\` u
     LEFT JOIN usuarios profile ON profile.id = u.id
     LEFT JOIN direccion_usuario address ON address.id = profile.id_direccion_usuario
     LEFT JOIN r_u_r ru ON ru.id_usuarios = u.id
     LEFT JOIN rol r ON r.id = ru.id_rol
     ORDER BY u.id ASC`
  )
  return rows
}

async function createUser({ nombre, apellido, correo, password, telefono, cedula, calle, avenida, municipio }) {
  const connection = await db.getConnection()
  let transactionStarted = false

  try {
    await connection.beginTransaction()
    transactionStarted = true
    const [columns] = await connection.query("SHOW COLUMNS FROM `user` LIKE 'password'")
    const hasPassword = Array.isArray(columns) && columns.length > 0
    const [result] = hasPassword
      ? await connection.query(
        'INSERT INTO `user` (nombre, apellido, correo, password) VALUES (?, ?, ?, ?)',
        [nombre, apellido, correo, password || null]
      )
      : await connection.query(
        'INSERT INTO `user` (nombre, apellido, correo) VALUES (?, ?, ?)',
        [nombre, apellido, correo]
      )
    const userId = result.insertId

    const profile = await syncUsuarioProfile(connection, userId, {
      nombre: `${nombre} ${apellido}`.trim(),
      telefono,
      cedula,
      calle,
      avenida,
      municipio
    })
    await connection.commit()
    return { id: userId, nombre, apellido, correo, ...profile }
  } catch (error) {
    if (transactionStarted) await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function updateUser(id, { nombre, apellido, correo, password, telefono, cedula, calle, avenida, municipio }) {
  const connection = await db.getConnection()
  let transactionStarted = false

  try {
    await connection.beginTransaction()
    transactionStarted = true
    const [existingUsers] = await connection.query('SELECT id FROM `user` WHERE id = ? LIMIT 1', [id])
    if (existingUsers.length === 0) {
      const error = new Error('No se encontró el usuario seleccionado.')
      error.code = 'USER_NOT_FOUND'
      throw error
    }

    const [columns] = await connection.query("SHOW COLUMNS FROM `user` LIKE 'password'")
    const hasPassword = Array.isArray(columns) && columns.length > 0
    if (hasPassword && password !== undefined && password !== null && password !== '') {
      await connection.query(
        'UPDATE `user` SET nombre = ?, apellido = ?, correo = ?, password = ? WHERE id = ?',
        [nombre, apellido, correo, password, id]
      )
    } else {
      await connection.query(
        'UPDATE `user` SET nombre = ?, apellido = ?, correo = ? WHERE id = ?',
        [nombre, apellido, correo, id]
      )
    }

    const profile = await syncUsuarioProfile(connection, id, {
      nombre: `${nombre} ${apellido}`.trim(),
      telefono,
      cedula,
      calle,
      avenida,
      municipio
    })
    await connection.commit()
    return { id, nombre, apellido, correo, ...profile }
  } catch (error) {
    if (transactionStarted) await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function deleteUser(id) {
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()

    const [userRows] = await connection.query('SELECT id FROM `user` WHERE id = ? FOR UPDATE', [id])
    if (userRows.length === 0) {
      const error = new Error('No se encontró el usuario seleccionado.')
      error.code = 'USER_NOT_FOUND'
      throw error
    }

    const [[assignedRole]] = await connection.query(
      `SELECT r.id, LOWER(r.cargo) AS cargo
         FROM r_u_r ur
         JOIN rol r ON r.id = ur.id_rol
        WHERE ur.id_usuarios = ?
        LIMIT 1`,
      [id]
    )
    if (assignedRole && ['admin', 'administrador'].includes(assignedRole.cargo)) {
      const [administrators] = await connection.query(
        `SELECT ur.id_usuarios
           FROM r_u_r ur
           JOIN rol r ON r.id = ur.id_rol
          WHERE LOWER(r.cargo) IN ('admin', 'administrador')
          FOR UPDATE`
      )
      if (administrators.length <= 1) {
        const error = new Error('No se puede eliminar al último administrador del sistema.')
        error.code = 'LAST_ADMIN'
        throw error
      }
    }

    const [[userProfile]] = await connection.query(
      'SELECT id_direccion_usuario FROM usuarios WHERE id = ? LIMIT 1',
      [id]
    )

    await connection.query('UPDATE solicitudes_preinscripciones SET id_user = NULL WHERE id_user = ?', [id])
    await connection.query(
      `DELETE permission
         FROM r_mp_per permission
         JOIN r_m_ur module_access
           ON module_access.id = permission.id_modulo_usuario_rol
         JOIN r_u_r user_role ON user_role.id = module_access.id_r_u_r
        WHERE user_role.id_usuarios = ?`,
      [id]
    )
    await connection.query(
      `DELETE module_access
         FROM r_m_ur module_access
         JOIN r_u_r user_role ON user_role.id = module_access.id_r_u_r
        WHERE user_role.id_usuarios = ?`,
      [id]
    )
    await connection.query('DELETE FROM r_u_r WHERE id_usuarios = ?', [id])
    await connection.query('DELETE FROM usuarios WHERE id = ?', [id])
    await connection.query('DELETE FROM `user` WHERE id = ?', [id])

    if (userProfile?.id_direccion_usuario) {
      const [[linkedAddress]] = await connection.query(
        'SELECT COUNT(*) AS total FROM usuarios WHERE id_direccion_usuario = ?',
        [userProfile.id_direccion_usuario]
      )

      if (Number(linkedAddress?.total || 0) === 0) {
        await connection.query('DELETE FROM direccion_usuario WHERE id = ?', [userProfile.id_direccion_usuario])
      }
    }

    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

module.exports = { findByCorreo, findById, getAllUsers, getAllUsersWithRoles, createUser, updateUser, deleteUser }
