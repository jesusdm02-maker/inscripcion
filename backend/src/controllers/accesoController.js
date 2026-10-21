const db = require('../db')

async function ensureAdministratorAccess(connection) {
  const [administratorAssignments] = await connection.query(
    `SELECT user_role.id
       FROM r_u_r user_role
       JOIN rol ON rol.id = user_role.id_rol
      WHERE LOWER(TRIM(rol.cargo)) IN ('admin', 'administrador')
      FOR UPDATE`
  )
  const [modules] = await connection.query('SELECT id FROM modulo ORDER BY id')
  const [permissions] = await connection.query('SELECT id FROM permisos ORDER BY id')
  const [modulePages] = await connection.query(
    `SELECT module.id AS id_modulo, page.id AS id_paginas
       FROM modulo module
       LEFT JOIN paginas page ON page.nombre_pagina = module.nombre_modulo`
  )
  const pageByModuleId = new Map(modulePages.map((row) => [
    Number(row.id_modulo),
    row.id_paginas === null ? null : Number(row.id_paginas)
  ]))

  for (const assignment of administratorAssignments) {
    const [existingModuleAccess] = await connection.query(
      'SELECT id, id_modulo FROM r_m_ur WHERE id_r_u_r = ? FOR UPDATE',
      [assignment.id]
    )
    const moduleAccessById = new Map(existingModuleAccess.map((row) => [Number(row.id_modulo), Number(row.id)]))

    for (const module of modules) {
      let moduleAccessId = moduleAccessById.get(Number(module.id))
      if (!moduleAccessId) {
        const [result] = await connection.query(
          'INSERT INTO r_m_ur (id_r_u_r, id_modulo) VALUES (?, ?)',
          [assignment.id, module.id]
        )
        moduleAccessId = Number(result.insertId)
        moduleAccessById.set(Number(module.id), moduleAccessId)
      }

      const [existingPermissions] = await connection.query(
        'SELECT id_permisos FROM r_mp_per WHERE id_modulo_usuario_rol = ?',
        [moduleAccessId]
      )
      const permissionIds = new Set(existingPermissions.map((row) => Number(row.id_permisos)))
      for (const permission of permissions) {
        if (permissionIds.has(Number(permission.id))) continue
        await connection.query(
          'INSERT INTO r_mp_per (id_permisos, id_modulo_usuario_rol, id_paginas) VALUES (?, ?, ?)',
          [permission.id, moduleAccessId, pageByModuleId.get(Number(module.id)) ?? null]
        )
      }
    }
  }
}

async function listRoleModuleAccess(req, res) {
  try {
    const connection = await db.getConnection()
    try {
      await connection.beginTransaction()
      await ensureAdministratorAccess(connection)
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }

    await db.query("UPDATE permisos SET accion = 'leer' WHERE accion = 'mirada lasciva'")
    const [roles] = await db.query('SELECT id, cargo FROM rol ORDER BY id ASC')
    const [modulos] = await db.query('SELECT id AS id_modulo, nombre_modulo FROM modulo ORDER BY id ASC')
    const [permisosRows] = await db.query('SELECT id AS id_permisos, accion FROM permisos ORDER BY id ASC')
    const [accessRows] = await db.query(
      `SELECT module_access.id AS id_r_m_ur,
              user_role.id_rol,
              module_access.id_modulo
         FROM r_m_ur module_access
         JOIN r_u_r user_role ON user_role.id = module_access.id_r_u_r`
    )
    const [permissionRows] = await db.query('SELECT id_permisos, id_modulo_usuario_rol FROM r_mp_per')

    const accessMap = new Map()
    for (const row of accessRows) {
      if (!accessMap.has(Number(row.id_rol))) {
        accessMap.set(Number(row.id_rol), new Set())
      }
      accessMap.get(Number(row.id_rol)).add(Number(row.id_modulo))
    }

    const access = Array.from(accessMap.entries()).map(([id_rol, modules]) => ({
      id_rol,
      modulos: Array.from(modules)
    }))

    const moduleAccessById = new Map()
    for (const row of accessRows) {
      moduleAccessById.set(Number(row.id_r_m_ur), {
        id_rol: Number(row.id_rol),
        id_modulo: Number(row.id_modulo)
      })
    }

    const permisosPorModulo = []
    const permissionsByKey = new Map()

    for (const row of permissionRows) {
      const relation = moduleAccessById.get(Number(row.id_modulo_usuario_rol))
      if (!relation) continue

      const key = `${relation.id_rol}:${relation.id_modulo}`
      if (!permissionsByKey.has(key)) {
        permissionsByKey.set(key, new Set())
      }
      permissionsByKey.get(key).add(Number(row.id_permisos))
    }

    for (const [key, permissions] of permissionsByKey.entries()) {
      const [id_rol, id_modulo] = key.split(':').map(Number)
      permisosPorModulo.push({
        id_rol,
        id_modulo,
        permisos: Array.from(permissions)
      })
    }

    res.json({
      roles,
      modulos,
      permisos: permisosRows.map(row => ({
        id_permisos: Number(row.id_permisos),
        accion: row.accion === 'mirada lasciva' ? 'Leer' : row.accion
      })),
      access,
      permisosPorModulo
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'No se pudo obtener el acceso de módulos' })
  }
}

async function saveRoleModuleAccess(req, res) {
  const roleId = Number(req.body?.roleId)
  const { moduleIds, modulePermissions } = req.body || {}

  if (!Number.isInteger(roleId) || roleId <= 0) {
    return res.status(400).json({ error: 'El rol es requerido' })
  }
  if (!Array.isArray(moduleIds) || !Array.isArray(modulePermissions)) {
    return res.status(400).json({ error: 'La configuración de módulos y permisos no es válida.' })
  }

  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()
    const [[role]] = await connection.query(
      'SELECT id, cargo FROM rol WHERE id = ? FOR UPDATE',
      [roleId]
    )
    if (!role) {
      await connection.rollback()
      return res.status(404).json({ error: 'No se encontró el rol seleccionado.' })
    }
    if (['admin', 'administrador'].includes(String(role.cargo).trim().toLowerCase())) {
      await ensureAdministratorAccess(connection)
      await connection.commit()
      return res.json({ success: true })
    }

    const [assignments] = await connection.query(
      'SELECT id FROM r_u_r WHERE id_rol = ? FOR UPDATE',
      [roleId]
    )
    if (assignments.length === 0) {
      await connection.rollback()
      return res.status(409).json({ error: 'Asigna este rol a un usuario antes de configurar sus módulos.' })
    }

    const [modulePages] = await connection.query(
      `SELECT module.id AS id_modulo, page.id AS id_paginas
         FROM modulo module
         LEFT JOIN paginas page ON page.nombre_pagina = module.nombre_modulo`
    )
    const pageByModuleId = new Map(modulePages.map((row) => [
      Number(row.id_modulo),
      row.id_paginas === null ? null : Number(row.id_paginas)
    ]))

    await connection.query(
      `DELETE permission
         FROM r_mp_per permission
         JOIN r_m_ur module_access
           ON module_access.id = permission.id_modulo_usuario_rol
         JOIN r_u_r user_role ON user_role.id = module_access.id_r_u_r
        WHERE user_role.id_rol = ?`,
      [roleId]
    )
    await connection.query(
      `DELETE module_access
         FROM r_m_ur module_access
         JOIN r_u_r user_role ON user_role.id = module_access.id_r_u_r
        WHERE user_role.id_rol = ?`,
      [roleId]
    )

    for (const assignment of assignments) {
      for (const moduleId of moduleIds) {
        const [moduleAccess] = await connection.query(
          'INSERT INTO r_m_ur (id_r_u_r, id_modulo) VALUES (?, ?)',
          [assignment.id, moduleId]
        )
        const moduleAccessId = moduleAccess.insertId

        const permissionsForModule = modulePermissions.find(item => Number(item.id_modulo) === Number(moduleId))?.permisos || []
        for (const permissionId of permissionsForModule) {
          await connection.query(
            'INSERT INTO r_mp_per (id_permisos, id_modulo_usuario_rol, id_paginas) VALUES (?, ?, ?)',
            [permissionId, moduleAccessId, pageByModuleId.get(Number(moduleId)) ?? null]
          )
        }
      }
    }

    await connection.commit()
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    await connection.rollback()
    res.status(500).json({ error: 'No se pudo guardar el acceso por rol' })
  } finally {
    connection.release()
  }
}

module.exports = { listRoleModuleAccess, saveRoleModuleAccess }
