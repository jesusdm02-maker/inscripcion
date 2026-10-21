const RBAC = require('../models/rbacModel');
const AuthSession = require('../models/authSessionModel')

async function getAuthenticatedUserId(req) {
  if (req.authenticatedUserId) return req.authenticatedUserId
  const authorization = req.header('authorization') || ''
  const match = authorization.match(/^Bearer\s+([a-f0-9]{64})$/i)
  if (!match) return null
  const userId = await AuthSession.getSessionUserId(match[1])
  if (!userId) return null
  req.authenticatedUserId = Number(userId)
  req.headers['x-user-id'] = String(userId)
  return req.authenticatedUserId
}

async function adminOnly(req, res, next) {
  try {
    const userId = await getAuthenticatedUserId(req)
    if (!userId) return res.status(401).json({ error: 'La sesión no es válida o ha expirado. Inicia sesión nuevamente.' })
    if (await RBAC.userHasRole(userId, 'admin')) {
      return next()
    }
    return res.status(403).json({ error: 'Acceso restringido solo para administrador' })
  } catch (error) {
    return next(error)
  }
}

async function authenticatedOnly(req, res, next) {
  try {
    const userId = await getAuthenticatedUserId(req)
    if (!userId) {
      return res.status(401).json({ error: 'La sesión no es válida o ha expirado. Inicia sesión nuevamente.' })
    }
    return next()
  } catch (error) {
    return next(error)
  }
}

function requirePermission(permission, moduleName) {
  return async (req, res, next) => {
    try {
      const userId = await getAuthenticatedUserId(req)
      if (!userId) {
        return res.status(401).json({ error: 'La sesión no es válida o ha expirado. Inicia sesión nuevamente.' })
      }
      if (await RBAC.userHasRole(userId, 'admin')) {
        return next()
      }

      const hasPermission = await RBAC.userHasPermission(userId, permission, moduleName)
      if (!hasPermission) {
        return res.status(403).json({ error: 'Permiso insuficiente' })
      }
      return next()
    } catch (error) {
      return next(error)
    }
  }
}

function requireAnyPermission(requirements) {
  return async (req, res, next) => {
    try {
      const userId = await getAuthenticatedUserId(req)
      if (!userId) {
        return res.status(401).json({ error: 'La sesión no es válida o ha expirado. Inicia sesión nuevamente.' })
      }
      if (await RBAC.userHasRole(userId, 'admin')) {
        return next()
      }

      for (const [permission, moduleName] of requirements) {
        if (await RBAC.userHasPermission(userId, permission, moduleName)) {
          return next()
        }
      }
      return res.status(403).json({ error: 'Permiso insuficiente' })
    } catch (error) {
      return next(error)
    }
  }
}

function requireIntakeCreationPermissions() {
  return async (req, res, next) => {
    try {
      const userId = await getAuthenticatedUserId(req)
      if (!userId) {
        return res.status(401).json({ error: 'La sesión no es válida o ha expirado. Inicia sesión nuevamente.' })
      }
      if (await RBAC.userHasRole(userId, 'admin')) return next()

      const isRepresentative = await RBAC.userHasRole(userId, 'representante')
      const requirements = isRepresentative
        ? [['Crear', 'Nuevo ingreso']]
        : [
            ['Crear', 'Preinscripciones'],
            ['Crear', 'Alumnos'],
            ['Crear', 'Representantes']
          ]
      for (const [permission, moduleName] of requirements) {
        if (!await RBAC.userHasPermission(userId, permission, moduleName)) {
          return res.status(403).json({ error: 'Permiso insuficiente' })
        }
      }
      return next()
    } catch (error) {
      return next(error)
    }
  }
}

function requireExistingStudentPreinscriptionPermissions() {
  return async (req, res, next) => {
    try {
      const userId = await getAuthenticatedUserId(req)
      if (!userId) {
        return res.status(401).json({ error: 'La sesión no es válida o ha expirado. Inicia sesión nuevamente.' })
      }
      if (await RBAC.userHasRole(userId, 'admin')) return next()

      const isRepresentative = await RBAC.userHasRole(userId, 'representante')
      const requirements = isRepresentative
        ? [['Crear', 'Preinscripciones']]
        : [
            ['Crear', 'Preinscripciones'],
            ['Crear', 'Alumnos'],
            ['Crear', 'Representantes']
          ]
      for (const [permission, moduleName] of requirements) {
        if (!await RBAC.userHasPermission(userId, permission, moduleName)) {
          return res.status(403).json({ error: 'Permiso insuficiente' })
        }
      }
      return next()
    } catch (error) {
      return next(error)
    }
  }
}

module.exports = {
  adminOnly,
  authenticatedOnly,
  requirePermission,
  requireAnyPermission,
  requireIntakeCreationPermissions,
  requireExistingStudentPreinscriptionPermissions,
  getAuthenticatedUserId
};
