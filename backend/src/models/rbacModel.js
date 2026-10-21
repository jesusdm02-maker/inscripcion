const db = require('../db');
const { getDefaultRoleModuleAccess } = require('./roleAccessDefaults')

function normalizeRole(cargo) {
  const map = {
    Administrador: 'admin',
    administrador: 'admin',
    Admin: 'admin',
    admin: 'admin',
    Coordinador: 'coordinador',
    coordinador: 'coordinador',
    Secretaria: 'secretaria',
    secretaria: 'secretaria',
    Docente: 'docente',
    docente: 'docente',
    Representante: 'representante',
    representante: 'representante',
    Editor: 'editor',
    Consultor: 'consultor',
    SuperUser: 'superuser',
    Invitado: 'user',
    Usuario: 'user',
    User: 'user',
    Guest: 'user',
    Auditor: 'auditor'
  };
  const value = String(cargo || '').trim();
  return map[value] || value.toLowerCase().replace(/\s+/g, '_') || 'user';
}

function normalizeModuleName(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[_\s-]+/g, '');
}

function normalizePermissionAction(value) {
  const action = String(value || '').trim().toLocaleLowerCase('es');
  if (action === 'mirada lasciva' || action === 'leer' || action === 'lectura') return 'leer';
  return action;
}

async function resolveRoleId(role) {
  const roleName = String(role || 'user').trim();
  if (!roleName) {
    const error = new Error('Selecciona un rol válido para el usuario.')
    error.code = 'ROLE_NOT_FOUND'
    throw error
  }

  const normalized = roleName.toLowerCase();
  const aliases = {
    admin: ['admin', 'administrador'],
    administrador: ['admin', 'administrador'],
    user: ['user', 'usuario', 'invitado', 'guest'],
    usuario: ['user', 'usuario', 'invitado', 'guest'],
    invitado: ['user', 'usuario', 'invitado', 'guest'],
    guest: ['user', 'usuario', 'invitado', 'guest']
  }
  const candidates = aliases[normalized] || [normalized]
  const [rows] = await db.query(
    'SELECT id FROM rol WHERE LOWER(cargo) IN (?) ORDER BY id LIMIT 1',
    [candidates]
  )
  if (rows[0]) return rows[0].id

  const error = new Error(`El rol "${roleName}" no existe. Créalo antes de asignarlo a un usuario.`)
  error.code = 'ROLE_NOT_FOUND'
  throw error
}

async function getUserRoleAndPermissions(userId) {
  const [rows] = await db.query(
    `SELECT r.cargo AS role_name,
            r.id,
            m.id AS id_modulo,
            m.nombre_modulo,
            p.accion AS permiso
     FROM user u
     LEFT JOIN r_u_r ru ON ru.id_usuarios = u.id
     LEFT JOIN rol r ON r.id = ru.id_rol
     LEFT JOIN r_m_ur rmu ON rmu.id_r_u_r = ru.id
     LEFT JOIN modulo m ON m.id = rmu.id_modulo
     LEFT JOIN r_mp_per rmp ON rmp.id_modulo_usuario_rol = rmu.id
     LEFT JOIN permisos p ON p.id = rmp.id_permisos
     WHERE u.id = ?
     ORDER BY m.id ASC, p.id ASC`,
    [userId]
  );

  const roleName = rows?.[0]?.role_name || 'user';
  const role = normalizeRole(roleName);

  const [catalogRows] = await db.query('SELECT nombre_modulo FROM modulo ORDER BY id ASC');
  const allModules = catalogRows.map((row) => row.nombre_modulo);
  const isAdministrator = role === 'admin' || role === 'administrador';
  const modulePermissions = {};
  const representativePermissions = new Set(['nuevoingreso:crear', 'preinscripciones:crear']);

  for (const row of rows) {
    if (!row.id_modulo || !row.nombre_modulo || !row.permiso) continue;
    const permissionKey = `${normalizeModuleName(row.nombre_modulo)}:${normalizePermissionAction(row.permiso)}`;
    if (role === 'representante' && !representativePermissions.has(permissionKey)) continue;
    const actions = modulePermissions[row.nombre_modulo] || [];
    const action = normalizePermissionAction(row.permiso);
    const displayAction = action === 'leer' ? 'Leer' : String(row.permiso).trim();
    if (!actions.includes(displayAction)) {
      actions.push(displayAction);
    }
    modulePermissions[row.nombre_modulo] = actions;
  }

  if (isAdministrator) {
    const [permissionRows] = await db.query('SELECT accion FROM permisos ORDER BY id ASC');
    const allActions = Array.from(new Set(permissionRows.map((row) => {
      const action = normalizePermissionAction(row.accion);
      return action === 'leer' ? 'Leer' : String(row.accion).trim();
    })));
    for (const moduleName of allModules) modulePermissions[moduleName] = allActions;
  }

  if (role === 'representante') {
    for (const moduleName of Object.keys(modulePermissions)) delete modulePermissions[moduleName];
    modulePermissions['Nuevo ingreso'] = ['Crear'];
    modulePermissions.Preinscripciones = ['Crear'];
  }

  const resolvedModules = Object.keys(modulePermissions)
    .filter((moduleName) => modulePermissions[moduleName].some((action) => normalizePermissionAction(action) === 'leer'));
  const permissions = Array.from(new Set(Object.values(modulePermissions).flat()));

  const pages = isAdministrator
    ? (await db.query('SELECT url FROM paginas ORDER BY id ASC'))[0]
      .map((page) => page.url)
      .filter(Boolean)
    : [];

  return {
    roleName,
    role,
    permissions,
    modules: resolvedModules,
    modulePermissions,
    pages
  };
}

async function userHasRole(userId, expectedRole) {
  if (!userId) return false;
  const rbac = await getUserRoleAndPermissions(userId);
  if (expectedRole === 'admin') {
    return rbac?.role === 'admin' || rbac?.role === 'administrador';
  }
  return rbac?.role === expectedRole;
}

async function userHasPermission(userId, permission, moduleName) {
  if (!userId || !permission || !moduleName) return false;
  const [rows] = await db.query(
    `SELECT r.cargo AS role_name, m.nombre_modulo, p.accion
       FROM r_u_r ur
      JOIN rol r ON r.id = ur.id_rol
      JOIN r_m_ur rmu ON rmu.id_r_u_r = ur.id
      JOIN modulo m ON m.id = rmu.id_modulo
      JOIN r_mp_per rmp ON rmp.id_modulo_usuario_rol = rmu.id
      JOIN permisos p ON p.id = rmp.id_permisos
      WHERE ur.id_usuarios = ?
      `,
    [userId]
  );
  const expectedPermission = normalizePermissionAction(permission);
  const role = normalizeRole(rows[0]?.role_name);
  if (role === 'representante' && (
    expectedPermission !== 'crear' ||
    !['nuevoingreso', 'preinscripciones'].includes(normalizeModuleName(moduleName))
  )) return false;
  const moduleAliases = {
    alumnos: 'alumnosregistrados'
  }
  const normalizedModule = normalizeModuleName(moduleName);
  const expectedModule = moduleAliases[normalizedModule] || normalizedModule;
  return rows.some((row) =>
    normalizeModuleName(row.nombre_modulo) === expectedModule &&
    normalizePermissionAction(row.accion) === expectedPermission
  );
}

async function ensureUsuarioRow(connection, userId, nombre) {
  if (!userId) return null;
  const [[existing]] = await connection.query('SELECT id FROM usuarios WHERE id = ?', [userId]);
  if (existing) {
    return existing.id;
  }
  await connection.query('INSERT INTO usuarios (id, nombre, id_direccion_usuario) VALUES (?, ?, NULL)', [userId, nombre || null]);
  return userId;
}

async function copyRoleModuleAccess(connection, assignmentId, roleId) {
  const [[role]] = await connection.query('SELECT cargo FROM rol WHERE id = ? FOR UPDATE', [roleId]);
  const isAdministrator = ['admin', 'administrador'].includes(String(role?.cargo || '').trim().toLowerCase());

  await connection.query(
    `DELETE permission
       FROM r_mp_per permission
       JOIN r_m_ur module_access
         ON module_access.id = permission.id_modulo_usuario_rol
      WHERE module_access.id_r_u_r = ?`,
    [assignmentId]
  );
  await connection.query('DELETE FROM r_m_ur WHERE id_r_u_r = ?', [assignmentId]);

  const isRepresentative = normalizeRole(role?.cargo) === 'representante';
  let templateAccess = [];
  if (isAdministrator) {
    const [modules] = await connection.query('SELECT id AS id_modulo FROM modulo ORDER BY id');
    const [permissions] = await connection.query('SELECT id AS id_permisos FROM permisos ORDER BY id');
    templateAccess = modules.map((module) => ({
      id_modulo: module.id_modulo,
      permisos: permissions.map((permission) => permission.id_permisos)
    }));
  } else if (isRepresentative) {
    templateAccess = await getDefaultRoleModuleAccess(connection, role?.cargo) || [];
  } else {
    const [[template]] = await connection.query(
      `SELECT user_role.id
         FROM r_u_r user_role
        WHERE user_role.id_rol = ? AND user_role.id <> ?
          AND EXISTS (SELECT 1 FROM r_m_ur module_access WHERE module_access.id_r_u_r = user_role.id)
        ORDER BY user_role.id
        LIMIT 1`,
      [roleId, assignmentId]
    );
    if (template) {
      const [rows] = await connection.query(
        `SELECT module_access.id AS id_r_m_ur,
                module_access.id_modulo,
                permission.id_permisos,
                permission.id_paginas
           FROM r_m_ur module_access
           LEFT JOIN r_mp_per permission
             ON permission.id_modulo_usuario_rol = module_access.id
          WHERE module_access.id_r_u_r = ?
          ORDER BY module_access.id, permission.id_permisos`,
        [template.id]
      );
      const modulesById = new Map();
      for (const row of rows) {
        const moduleId = Number(row.id_modulo);
        if (!modulesById.has(moduleId)) modulesById.set(moduleId, { id_modulo: moduleId, permissions: [] });
        if (row.id_permisos !== null) {
          modulesById.get(moduleId).permissions.push({
            id_permisos: row.id_permisos,
            id_paginas: row.id_paginas
          });
        }
      }
      templateAccess = Array.from(modulesById.values());
    }
  }

  if (templateAccess.length === 0) {
    templateAccess = await getDefaultRoleModuleAccess(connection, role?.cargo) || [];
  }

  const [modulePages] = await connection.query(
    `SELECT module.id AS id_modulo, page.id AS id_paginas
       FROM modulo module
       LEFT JOIN paginas page ON page.nombre_pagina = module.nombre_modulo`
  );
  const pageByModuleId = new Map(modulePages.map((row) => [
    Number(row.id_modulo),
    row.id_paginas === null ? null : Number(row.id_paginas)
  ]));

  for (const module of templateAccess) {
    const [inserted] = await connection.query(
      'INSERT INTO r_m_ur (id_r_u_r, id_modulo) VALUES (?, ?)',
      [assignmentId, module.id_modulo]
    );
    const permissions = Array.isArray(module.permisos) ? module.permisos : module.permissions;
    for (const permission of permissions) {
      const permissionId = typeof permission === 'object' ? permission.id_permisos : permission;
      const configuredPageId = typeof permission === 'object' ? permission.id_paginas : null;
      const pageId = configuredPageId ?? pageByModuleId.get(Number(module.id_modulo)) ?? null;
      await connection.query(
        'INSERT INTO r_mp_per (id_permisos, id_modulo_usuario_rol, id_paginas) VALUES (?, ?, ?)',
        [permissionId, inserted.insertId, pageId]
      );
    }
  }
}

async function assignRoleToUser(userId, roleIdOrName, nombreUsuario = null) {
  if (!userId) return null;
  const roleId = typeof roleIdOrName === 'number' ? roleIdOrName : await resolveRoleId(roleIdOrName);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    const [[role]] = await connection.query('SELECT id FROM rol WHERE id = ? FOR UPDATE', [roleId]);
    if (!role) {
      const error = new Error('El rol no existe.');
      error.code = 'ROLE_NOT_FOUND';
      throw error;
    }
    await ensureUsuarioRow(connection, userId, nombreUsuario);
    const [[existing]] = await connection.query(
      'SELECT id, id_rol FROM r_u_r WHERE id_usuarios = ? FOR UPDATE',
      [userId]
    );

    if (existing) {
      if (Number(existing.id_rol) !== Number(roleId)) {
        await copyRoleModuleAccess(connection, existing.id, roleId);
        await connection.query('UPDATE r_u_r SET id_rol = ? WHERE id = ?', [roleId, existing.id]);
      }
      await connection.commit();
      return existing.id;
    }

    const [result] = await connection.query(
      'INSERT INTO r_u_r (id_usuarios, id_rol) VALUES (?, ?)',
      [userId, roleId]
    );
    await copyRoleModuleAccess(connection, result.insertId, roleId);
    await connection.commit();
    return result.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function removeRoleFromUser(userId) {
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()
    const [[assignment]] = await connection.query(
      `SELECT ur.id, ur.id_rol, r.cargo
         FROM r_u_r ur
         JOIN rol r ON r.id = ur.id_rol
        WHERE ur.id_usuarios = ?
        FOR UPDATE`,
      [userId]
    )
    if (!assignment) {
      const error = new Error('El usuario no tiene un rol asignado.')
      error.code = 'ROLE_NOT_ASSIGNED'
      throw error
    }

    if (['admin', 'administrador'].includes(String(assignment.cargo).trim().toLowerCase())) {
      await connection.query('SELECT id FROM rol WHERE id = ? FOR UPDATE', [assignment.id_rol])
      const [[{ administratorCount }]] = await connection.query(
        `SELECT COUNT(*) AS administratorCount
           FROM r_u_r ur
           JOIN rol r ON r.id = ur.id_rol
          WHERE LOWER(r.cargo) IN ('admin', 'administrador')`
      )
      if (Number(administratorCount) <= 1) {
        const error = new Error('No se puede quitar el rol del último administrador.')
        error.code = 'LAST_ADMIN'
        throw error
      }
    }

    await connection.query(
      `DELETE permission
         FROM r_mp_per permission
         JOIN r_m_ur module_access
           ON module_access.id = permission.id_modulo_usuario_rol
        WHERE module_access.id_r_u_r = ?`,
      [assignment.id]
    )
    await connection.query('DELETE FROM r_m_ur WHERE id_r_u_r = ?', [assignment.id])
    await connection.query('DELETE FROM r_u_r WHERE id = ?', [assignment.id])
    await connection.commit()
    return { role: assignment.cargo }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

module.exports = { getUserRoleAndPermissions, userHasRole, userHasPermission, assignRoleToUser, removeRoleFromUser, resolveRoleId };
