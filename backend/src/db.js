const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const pendingSolicitudStorage = require('./services/pendingSolicitudStorage');
const { NAVIGATION_PAGES } = require('./config/navigationCatalog');
dotenv.config();

const config = {
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  database: process.env.DB_DATABASE || 'preinscripciones',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  charset: 'utf8mb4',
  connectionLimit: 10
};

const rawPassword = typeof process.env.DB_PASSWORD === 'string' ? process.env.DB_PASSWORD.trim() : '';
if (rawPassword !== '') {
  config.password = rawPassword;
}

const pool = mysql.createPool(config);

async function ensureForeignKey(tableName, columnName, referencedTable, referencedColumn, constraintName) {
  const [existingRows] = await pool.query(`
    SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
      AND REFERENCED_TABLE_NAME IS NOT NULL
  `, [tableName, columnName]);

  const matchingRelation = existingRows.find((row) =>
    row.REFERENCED_TABLE_NAME === referencedTable &&
    row.REFERENCED_COLUMN_NAME === referencedColumn
  );
  if (matchingRelation) return;

  if (existingRows.length > 0) {
    throw new Error(`${tableName}.${columnName} ya tiene una relación FK incompatible`);
  }

  const [columnRows] = await pool.query(`
    SELECT TABLE_NAME, COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND ((TABLE_NAME = ? AND COLUMN_NAME = ?) OR (TABLE_NAME = ? AND COLUMN_NAME = ?))
  `, [tableName, columnName, referencedTable, referencedColumn]);

  if (columnRows.length !== 2) {
    throw new Error(`No se puede crear ${constraintName}: falta una columna relacionada`);
  }

  await pool.query(
    `ALTER TABLE \`${tableName}\`
     ADD CONSTRAINT \`${constraintName}\`
     FOREIGN KEY (\`${columnName}\`) REFERENCES \`${referencedTable}\` (\`${referencedColumn}\`)`
  );
}

async function ensureNavigationCatalog() {
  const moduleNames = new Set(NAVIGATION_PAGES.map(({ module }) => module));
  for (const moduleName of moduleNames) {
    const [modules] = await pool.query(
      'SELECT id FROM modulo WHERE nombre_modulo = ?',
      [moduleName]
    );
    if (modules.length > 1) {
      throw new Error(`El catálogo de módulos contiene duplicados para "${moduleName}"`);
    }
    if (modules.length === 0) {
      await pool.query('INSERT INTO modulo (nombre_modulo) VALUES (?)', [moduleName]);
    }
  }

  for (const { url, name: pageName } of NAVIGATION_PAGES) {
    const [pages] = await pool.query(
      'SELECT id FROM paginas WHERE url = ?',
      [url]
    );
    if (pages.length > 1) {
      throw new Error(`El catálogo de páginas contiene rutas duplicadas para "${url}"`);
    }
    if (pages.length === 0) {
      await pool.query(
        'INSERT INTO paginas (url, nombre_pagina) VALUES (?, ?)',
        [url, pageName]
      );
      continue;
    }
    await pool.query(
      'UPDATE paginas SET nombre_pagina = ? WHERE url = ?',
      [pageName, url]
    );
  }
}

async function copyModuleAccess(sourceModuleName, targetModuleName, targetPageUrl) {
  await pool.query(
    `INSERT INTO r_m_ur (id_r_u_r, id_modulo)
     SELECT source_access.id_r_u_r, target_module.id
       FROM r_m_ur source_access
       JOIN modulo source_module ON source_module.id = source_access.id_modulo
       JOIN modulo target_module ON target_module.nombre_modulo = ?
       LEFT JOIN r_m_ur target_access
         ON target_access.id_r_u_r = source_access.id_r_u_r
        AND target_access.id_modulo = target_module.id
      WHERE source_module.nombre_modulo = ?
        AND target_access.id IS NULL`,
    [targetModuleName, sourceModuleName]
  )

  await pool.query(
    `INSERT INTO r_mp_per (id_permisos, id_modulo_usuario_rol, id_paginas)
     SELECT DISTINCT source_permission.id_permisos,
            target_access.id,
            target_page.id
       FROM r_m_ur source_access
       JOIN modulo source_module ON source_module.id = source_access.id_modulo
       JOIN r_mp_per source_permission
         ON source_permission.id_modulo_usuario_rol = source_access.id
       JOIN r_m_ur target_access
         ON target_access.id_r_u_r = source_access.id_r_u_r
       JOIN modulo target_module
         ON target_module.id = target_access.id_modulo
        AND target_module.nombre_modulo = ?
       JOIN paginas target_page ON target_page.url = ?
       LEFT JOIN r_mp_per existing
         ON existing.id_permisos = source_permission.id_permisos
        AND existing.id_modulo_usuario_rol = target_access.id
        AND existing.id_paginas = target_page.id
      WHERE source_module.nombre_modulo = ?
        AND existing.id IS NULL`,
    [targetModuleName, targetPageUrl, sourceModuleName]
  )
}

async function migrateSidebarModuleCatalog() {
  await copyModuleAccess('Preinscripciones', 'Nuevo ingreso', '/alumnos/nuevo-ingreso')
  for (const [targetModule, targetPage] of [
    ['Usuarios', '/configuracion/usuarios'],
    ['Roles', '/configuracion/roles'],
    ['Módulos', '/configuracion/modulos']
  ]) {
    await copyModuleAccess('Configuración', targetModule, targetPage)
  }

  await pool.query(`
    DELETE permission
      FROM r_mp_per permission
      JOIN r_m_ur module_access
        ON module_access.id = permission.id_modulo_usuario_rol
      JOIN modulo module ON module.id = module_access.id_modulo
     WHERE module.nombre_modulo = 'Configuración'
  `)
  await pool.query(`
    DELETE module_access
      FROM r_m_ur module_access
      JOIN modulo module ON module.id = module_access.id_modulo
     WHERE module.nombre_modulo = 'Configuración'
  `)
  await pool.query("DELETE FROM modulo WHERE nombre_modulo = 'Configuración'")
}

async function migrateLegacyGradeSectionColumn() {
  const [legacyColumn] = await pool.query("SHOW COLUMNS FROM grados LIKE 'id_seccion'");
  if (legacyColumn.length === 0) return;

  await pool.query(`
    INSERT IGNORE INTO r_g_s (id_grado, id_seccion)
    SELECT id, id_seccion
    FROM grados
    WHERE id_seccion IS NOT NULL
  `);

  const [foreignKeys] = await pool.query(`
    SELECT CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'grados'
      AND COLUMN_NAME = 'id_seccion'
      AND REFERENCED_TABLE_NAME IS NOT NULL
  `);
  for (const foreignKey of foreignKeys) {
    await pool.query(`ALTER TABLE grados DROP FOREIGN KEY \`${foreignKey.CONSTRAINT_NAME}\``);
  }

  const [indexes] = await pool.query("SHOW INDEX FROM grados WHERE Column_name = 'id_seccion'");
  for (const indexName of new Set(indexes.map((index) => index.Key_name))) {
    if (indexName !== 'PRIMARY') {
      await pool.query(`ALTER TABLE grados DROP INDEX \`${indexName}\``);
    }
  }

  await pool.query('ALTER TABLE grados DROP COLUMN id_seccion');
}

async function migrateLegacyAlumnoDocumentColumn() {
  const [legacyColumn] = await pool.query("SHOW COLUMNS FROM alumno LIKE 'id_documento'");
  if (legacyColumn.length === 0) return;

  await pool.query(`
    INSERT IGNORE INTO r_a_d (id_alumno, id_documento, tipo_documento)
    SELECT id, id_documento, 'Documento del alumno'
    FROM alumno
    WHERE id_documento IS NOT NULL
  `);

  const [preinscriptionColumn] = await pool.query(
    "SHOW COLUMNS FROM preinscripciones LIKE 'id_alumno'"
  );
  if (preinscriptionColumn.length > 0) {
    await pool.query(`
      UPDATE preinscripciones p
      JOIN alumno a ON a.id = p.id_alumno
      JOIN r_a_d rad ON rad.id_alumno = a.id AND rad.id_documento = a.id_documento
         SET p.id_r_a_d = rad.id
       WHERE p.id_r_a_d IS NULL AND a.id_documento IS NOT NULL
    `);
  }

  const [foreignKeys] = await pool.query(`
    SELECT CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'alumno'
      AND COLUMN_NAME = 'id_documento'
      AND REFERENCED_TABLE_NAME IS NOT NULL
  `);
  for (const foreignKey of foreignKeys) {
    await pool.query(`ALTER TABLE alumno DROP FOREIGN KEY \`${foreignKey.CONSTRAINT_NAME}\``);
  }

  const [indexes] = await pool.query("SHOW INDEX FROM alumno WHERE Column_name = 'id_documento'");
  for (const indexName of new Set(indexes.map((index) => index.Key_name))) {
    if (indexName !== 'PRIMARY') {
      await pool.query(`ALTER TABLE alumno DROP INDEX \`${indexName}\``);
    }
  }

  await pool.query('ALTER TABLE alumno DROP COLUMN id_documento');
}

async function migrateLegacyPreinscriptionUserColumn() {
  const [legacyColumn] = await pool.query("SHOW COLUMNS FROM preinscripciones LIKE 'id_user'");
  if (legacyColumn.length === 0) return;

  await pool.query(`
    UPDATE solicitudes_preinscripciones s
    JOIN preinscripciones p ON p.id = s.id_preinscripcion
       SET s.id_user = p.id_user
     WHERE s.id_user IS NULL AND p.id_user IS NOT NULL
  `);
  const [[{ unmappedUsers }]] = await pool.query(`
    SELECT COUNT(*) AS unmappedUsers
    FROM preinscripciones p
    LEFT JOIN solicitudes_preinscripciones s
      ON s.id_preinscripcion = p.id AND s.id_user = p.id_user
    WHERE p.id_user IS NOT NULL AND s.id IS NULL
  `);
  if (Number(unmappedUsers) > 0) {
    throw new Error(`No se puede eliminar preinscripciones.id_user: hay ${unmappedUsers} usuarios sin solicitud asociada para conservar la relación.`);
  }

  const [foreignKeys] = await pool.query(`
    SELECT CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'preinscripciones'
      AND COLUMN_NAME = 'id_user'
      AND REFERENCED_TABLE_NAME IS NOT NULL
  `);
  for (const foreignKey of foreignKeys) {
    await pool.query(`ALTER TABLE preinscripciones DROP FOREIGN KEY \`${foreignKey.CONSTRAINT_NAME}\``);
  }

  const [indexes] = await pool.query("SHOW INDEX FROM preinscripciones WHERE Column_name = 'id_user'");
  for (const indexName of new Set(indexes.map((index) => index.Key_name))) {
    if (indexName !== 'PRIMARY') {
      await pool.query(`ALTER TABLE preinscripciones DROP INDEX \`${indexName}\``);
    }
  }

  await pool.query('ALTER TABLE preinscripciones DROP COLUMN id_user');
}

async function migrateLegacyPageModuleColumn() {
  const [legacyColumn] = await pool.query("SHOW COLUMNS FROM paginas LIKE 'id_modulo'");
  if (legacyColumn.length === 0) return;

  const [foreignKeys] = await pool.query(`
    SELECT CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'paginas'
      AND COLUMN_NAME = 'id_modulo'
      AND REFERENCED_TABLE_NAME IS NOT NULL
  `);
  for (const foreignKey of foreignKeys) {
    await pool.query(`ALTER TABLE paginas DROP FOREIGN KEY \`${foreignKey.CONSTRAINT_NAME}\``);
  }

  const [indexes] = await pool.query("SHOW INDEX FROM paginas WHERE Column_name = 'id_modulo'");
  for (const indexName of new Set(indexes.map((index) => index.Key_name))) {
    if (indexName !== 'PRIMARY') {
      await pool.query(`ALTER TABLE paginas DROP INDEX \`${indexName}\``);
    }
  }

  await pool.query('ALTER TABLE paginas DROP COLUMN id_modulo');
}

async function migrateRoleModuleAccessForeignKey() {
  const [legacyColumns] = await pool.query("SHOW COLUMNS FROM r_m_ur LIKE 'id_usuario_rol'");
  const [assignmentColumns] = await pool.query("SHOW COLUMNS FROM r_m_ur LIKE 'id_r_u_r'");
  if (legacyColumns.length === 0) {
    if (assignmentColumns.length === 0) {
      throw new Error('r_m_ur debe contener la relación id_r_u_r.');
    }
    return;
  }

  const [existingForeignKeys] = await pool.query(`
    SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'r_m_ur'
      AND COLUMN_NAME = 'id_usuario_rol'
      AND REFERENCED_TABLE_NAME IS NOT NULL
  `);

  if (assignmentColumns.length === 0) {
    await pool.query('ALTER TABLE r_m_ur ADD COLUMN id_r_u_r INT NULL');
  }

  const legacyUsesAssignments = existingForeignKeys.some((row) =>
    row.REFERENCED_TABLE_NAME === 'r_u_r'
  );
  const [legacyAccessRows] = await pool.query(`
    SELECT module_access.id, module_access.id_usuario_rol, module_access.id_modulo,
           ${legacyUsesAssignments
             ? 'assignment_role.id_rol'
             : 'COALESCE(role_by_id.id, assignment_role.id_rol)'} AS id_rol
      FROM r_m_ur module_access
      LEFT JOIN rol role_by_id
        ON role_by_id.id = module_access.id_usuario_rol
      LEFT JOIN r_u_r assignment_role
        ON assignment_role.id = module_access.id_usuario_rol
  `);
  const mappedLegacyRows = legacyAccessRows.filter((row) => row.id_usuario_rol !== null);
  if (legacyAccessRows.some((row) => row.id_usuario_rol === null) ||
      mappedLegacyRows.some((row) => !row.id_rol || !row.id_modulo)) {
    throw new Error('No se migró r_m_ur: hay relaciones de módulo sin rol/asignación válida.');
  }

  const roleModuleAccess = new Map();
  for (const row of mappedLegacyRows) {
    const roleId = Number(row.id_rol);
    const moduleId = Number(row.id_modulo);
    if (!Number.isInteger(roleId) || !Number.isInteger(moduleId)) {
      throw new Error('No se migró r_m_ur: se encontró una relación de módulo inválida.');
    }
    const key = `${roleId}:${moduleId}`;
    if (!roleModuleAccess.has(key)) {
      roleModuleAccess.set(key, {
        roleId,
        moduleId,
        legacyAccessIds: [],
        permissions: new Map()
      });
    }
    roleModuleAccess.get(key).legacyAccessIds.push(Number(row.id));
  }

  const legacyAccessIds = legacyAccessRows.map((row) => Number(row.id));
  const permissionRows = legacyAccessIds.length
    ? (await pool.query(
      `SELECT id_modulo_usuario_rol, id_permisos, id_paginas
         FROM r_mp_per
        WHERE id_modulo_usuario_rol IN (?)`,
      [legacyAccessIds]
    ))[0]
    : [];
  const legacyToRoleModule = new Map();
  for (const relation of roleModuleAccess.values()) {
    for (const id of relation.legacyAccessIds) legacyToRoleModule.set(id, relation);
  }
  for (const permission of permissionRows) {
    const relation = legacyToRoleModule.get(Number(permission.id_modulo_usuario_rol));
    const permissionKey = `${permission.id_permisos}:${permission.id_paginas ?? ''}`;
    relation.permissions.set(permissionKey, permission);
  }

  if (mappedLegacyRows.length > 0) {
    const roleIdsWithAccess = Array.from(new Set(Array.from(roleModuleAccess.values(), (entry) => entry.roleId)));
    const [[{ rolesWithoutUsers }]] = await pool.query(
      `SELECT COUNT(*) AS rolesWithoutUsers
         FROM rol role
        WHERE role.id IN (?)
          AND NOT EXISTS (SELECT 1 FROM r_u_r user_role WHERE user_role.id_rol = role.id)`,
      [roleIdsWithAccess]
    );
    if (Number(rolesWithoutUsers) > 0) {
      throw new Error('No se migró r_m_ur: asigna los roles configurados a por lo menos un usuario para conservar su plantilla de módulos.');
    }

    const [assignments] = await pool.query('SELECT id, id_rol FROM r_u_r ORDER BY id');
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      if (assignmentColumns.length > 0) {
        await connection.query(`
          DELETE permission
            FROM r_mp_per permission
            JOIN r_m_ur module_access ON module_access.id = permission.id_modulo_usuario_rol
           WHERE module_access.id_r_u_r IS NOT NULL
        `);
        await connection.query('DELETE FROM r_m_ur WHERE id_r_u_r IS NOT NULL');
      }

      for (const assignment of assignments) {
        for (const relation of roleModuleAccess.values()) {
          if (Number(assignment.id_rol) !== relation.roleId) continue;
          const [insertedAccess] = await connection.query(
            'INSERT INTO r_m_ur (id_r_u_r, id_modulo) VALUES (?, ?)',
            [assignment.id, relation.moduleId]
          );
          for (const permission of relation.permissions.values()) {
            await connection.query(
              'INSERT INTO r_mp_per (id_permisos, id_modulo_usuario_rol, id_paginas) VALUES (?, ?, ?)',
              [permission.id_permisos, insertedAccess.insertId, permission.id_paginas]
            );
          }
        }
      }

      await connection.query('DELETE FROM r_mp_per WHERE id_modulo_usuario_rol IN (?)', [legacyAccessIds]);
      await connection.query('DELETE FROM r_m_ur WHERE id IN (?)', [legacyAccessIds]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  for (const foreignKey of existingForeignKeys) {
    await pool.query(`ALTER TABLE r_m_ur DROP FOREIGN KEY \`${foreignKey.CONSTRAINT_NAME}\``);
  }
  const [legacyIndexes] = await pool.query(
    "SHOW INDEX FROM r_m_ur WHERE Column_name = 'id_usuario_rol'"
  );
  for (const indexName of new Set(legacyIndexes.map((index) => index.Key_name))) {
    if (indexName !== 'PRIMARY') {
      await pool.query(`ALTER TABLE r_m_ur DROP INDEX \`${indexName}\``);
    }
  }
  const [currentLegacyColumn] = await pool.query("SHOW COLUMNS FROM r_m_ur LIKE 'id_usuario_rol'");
  if (currentLegacyColumn.length > 0) {
    await pool.query('ALTER TABLE r_m_ur DROP COLUMN id_usuario_rol');
  }
  const [assignmentIndexes] = await pool.query(
    "SHOW INDEX FROM r_m_ur WHERE Column_name = 'id_r_u_r'"
  );
  if (assignmentIndexes.length === 0) {
    await pool.query('ALTER TABLE r_m_ur ADD KEY idx_r_m_ur_r_u_r (id_r_u_r)');
  }
}

async function reorderIdsByValue(tableName, valueColumn, orderedValues) {
  const [rows] = await pool.query('SELECT id, ?? AS sort_value FROM ?? ORDER BY id', [valueColumn, tableName]);
  const rowsByValue = new Map(rows.map((row) => [row.sort_value, row]));

  if (rows.length !== orderedValues.length || orderedValues.some((value) => !rowsByValue.has(value))) {
    throw new Error(`No se puede ordenar ${tableName}: sus registros no coinciden con el catálogo esperado`);
  }

  if (rows.every((row) => row.id === orderedValues.indexOf(row.sort_value) + 1)) return;

  const [foreignKeys] = await pool.query(`
    SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND REFERENCED_TABLE_NAME = ?
      AND REFERENCED_COLUMN_NAME = 'id'
  `, [tableName]);

  try {
    for (const foreignKey of foreignKeys) {
      await pool.query(
        `ALTER TABLE \`${foreignKey.TABLE_NAME}\` DROP FOREIGN KEY \`${foreignKey.CONSTRAINT_NAME}\``
      );
    }

    const offset = Math.max(...rows.map((row) => Number(row.id)), 0) + rows.length + 1;
    for (const foreignKey of foreignKeys) {
      await pool.query(
        `UPDATE \`${foreignKey.TABLE_NAME}\` child
         JOIN \`${tableName}\` parent ON child.\`${foreignKey.COLUMN_NAME}\` = parent.id
         SET child.\`${foreignKey.COLUMN_NAME}\` = parent.id + ?`,
        [offset]
      );
    }

    await pool.query('UPDATE ?? SET id = id + ?', [tableName, offset]);

    const idByValue = new Map(orderedValues.map((value, index) => [value, index + 1]));
    const caseExpression = orderedValues.map(() => 'WHEN ? THEN ?').join(' ');
    const caseValues = orderedValues.flatMap((value) => [value, idByValue.get(value)]);
    for (const foreignKey of foreignKeys) {
      await pool.query(
        `UPDATE \`${foreignKey.TABLE_NAME}\` child
         JOIN \`${tableName}\` parent ON child.\`${foreignKey.COLUMN_NAME}\` = parent.id
         SET child.\`${foreignKey.COLUMN_NAME}\` = CASE parent.\`${valueColumn}\` ${caseExpression} ELSE child.\`${foreignKey.COLUMN_NAME}\` END`,
        caseValues
      );
    }

    for (const value of orderedValues) {
      await pool.query(
        'UPDATE ?? SET id = ? WHERE id = ? AND ?? = ?',
        [tableName, idByValue.get(value), Number(rowsByValue.get(value).id) + offset, valueColumn, value]
      );
    }

    await pool.query(`ALTER TABLE \`${tableName}\` AUTO_INCREMENT = ${orderedValues.length + 1}`);
  } finally {
    for (const foreignKey of foreignKeys) {
      await ensureForeignKey(
        foreignKey.TABLE_NAME,
        foreignKey.COLUMN_NAME,
        tableName,
        'id',
        foreignKey.CONSTRAINT_NAME
      );
    }
  }
}

async function migratePendingSolicitudesToFileStorage() {
  await pendingSolicitudStorage.ensureStorageRoot();
  const [legacyTable] = await pool.query("SHOW TABLES LIKE 'solicitud_archivos'");
  const hasLegacyFiles = legacyTable.length > 0;
  const [pendingRows] = await pool.query(
    `SELECT id, nombre_completo, documento, telefono, correo, contacto, documentos, inscripcion_formal
       FROM solicitudes_preinscripciones
      WHERE estado = 'Pendiente'`
  );
  await pendingSolicitudStorage.migrateLegacyDirectories(pendingRows.map((row) => row.id));

  for (const row of pendingRows) {
    let formData = row.inscripcion_formal;
    if (typeof formData === 'string') {
      try {
        formData = JSON.parse(formData);
      } catch (error) {
        throw new Error(`No se pudo migrar la solicitud pendiente #${row.id}: sus datos JSON no son válidos.`);
      }
    }
    if (!formData || typeof formData !== 'object') {
      formData = {
        nombre_completo: row.nombre_completo,
        documento: row.documento,
        telefono: row.telefono,
        correo: row.correo,
        contacto: row.contacto
      };
    }

    const files = {};
    if (hasLegacyFiles) {
      const [legacyFiles] = await pool.query(
        `SELECT campo, nombre_archivo, tipo_mime, tamano_bytes, archivo
           FROM solicitud_archivos WHERE id_solicitud = ?`,
        [row.id]
      );
      for (const file of legacyFiles) {
        if (!['foto_cedula', 'foto_alumno'].includes(file.campo)) continue;
        files[file.campo] = {
          originalname: file.nombre_archivo,
          mimetype: file.tipo_mime,
          size: Number(file.tamano_bytes),
          buffer: file.archivo
        };
      }
    }

    const hasStagedData = Object.keys(formData).length > 0 || Object.keys(files).length > 0;
    if (hasStagedData && !(await pendingSolicitudStorage.pendingSolicitudExists(row.id))) {
      await pendingSolicitudStorage.writePendingSolicitud(row.id, formData, files);
    }

    await pool.query(
      `UPDATE solicitudes_preinscripciones
          SET nombre_completo = ?, documento = ?, telefono = ?, correo = ?, contacto = ?,
              documentos = NULL, inscripcion_formal = NULL
        WHERE id = ? AND estado = 'Pendiente'`,
      [`Solicitud #${row.id}`, `PENDIENTE-${row.id}`, '', '', '', row.id]
    );
  }

  if (hasLegacyFiles) {
    await pool.query('DROP TABLE solicitud_archivos');
  }

  const [remainingPendingRows] = await pool.query(
    `SELECT id FROM solicitudes_preinscripciones WHERE estado = 'Pendiente'`
  );
  await pendingSolicitudStorage.removeOrphanedPendingSolicitudes(
    remainingPendingRows.map((row) => row.id)
  );
}

async function seedDocumentCatalogs() {
  const statuses = ['Recibido', 'En revisión', 'Aprobado', 'Rechazado'];
  const movements = ['Registro', 'Actualización', 'Consulta', 'Eliminación'];

  for (const name of statuses) {
    await pool.query(
      `INSERT INTO status (nombre_status)
       SELECT ? WHERE NOT EXISTS (
         SELECT 1 FROM status WHERE nombre_status = ?
       )`,
      [name, name]
    );
  }

  for (const name of movements) {
    await pool.query(
      `INSERT INTO movimiento (nombre_movimiento)
       SELECT ? WHERE NOT EXISTS (
         SELECT 1 FROM movimiento WHERE nombre_movimiento = ?
       )`,
      [name, name]
    );
  }

  await pool.query(`
    ALTER TABLE documento
      MODIFY id_status INT NULL,
      MODIFY id_movimiento INT NULL
  `);
}

async function migrateUserContactFields() {
  await pool.query(`
    ALTER TABLE direccion_usuario
      ADD COLUMN IF NOT EXISTS municipio VARCHAR(100) DEFAULT NULL
  `);
  await pool.query(`
    ALTER TABLE direccion_usuario
      MODIFY COLUMN municipio VARCHAR(100) DEFAULT NULL AFTER id
  `);
  await pool.query('DROP TABLE IF EXISTS app_schema_migrations');
}

async function migrateUserContactFieldsToProfiles() {
  await pool.query(`
    ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS telefono VARCHAR(50) DEFAULT NULL AFTER nombre
  `);
  await pool.query(`
    ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS cedula VARCHAR(50) DEFAULT NULL AFTER telefono
  `);
  await pool.query(`
    ALTER TABLE usuarios
      MODIFY COLUMN telefono VARCHAR(50) DEFAULT NULL AFTER nombre,
      MODIFY COLUMN cedula VARCHAR(50) DEFAULT NULL AFTER telefono,
      MODIFY COLUMN id_direccion_usuario INT DEFAULT NULL AFTER cedula
  `);

  const [userColumns] = await pool.query('SHOW COLUMNS FROM `user`');
  const legacyFields = new Set(userColumns.map((column) => column.Field));
  const hasLegacyContactFields = legacyFields.has('telefono') || legacyFields.has('cedula');
  if (!hasLegacyContactFields) return;

  const legacyTelefono = legacyFields.has('telefono') ? 'u.telefono' : 'NULL';
  const legacyCedula = legacyFields.has('cedula') ? 'u.cedula' : 'NULL';
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO usuarios (id, nombre, telefono, cedula, id_direccion_usuario)
       SELECT u.id,
              TRIM(CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellido, ''))),
              ${legacyTelefono},
              ${legacyCedula},
              NULL
         FROM \`user\` u
         LEFT JOIN usuarios profile ON profile.id = u.id
        WHERE profile.id IS NULL`
    );
    await connection.query(
      `UPDATE usuarios profile
       JOIN \`user\` u ON u.id = profile.id
          SET profile.telefono = COALESCE(NULLIF(profile.telefono, ''), ${legacyTelefono}),
              profile.cedula = COALESCE(NULLIF(profile.cedula, ''), ${legacyCedula})`
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  if (legacyFields.has('telefono')) {
    await pool.query('ALTER TABLE `user` DROP COLUMN telefono');
  }
  if (legacyFields.has('cedula')) {
    await pool.query('ALTER TABLE `user` DROP COLUMN cedula');
  }
}

async function initializeSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS solicitudes_preinscripciones (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre_completo VARCHAR(255) NOT NULL,
      documento VARCHAR(100) NOT NULL,
      telefono VARCHAR(50) NOT NULL,
      correo VARCHAR(255) NOT NULL,
      contacto VARCHAR(255) NOT NULL,
      documentos JSON DEFAULT NULL,
      estado VARCHAR(50) DEFAULT 'Pendiente',
      aprobado_por VARCHAR(255) DEFAULT NULL,
      inscripcion_formal JSON DEFAULT NULL,
      creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_user INT NULL
    )
  `);

  await pool.query(`
    ALTER TABLE solicitudes_preinscripciones
      ADD COLUMN IF NOT EXISTS documentos JSON DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS aprobado_por VARCHAR(255) DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS inscripcion_formal JSON DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS id_alumno INT NULL,
      ADD COLUMN IF NOT EXISTS id_preinscripcion INT NULL,
      ADD COLUMN IF NOT EXISTS id_user INT NULL,
      ADD COLUMN IF NOT EXISTS creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  `);

  await pool.query(`
    ALTER TABLE \`user\`
      ADD COLUMN IF NOT EXISTS password VARCHAR(255) DEFAULT NULL
  `);
  await migrateUserContactFields();
  await migrateUserContactFieldsToProfiles();

  await pool.query('DROP TABLE IF EXISTS auth_sessions');

  const [representanteColumns] = await pool.query('SHOW COLUMNS FROM representantes');
  const representativeFieldNames = new Set(representanteColumns.map((column) => column.Field));

  for (const [legacyName, canonicalName] of [['nombre', 'nombres'], ['apellido', 'apellidos']]) {
    const hasLegacyName = representativeFieldNames.has(legacyName);
    const hasCanonicalName = representativeFieldNames.has(canonicalName);

    if (hasLegacyName && !hasCanonicalName) {
      await pool.query(
        `ALTER TABLE representantes CHANGE COLUMN \`${legacyName}\` \`${canonicalName}\` VARCHAR(75) NOT NULL`
      );
      representativeFieldNames.delete(legacyName);
      representativeFieldNames.add(canonicalName);
    } else if (hasLegacyName && hasCanonicalName) {
      await pool.query(`
        UPDATE representantes
           SET \`${canonicalName}\` = CASE
                 WHEN TRIM(COALESCE(\`${canonicalName}\`, '')) = '' THEN COALESCE(\`${legacyName}\`, '')
                 ELSE \`${canonicalName}\`
               END
      `);
      await pool.query(`ALTER TABLE representantes DROP COLUMN \`${legacyName}\``);
      representativeFieldNames.delete(legacyName);
    } else if (!hasCanonicalName) {
      await pool.query(
        `ALTER TABLE representantes ADD COLUMN \`${canonicalName}\` VARCHAR(75) NOT NULL DEFAULT ''`
      );
      representativeFieldNames.add(canonicalName);
    }
  }

  for (const legacyNameColumn of ['nombre_completo', 'nombres_apellidos']) {
    if (!representativeFieldNames.has(legacyNameColumn)) continue;

    const legacyValue = `TRIM(COALESCE(\`${legacyNameColumn}\`, ''))`;
    await pool.query(`
      UPDATE representantes
         SET nombres = CASE
               WHEN TRIM(COALESCE(nombres, '')) = '' THEN SUBSTRING_INDEX(${legacyValue}, ' ', 1)
               ELSE nombres
             END,
             apellidos = CASE
               WHEN TRIM(COALESCE(apellidos, '')) = '' AND LOCATE(' ', ${legacyValue}) > 0
                 THEN TRIM(SUBSTRING(${legacyValue}, LOCATE(' ', ${legacyValue}) + 1))
               ELSE apellidos
             END
       WHERE ${legacyValue} <> ''
    `);
    await pool.query(`ALTER TABLE representantes DROP COLUMN \`${legacyNameColumn}\``);
  }

  await pool.query(`
    ALTER TABLE representantes
      MODIFY COLUMN nombres VARCHAR(75) NOT NULL,
      MODIFY COLUMN apellidos VARCHAR(75) NOT NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rol (
      id INT PRIMARY KEY AUTO_INCREMENT,
      cargo VARCHAR(50) DEFAULT NULL
    )
  `);

  await migrateLegacyPageModuleColumn();

  const [moduleParentForeignKeys] = await pool.query(`
    SELECT CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'modulo'
      AND COLUMN_NAME = 'id_modulo_padre'
      AND REFERENCED_TABLE_NAME IS NOT NULL
  `);
  for (const foreignKey of moduleParentForeignKeys) {
    await pool.query(`ALTER TABLE modulo DROP FOREIGN KEY \`${foreignKey.CONSTRAINT_NAME}\``);
  }

  const [moduleParentIndexes] = await pool.query(
    "SHOW INDEX FROM modulo WHERE Column_name = 'id_modulo_padre'"
  );
  for (const indexName of new Set(moduleParentIndexes.map((index) => index.Key_name))) {
    if (indexName !== 'PRIMARY') {
      await pool.query(`ALTER TABLE modulo DROP INDEX \`${indexName}\``);
    }
  }

  const [moduleParentColumn] = await pool.query(
    "SHOW COLUMNS FROM modulo LIKE 'id_modulo_padre'"
  );
  if (moduleParentColumn.length > 0) {
    await pool.query('ALTER TABLE modulo DROP COLUMN id_modulo_padre');
  }

  await pool.query("UPDATE modulo SET nombre_modulo = 'Configuración' WHERE BINARY nombre_modulo = 'Configuracion'");
  await pool.query("UPDATE modulo SET nombre_modulo = 'Preinscripciones' WHERE BINARY nombre_modulo = 'Preinscripcion'");
  await pool.query("UPDATE modulo SET nombre_modulo = 'Módulos' WHERE BINARY nombre_modulo = 'Modulos'");
  const [[legacyAlumnosModule]] = await pool.query(
    "SELECT id FROM modulo WHERE nombre_modulo = 'Alumnos' LIMIT 1"
  );
  const [[registeredStudentsModule]] = await pool.query(
    "SELECT id FROM modulo WHERE nombre_modulo = 'Alumnos registrados' LIMIT 1"
  );
  if (legacyAlumnosModule && registeredStudentsModule) {
    await copyModuleAccess('Alumnos', 'Alumnos registrados', '/alumnos/registrados')
    await pool.query(`
      DELETE permission
        FROM r_mp_per permission
        JOIN r_m_ur module_access
          ON module_access.id = permission.id_modulo_usuario_rol
       WHERE module_access.id_modulo = ?
    `, [legacyAlumnosModule.id])
    await pool.query('DELETE FROM r_m_ur WHERE id_modulo = ?', [legacyAlumnosModule.id])
    await pool.query('DELETE FROM modulo WHERE id = ?', [legacyAlumnosModule.id])
  } else if (legacyAlumnosModule) {
    await pool.query(
      "UPDATE modulo SET nombre_modulo = 'Alumnos registrados' WHERE id = ?",
      [legacyAlumnosModule.id]
    );
  }
  await ensureNavigationCatalog();
  await migrateSidebarModuleCatalog();
  await reorderIdsByValue('modulo', 'nombre_modulo', [
    'Panel',
    'Nuevo ingreso',
    'Preinscripciones',
    'Alumnos registrados',
    'Representantes',
    'Solicitudes',
    'Grados y Secciones',
    'Usuarios',
    'Roles',
    'Módulos'
  ]);

  await pool.query(`
    DELETE rp
    FROM r_mp_per rp
    JOIN paginas p ON p.id = rp.id_paginas
    WHERE p.url IN (
      '/configuracion', '/preinscripciones', '/alumnos',
      '/personal', '/admin/preinscripcion', '/preinscripcion',
      '/inscripcion-formal/:id', '/admin-panel'
    )
  `);
  await pool.query(`
    DELETE FROM paginas
    WHERE url IN (
      '/configuracion', '/preinscripciones', '/alumnos',
      '/personal', '/admin/preinscripcion', '/preinscripcion',
      '/inscripcion-formal/:id', '/admin-panel'
    )
  `);

  await ensureNavigationCatalog();
  await reorderIdsByValue('paginas', 'url', [
    '/',
    '/alumnos/nuevo-ingreso',
    '/alumnos/preinscripciones',
    '/alumnos/registrados',
    '/representantes',
    '/solicitudes',
    '/grados',
    '/configuracion/usuarios',
    '/configuracion/roles',
    '/configuracion/modulos'
  ]);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS r_g_s (
      id INT NOT NULL AUTO_INCREMENT,
      id_grado INT DEFAULT NULL,
      id_seccion INT DEFAULT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_r_g_s (id_grado, id_seccion),
      KEY idx_r_g_s_grado (id_grado),
      KEY idx_r_g_s_seccion (id_seccion),
      CONSTRAINT fk_r_g_s_grado FOREIGN KEY (id_grado) REFERENCES grados (id),
      CONSTRAINT fk_r_g_s_seccion FOREIGN KEY (id_seccion) REFERENCES seccion (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);
  await migrateLegacyGradeSectionColumn();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS r_a_d (
      id INT NOT NULL AUTO_INCREMENT,
      id_alumno INT NOT NULL,
      id_documento INT NOT NULL,
      tipo_documento VARCHAR(80) NOT NULL DEFAULT 'documento',
      PRIMARY KEY (id),
      UNIQUE KEY uq_r_a_d (id_alumno, id_documento),
      KEY idx_r_a_d_documento (id_documento),
      CONSTRAINT fk_r_a_d_alumno FOREIGN KEY (id_alumno) REFERENCES alumno (id),
      CONSTRAINT fk_r_a_d_documento FOREIGN KEY (id_documento) REFERENCES documento (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `).catch(() => {});

  const [preinscripcionRows] = await pool.query("SHOW TABLES LIKE 'preinscripciones'");
  if (preinscripcionRows.length === 0) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS preinscripciones (
        id INT NOT NULL AUTO_INCREMENT,
        id_r_a_d INT NULL,
        id_r_g_s INT NULL,
        id_periodo INT NULL,
        fecha_preinscripcion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_preinscripciones_r_a_d (id_r_a_d),
        KEY idx_preinscripciones_r_g_s (id_r_g_s),
        KEY idx_preinscripciones_periodo (id_periodo),
        CONSTRAINT fk_preinscripciones_r_g_s FOREIGN KEY (id_r_g_s) REFERENCES r_g_s (id),
        CONSTRAINT fk_preinscripciones_periodo FOREIGN KEY (id_periodo) REFERENCES periodo (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `).catch(() => {});
  }

  await pool.query(`
    ALTER TABLE preinscripciones
      ADD COLUMN IF NOT EXISTS id_r_a_d INT NULL AFTER id
  `);
  await migrateLegacyAlumnoDocumentColumn();
  await migrateLegacyPreinscriptionUserColumn();

  const [preinscripcionAlumnoColumn] = await pool.query(
    "SHOW COLUMNS FROM preinscripciones LIKE 'id_alumno'"
  );
  if (preinscripcionAlumnoColumn.length > 0) {
    await pool.query(`
      UPDATE preinscripciones p
      JOIN (
        SELECT id_alumno, MIN(id) AS id_r_a_d
        FROM r_a_d
        GROUP BY id_alumno
      ) rad ON rad.id_alumno = p.id_alumno
         SET p.id_r_a_d = rad.id_r_a_d
       WHERE p.id_r_a_d IS NULL
    `);

    const [[unlinkedPreinscriptions]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM preinscripciones
      WHERE id_alumno IS NOT NULL AND id_r_a_d IS NULL
    `);
    if (Number(unlinkedPreinscriptions.total) > 0) {
      throw new Error('Hay preinscripciones sin una relación documental; no se eliminó id_alumno');
    }

    const [legacyForeignKeys] = await pool.query(`
      SELECT CONSTRAINT_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'preinscripciones'
        AND COLUMN_NAME = 'id_alumno'
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `);
    for (const foreignKey of legacyForeignKeys) {
      await pool.query(`ALTER TABLE preinscripciones DROP FOREIGN KEY \`${foreignKey.CONSTRAINT_NAME}\``);
    }

    const [legacyIndexes] = await pool.query(
      "SHOW INDEX FROM preinscripciones WHERE Column_name = 'id_alumno'"
    );
    for (const indexName of new Set(legacyIndexes.map((index) => index.Key_name))) {
      if (indexName !== 'PRIMARY') {
        await pool.query(`ALTER TABLE preinscripciones DROP INDEX \`${indexName}\``);
      }
    }
    await pool.query('ALTER TABLE preinscripciones DROP COLUMN id_alumno');
  }

  const [preinscripcionRelationIndex] = await pool.query(
    "SHOW INDEX FROM preinscripciones WHERE Column_name = 'id_r_a_d'"
  );
  if (preinscripcionRelationIndex.length === 0) {
    await pool.query('ALTER TABLE preinscripciones ADD KEY idx_preinscripciones_r_a_d (id_r_a_d)');
  }

  const foreignKeys = [
    ['alumno', 'id_representante', 'representantes', 'id', 'fk_alumno_representantes'],
    ['representantes', 'id_direccion', 'direccion', 'id', 'fk_representantes_direccion'],
    ['representantes', 'id_telefono', 'telefono', 'id', 'fk_representantes_telefono'],
    ['documento', 'id_status', 'status', 'id', 'fk_documento_status'],
    ['documento', 'id_movimiento', 'movimiento', 'id', 'fk_documento_movimiento'],
    ['r_g_s', 'id_grado', 'grados', 'id', 'fk_r_g_s_grado'],
    ['r_g_s', 'id_seccion', 'seccion', 'id', 'fk_r_g_s_seccion'],
    ['usuarios', 'id_direccion_usuario', 'direccion_usuario', 'id', 'fk_usuarios_direccion'],
    ['usuarios', 'id', 'user', 'id', 'fk_usuarios_user'],
    ['preinscripciones', 'id_r_a_d', 'r_a_d', 'id', 'fk_preinscripciones_r_a_d'],
    ['solicitudes_preinscripciones', 'id_user', 'user', 'id', 'fk_solicitudes_preinscripcion_user'],
    ['solicitudes_preinscripciones', 'id_alumno', 'alumno', 'id', 'fk_solicitudes_alumno'],
    ['solicitudes_preinscripciones', 'id_preinscripcion', 'preinscripciones', 'id', 'fk_solicitudes_preinscripcion'],
    ['r_u_r', 'id_usuarios', 'usuarios', 'id', 'fk_r_u_r_usuario'],
    ['r_u_r', 'id_rol', 'rol', 'id', 'fk_r_u_r_rol'],
    ['r_m_ur', 'id_r_u_r', 'r_u_r', 'id', 'fk_r_m_ur_r_u_r'],
    ['r_m_ur', 'id_modulo', 'modulo', 'id', 'fk_r_m_ur_modulo'],
    ['r_mp_per', 'id_permisos', 'permisos', 'id', 'fk_r_mp_per_permiso'],
    ['r_mp_per', 'id_modulo_usuario_rol', 'r_m_ur', 'id', 'fk_r_mp_per_modulo'],
    ['r_mp_per', 'id_paginas', 'paginas', 'id', 'fk_r_mp_per_pagina'],
  ];

  await migrateRoleModuleAccessForeignKey();
  for (const foreignKey of foreignKeys) {
    await ensureForeignKey(...foreignKey);
  }

  await pool.query(`
    INSERT INTO r_mp_per (id_permisos, id_modulo_usuario_rol, id_paginas)
    SELECT permission.id,
           module_access.id,
           page.id
      FROM r_m_ur module_access
      JOIN r_u_r user_role ON user_role.id = module_access.id_r_u_r
      JOIN rol ON rol.id = user_role.id_rol
      JOIN modulo module ON module.id = module_access.id_modulo
      JOIN paginas page ON page.nombre_pagina = module.nombre_modulo
      CROSS JOIN permisos permission
      LEFT JOIN r_mp_per existing
        ON existing.id_permisos = permission.id
       AND existing.id_modulo_usuario_rol = module_access.id
     WHERE LOWER(TRIM(rol.cargo)) IN ('admin', 'administrador')
       AND existing.id IS NULL
  `);

  await pool.query(`
    DELETE duplicate
      FROM r_mp_per duplicate
      JOIN r_mp_per retained
        ON retained.id_permisos = duplicate.id_permisos
       AND retained.id_modulo_usuario_rol = duplicate.id_modulo_usuario_rol
       AND retained.id_paginas = duplicate.id_paginas
       AND retained.id < duplicate.id
      JOIN paginas page ON page.id = duplicate.id_paginas
     WHERE page.url IN (
       '/alumnos/nuevo-ingreso',
       '/alumnos/preinscripciones',
       '/alumnos/registrados'
     )
  `);

  for (const { url, name: pageName, module: moduleName } of NAVIGATION_PAGES) {
    await pool.query(
      `DELETE permission
         FROM r_mp_per permission
         JOIN r_m_ur module_access
           ON module_access.id = permission.id_modulo_usuario_rol
         JOIN modulo module ON module.id = module_access.id_modulo
         JOIN paginas page ON page.id = permission.id_paginas
        WHERE page.url = ?
          AND module.nombre_modulo <> ?`,
      [url, moduleName]
    );

    if (pageName === moduleName) {
      await pool.query(
        `UPDATE r_mp_per permission
         JOIN r_m_ur module_access
           ON module_access.id = permission.id_modulo_usuario_rol
         JOIN modulo module ON module.id = module_access.id_modulo
            SET permission.id_paginas = (
              SELECT page.id FROM paginas page WHERE page.url = ? LIMIT 1
            )
          WHERE module.nombre_modulo = ?
            AND permission.id_paginas IS NULL`,
        [url, moduleName]
      );
    }

    await pool.query(
      `INSERT INTO r_mp_per (id_permisos, id_modulo_usuario_rol, id_paginas)
       SELECT DISTINCT assigned.id_permisos,
              module_access.id,
              page.id
         FROM r_m_ur module_access
         JOIN modulo module ON module.id = module_access.id_modulo
         JOIN r_mp_per assigned ON assigned.id_modulo_usuario_rol = module_access.id
         JOIN paginas page ON page.url = ?
         LEFT JOIN r_mp_per existing
           ON existing.id_permisos = assigned.id_permisos
          AND existing.id_modulo_usuario_rol = module_access.id
          AND existing.id_paginas = page.id
        WHERE module.nombre_modulo = ?
          AND existing.id IS NULL`,
      [url, moduleName]
    );
  }

  await seedDocumentCatalogs();
  await migratePendingSolicitudesToFileStorage();
}

pool.ready = initializeSchema();
pool.ready.catch((err) => {
  console.error('No se pudo inicializar el esquema de base de datos:', err.message);
});

module.exports = pool;
