function normalize(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[_\s-]+/g, '')
}

const { NAVIGATION_PAGES } = require('../config/navigationCatalog')

const ROLE_POLICIES = {
  director: { allModules: true, readOnlyModules: ['Usuarios', 'Roles', 'Módulos'] },
  coordinador: {
    modules: ['Panel', 'Nuevo ingreso', 'Preinscripciones', 'Alumnos registrados', 'Representantes', 'Solicitudes', 'Grados y Secciones'],
    readOnlyModules: ['Grados y Secciones']
  },
  docente: {
    modules: ['Panel', 'Alumnos registrados', 'Representantes', 'Grados y Secciones'],
    readOnlyModules: ['Grados y Secciones']
  },
  representante: {
    modules: ['Nuevo ingreso', 'Preinscripciones'],
    readOnlyModules: [],
    readAndCreateModules: ['Nuevo ingreso'],
    createOnlyModules: ['Preinscripciones']
  }
}

async function getDefaultRoleModuleAccess(connection, roleName) {
  const roleKey = normalize(roleName)
  const policy = ROLE_POLICIES[roleKey]
  if (!policy) return null

  const [modules] = await connection.query('SELECT id, nombre_modulo FROM modulo ORDER BY id')
  const [permissions] = await connection.query('SELECT id, accion FROM permisos ORDER BY id')
  const [pages] = await connection.query('SELECT id, url FROM paginas')
  const moduleByName = new Map(modules.map((module) => [normalize(module.nombre_modulo), module]))
  const pageByUrl = new Map(pages.map((page) => [page.url, Number(page.id)]))
  const permissionByName = new Map(permissions.map((permission) => [
    normalize(permission.accion === 'mirada lasciva' ? 'Leer' : permission.accion),
    Number(permission.id)
  ]))
  const allActions = permissions.map((permission) => normalize(
    permission.accion === 'mirada lasciva' ? 'Leer' : permission.accion
  ))
  const readOnlyModules = new Set(policy.readOnlyModules.map(normalize))
  const readAndCreateModules = new Set((policy.readAndCreateModules || []).map(normalize))
  const createOnlyModules = new Set((policy.createOnlyModules || []).map(normalize))
  const selectedModules = policy.allModules
    ? modules
    : policy.modules.map((name) => {
      const module = moduleByName.get(normalize(name))
      if (!module) throw new Error(`No se encontró el módulo requerido para el rol ${roleName}: ${name}`)
      return module
    })

  return selectedModules.map((module) => {
    const normalizedName = normalize(module.nombre_modulo)
    const actions = readOnlyModules.has(normalizedName)
      ? ['leer']
      : readAndCreateModules.has(normalizedName)
        ? ['crear', 'leer']
        : createOnlyModules.has(normalizedName)
          ? ['crear']
          : allActions
    const missingActions = actions.filter((action) => !permissionByName.has(action))
    if (missingActions.length) {
      throw new Error(`Faltan permisos requeridos para el rol ${roleName}: ${missingActions.join(', ')}`)
    }
    const modulePages = NAVIGATION_PAGES
      .filter((page) => normalize(page.module) === normalizedName)
      .map((page) => pageByUrl.get(page.url))
      .filter((pageId) => pageId !== undefined)
    return {
      id_modulo: Number(module.id),
      permisos: modulePages.flatMap((pageId) => actions.map((action) => ({
        id_permisos: permissionByName.get(action),
        id_paginas: pageId
      })))
    }
  })
}

module.exports = { getDefaultRoleModuleAccess }
