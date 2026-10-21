export function normalizeModuleName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\s-]+/g, '')
}

function isAdministrator(user) {
  const role = String(user?.role || '').trim().toLowerCase()
  return role === 'admin' || role === 'administrador'
}

export function hasPermission(user, moduleName, action) {
  if (!user || !moduleName || !action) return false
  if (isAdministrator(user)) return true

  const modulePermissions = user.modulePermissions || {}
  const normalizedModule = normalizeModuleName(moduleName)
  const moduleAliases = {
    alumnos: 'alumnosregistrados'
  }
  const resolvedModule = moduleAliases[normalizedModule] || normalizedModule
  const entry = Object.entries(modulePermissions).find(
    ([name]) => normalizeModuleName(name) === resolvedModule
  )?.[1]

  if (Array.isArray(entry)) {
    return entry.some(
      (permission) => String(permission).trim().toLocaleLowerCase('es') === String(action).trim().toLocaleLowerCase('es')
    )
  }

  if (String(action).trim().toLocaleLowerCase('es') !== 'leer') return false
  return Array.isArray(user.modules) && user.modules.some((module) => {
    const name = typeof module === 'string' ? module : module?.nombre_modulo || module?.name
    return normalizeModuleName(name) === resolvedModule
  })
}

export function hasModuleAccess(user, moduleName) {
  return hasPermission(user, moduleName, 'Leer')
}

export function canOpenModule(user, moduleName) {
  if (hasModuleAccess(user, moduleName)) return true

  const role = String(user?.role || user?.rol || '').trim().toLocaleLowerCase('es')
  const isRepresentative = role === 'representante'
  const normalizedModule = normalizeModuleName(moduleName)
  if (normalizedModule === 'nuevoingreso') {
    return isRepresentative
      ? hasPermission(user, 'Nuevo ingreso', 'Crear')
      : hasPermission(user, 'Preinscripciones', 'Crear') &&
        hasPermission(user, 'Alumnos', 'Crear') &&
        hasPermission(user, 'Representantes', 'Crear')
  }
  if (normalizedModule === 'preinscripciones') {
    if (isRepresentative) return hasPermission(user, 'Preinscripciones', 'Crear')
    return hasPermission(user, 'Preinscripciones', 'Crear') &&
      hasPermission(user, 'Alumnos', 'Crear') &&
      hasPermission(user, 'Representantes', 'Crear')
  }
  const creatableModules = ['gradosysecciones', 'usuarios', 'roles', 'modulos']
  return creatableModules.includes(normalizedModule) && hasPermission(user, moduleName, 'Crear')
}
