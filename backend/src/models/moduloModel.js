const db = require('../db')
const { NAVIGATION_PAGES } = require('../config/navigationCatalog')

async function getAllModulos() {
  const [modules] = await db.query(
    'SELECT id AS id_modulo, nombre_modulo FROM modulo ORDER BY id ASC'
  )
  const [pages] = await db.query(
    'SELECT id AS id_paginas, nombre_pagina, url FROM paginas ORDER BY id ASC'
  )
  const pagesByUrl = new Map(pages.map((page) => [page.url, page]))
  const modulesByName = new Map(modules.map((module) => [module.nombre_modulo, module]))

  return NAVIGATION_PAGES.map((navigationPage) => {
    const module = modulesByName.get(navigationPage.module)
    const page = pagesByUrl.get(navigationPage.url)
    if (!module || !page) return null
    return {
      id_modulo: module.id_modulo,
      nombre_modulo: module.nombre_modulo,
      id_paginas: page.id_paginas,
      nombre_pagina: page.nombre_pagina,
      url: page.url
    }
  }).filter(Boolean)
}

module.exports = { getAllModulos }
