const User = require('../models/userModel')
const RBAC = require('../models/rbacModel')
const AuthSession = require('../models/authSessionModel')
const Alumno = require('../models/alumnoModel')

async function login(req, res) {
  const correo = String(req.body?.correo || '').trim().toLowerCase()
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (!correo || !password) {
    return res.status(400).json({ error: 'Correo y contraseña son requeridos' })
  }

  try {
    const isAdminSeedEmail = ['jesus@escuela.com', 'admin@escuela.com'].includes(correo)
    let user = await User.findByCorreo(correo)
    let createdSeedAdministrator = false

    if (!user && isAdminSeedEmail) {
      const seedUser = correo === 'admin@escuela.com'
        ? { nombre: 'Admin', apellido: 'Sistema', password: '1234' }
        : { nombre: 'Jesus', apellido: 'Admin', password: 'jesus123' }

      if (password !== seedUser.password) {
        return res.status(401).json({ error: 'Credenciales inválidas' })
      }
      user = await User.createUser({ nombre: seedUser.nombre, apellido: seedUser.apellido, correo, password: seedUser.password })
      createdSeedAdministrator = true
    }

    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    if (!createdSeedAdministrator && user.password) {
      if (password !== user.password) {
        return res.status(401).json({ error: 'Credenciales inválidas' })
      }
    } else if (!createdSeedAdministrator) {
      // En este prototipo, la contraseña es '1234' para usuarios sin password guardada
      if (password !== '1234') {
        return res.status(401).json({ error: 'Credenciales inválidas' })
      }
    }

    if (createdSeedAdministrator) {
      await RBAC.assignRoleToUser(user.id, 'admin', `${user.nombre} ${user.apellido}`)
    }

    const rbacInfo = await RBAC.getUserRoleAndPermissions(user.id)
    const role = rbacInfo?.role || (['admin@escuela.com', 'jesus@escuela.com'].includes(user.correo) ? 'admin' : 'user')
    const permissions = rbacInfo?.permissions || []
    const modules = rbacInfo?.modules || []
    const modulePermissions = rbacInfo?.modulePermissions || {}
    const pages = rbacInfo?.pages || []
    const accessToken = await AuthSession.createSession(user.id)

    res.json({
      id: user.id,
      name: `${user.nombre} ${user.apellido}`,
      correo: user.correo,
      role,
      permissions,
      modules,
      modulePermissions,
      pages,
      accessToken
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error del servidor' })
  }
}

async function logout(req, res) {
  try {
    const token = (req.header('authorization') || '').replace(/^Bearer\s+/i, '')
    await AuthSession.revokeSession(token)
    res.json({ success: true })
  } catch (err) {
    console.error('No se pudo cerrar la sesión en el servidor:', err)
    res.status(500).json({ error: 'No se pudo cerrar la sesión de forma segura.' })
  }
}

async function getCurrentUserPermissions(req, res) {
  try {
    const rbacInfo = await RBAC.getUserRoleAndPermissions(req.authenticatedUserId)
    res.json({
      role: rbacInfo.role,
      permissions: rbacInfo.permissions,
      modules: rbacInfo.modules,
      modulePermissions: rbacInfo.modulePermissions,
      pages: rbacInfo.pages
    })
  } catch (err) {
    console.error('No se pudieron actualizar los permisos de la sesión:', err)
    res.status(500).json({ error: 'No se pudieron actualizar los permisos de la sesión.' })
  }
}

async function listUsers(req, res) {
  try {
    const users = await User.getAllUsersWithRoles()
    res.json(users)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'No se pudo obtener la lista de usuarios' })
  }
}

async function searchRepresentativeStudents(req, res) {
  const searchTerm = String(req.query.q || '').trim()
  if (searchTerm.length < 2) {
    return res.status(400).json({ error: 'Escribe al menos dos caracteres para buscar un alumno.' })
  }
  try {
    const students = await Alumno.searchStudentsForRepresentativeAccount(searchTerm)
    res.json(students)
  } catch (err) {
    console.error('No se pudieron buscar alumnos para la cuenta de representante:', err)
    res.status(500).json({ error: 'No se pudieron buscar los alumnos registrados.' })
  }
}

async function createUserAccount(req, res) {
  let nombre = String(req.body?.nombre || '').trim()
  let apellido = String(req.body?.apellido || '').trim()
  const correo = String(req.body?.correo || '').trim()
  const password = req.body?.password
  const role = String(req.body?.role || '').trim()
  let telefono = String(req.body?.telefono || '').trim()
  let cedula = String(req.body?.cedula || '').trim()
  let calle = String(req.body?.calle ?? '').trim()
  let avenida = String(req.body?.avenida ?? '').trim()
  let municipio = String(req.body?.municipio ?? '').trim()
  const isRepresentative = role.toLowerCase() === 'representante'
  const representativeStudentId = Number(req.body?.representative_student_id)

  if (isRepresentative && (!Number.isInteger(representativeStudentId) || representativeStudentId <= 0)) {
    return res.status(400).json({ error: 'Selecciona el alumno asociado a la cuenta del representante.' })
  }
  if (!nombre || !apellido || !correo || !password || !telefono || !cedula) {
    return res.status(400).json({ error: 'Nombre, apellido, correo, contraseña, teléfono y cédula son requeridos.' })
  }
  if (nombre.length > 50 || apellido.length > 50 || correo.length > 50 || telefono.length > 50 || cedula.length > 50 || calle.length > 50 || avenida.length > 50 || municipio.length > 100 || String(password).length < 4) {
    return res.status(400).json({ error: 'Los datos personales y la dirección exceden la longitud permitida; la contraseña debe tener al menos 4 caracteres.' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return res.status(400).json({ error: 'Ingresa un correo electrónico válido.' })
  }

  try {
    const roleId = role ? await RBAC.resolveRoleId(role) : null
    let representativeStudent = null
    if (isRepresentative) {
      representativeStudent = await Alumno.getStudentRepresentativeForAccount(representativeStudentId)
      if (!representativeStudent) {
        return res.status(404).json({ error: 'El alumno seleccionado no tiene un representante asociado.' })
      }
      nombre = representativeStudent.representante_nombre
      apellido = representativeStudent.representante_apellido
      telefono = representativeStudent.telefono || telefono
      cedula = representativeStudent.representante_cedula
      calle = representativeStudent.calle || ''
      avenida = representativeStudent.avenida || ''
      municipio = representativeStudent.municipio || ''
    }
    const existing = await User.findByCorreo(correo)
    if (existing) {
      return res.status(409).json({ error: 'El correo ya está registrado' })
    }

    const user = await User.createUser({ nombre, apellido, correo, password, telefono, cedula, calle, avenida, municipio })
    try {
      if (roleId) {
        await RBAC.assignRoleToUser(user.id, roleId, `${user.nombre} ${user.apellido}`)
      }
    } catch (error) {
      await User.deleteUser(user.id)
      throw error
    }

    res.status(201).json({
      id: user.id,
      nombre: user.nombre,
      apellido: user.apellido,
      correo: user.correo,
      telefono: user.telefono,
      cedula: user.cedula,
      calle,
      avenida,
      municipio: user.      municipio,
      rol: role ? role.toLowerCase() : null,
      representative_student_id: representativeStudent?.id || null,
      representative_student_name: representativeStudent
        ? `${representativeStudent.nombres} ${representativeStudent.apellidos}`.trim()
        : null
    })
  } catch (err) {
    console.error(err)
    if (err.code === 'ROLE_NOT_FOUND') return res.status(400).json({ error: err.message })
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'El correo ya está registrado.' })
    res.status(500).json({ error: 'No se pudo crear el usuario' })
  }
}

async function updateUserAccount(req, res) {
  const id = Number(req.params.id)
  const nombre = String(req.body?.nombre || '').trim()
  const apellido = String(req.body?.apellido || '').trim()
  const correo = String(req.body?.correo || '').trim()
  const password = req.body?.password
  const telefono = req.body?.telefono === undefined ? undefined : String(req.body.telefono ?? '').trim()
  const cedula = req.body?.cedula === undefined ? undefined : String(req.body.cedula ?? '').trim()
  const calle = req.body?.calle === undefined ? undefined : String(req.body.calle ?? '').trim()
  const avenida = req.body?.avenida === undefined ? undefined : String(req.body.avenida ?? '').trim()
  const municipio = req.body?.municipio === undefined ? undefined : String(req.body.municipio ?? '').trim()
  const role = req.body?.role === undefined ? undefined : String(req.body.role).trim()

  if (!Number.isInteger(id) || id <= 0 || !nombre || !apellido || !correo) {
    return res.status(400).json({ error: 'Indica un usuario válido, nombre, apellido y correo.' })
  }
  if (nombre.length > 50 || apellido.length > 50 || correo.length > 50 || (telefono !== undefined && telefono.length > 50) || (cedula !== undefined && cedula.length > 50) || (calle !== undefined && calle.length > 50) || (avenida !== undefined && avenida.length > 50) || (municipio !== undefined && municipio.length > 100) || (password && String(password).length < 4)) {
    return res.status(400).json({ error: 'Los datos personales y la dirección exceden la longitud permitida; la contraseña debe tener al menos 4 caracteres.' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return res.status(400).json({ error: 'Ingresa un correo electrónico válido.' })
  }

  try {
    const roleId = role ? await RBAC.resolveRoleId(role) : null
    const existingUser = await User.findById(id)
    if (!existingUser) return res.status(404).json({ error: 'No se encontró el usuario seleccionado.' })
    const existing = await User.findByCorreo(correo)
    if (existing && Number(existing.id) !== id) {
      return res.status(409).json({ error: 'El correo ya está registrado por otro usuario' })
    }

    const updatedUser = await User.updateUser(id, { nombre, apellido, correo, password, telefono, cedula, calle, avenida, municipio })
    if (roleId) await RBAC.assignRoleToUser(id, roleId, `${nombre} ${apellido}`)

    res.json({
      id,
      nombre,
      apellido,
      correo,
      telefono: updatedUser.telefono,
      cedula: updatedUser.cedula,
      calle: updatedUser.calle,
      avenida: updatedUser.avenida,
      municipio: updatedUser.municipio,
      rol: role ? role.toLowerCase() : undefined
    })
  } catch (err) {
    console.error(err)
    if (err.code === 'ROLE_NOT_FOUND') return res.status(400).json({ error: err.message })
    if (err.code === 'USER_NOT_FOUND') return res.status(404).json({ error: err.message })
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'El correo ya está registrado por otro usuario.' })
    res.status(500).json({ error: 'No se pudo actualizar el usuario' })
  }
}

async function deleteUserAccount(req, res) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'El identificador del usuario no es válido.' })
  if (id === Number(req.header('x-user-id'))) {
    return res.status(400).json({ error: 'No puedes eliminar la cuenta con la que has iniciado sesión.' })
  }
  try {
    await User.deleteUser(Number(id))
    await AuthSession.revokeUserSessions(id)
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    if (err.code === 'USER_NOT_FOUND') return res.status(404).json({ error: err.message })
    if (err.code === 'LAST_ADMIN') return res.status(409).json({ error: err.message })
    res.status(500).json({ error: 'No se pudo eliminar el usuario' })
  }
}

async function removeUserRole(req, res) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'El identificador del usuario no es válido.' })
  }

  try {
    const existingUser = await User.findById(id)
    if (!existingUser) return res.status(404).json({ error: 'No se encontró el usuario seleccionado.' })
    const result = await RBAC.removeRoleFromUser(id)
    res.json({ id, id_rol: null, rol: null, removedRole: result.role })
  } catch (err) {
    console.error(err)
    if (err.code === 'ROLE_NOT_ASSIGNED') return res.status(404).json({ error: err.message })
    if (err.code === 'LAST_ADMIN') return res.status(409).json({ error: err.message })
    res.status(500).json({ error: 'No se pudo quitar el rol del usuario' })
  }
}

module.exports = {
  login,
  logout,
  getCurrentUserPermissions,
  listUsers,
  searchRepresentativeStudents,
  createUserAccount,
  updateUserAccount,
  deleteUserAccount,
  removeUserRole
}
