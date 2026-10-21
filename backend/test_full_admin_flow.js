const http = require('http');
const db = require('./src/db');

function requestJson(url, method = 'GET', payload = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = payload ? Buffer.from(JSON.stringify(payload)) : null;
    const req = http.request(url, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': body.length } : {}),
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function ensureCatalogs() {
  const [periodRows] = await db.query('SELECT id_periodo FROM periodo WHERE fecha_inicio = ? LIMIT 1', ['Nuevo Ingreso']);
  if (periodRows.length === 0) {
    await db.query('INSERT INTO periodo (fecha_inicio) VALUES (?)', ['Nuevo Ingreso']);
  }

  for (const grado of [1, 2, 3, 4, 5, 6]) {
    for (const seccion of [1, 2]) {
      const [rows] = await db.query('SELECT id_r_g_s FROM r_g_s WHERE id_grado = ? AND id_seccion = ? LIMIT 1', [grado, seccion]);
      if (rows.length === 0) {
        await db.query('INSERT INTO r_g_s (id_grado, id_seccion) VALUES (?, ?)', [grado, seccion]);
      }
    }
  }
}

async function createAdminUser(email, password) {
  const [[existing]] = await db.query('SELECT id_user FROM `user` WHERE correo = ? LIMIT 1', [email]);
  if (existing) {
    return existing.id_user;
  }

  const [[{ maxId }]] = await db.query('SELECT COALESCE(MAX(id_user), 0) AS maxId FROM `user`');
  const id = Number(maxId) + 1;

  await db.query(
    'INSERT INTO `user` (id_user, nombre, apellido, correo, password) VALUES (?, ?, ?, ?, ?)',
    [id, 'Admin', 'Prueba', email, password]
  );

  await db.query(
    'INSERT INTO usuarios (id_usuarios, nombre, id_direccion_usuario) VALUES (?, ?, NULL)',
    [id, 'Admin Prueba']
  );

  const [[{ maxRelation }]] = await db.query('SELECT COALESCE(MAX(id_r_u_r), 0) AS maxRelation FROM r_u_r');
  await db.query('INSERT INTO r_u_r (id_r_u_r, id_usuarios, id_rol) VALUES (?, ?, 1)', [Number(maxRelation) + 1, id]);

  return id;
}

async function getUserRecord(userId) {
  const [rows] = await db.query('SELECT * FROM `user` WHERE id_user = ?', [userId]);
  return rows[0];
}

async function cleanupUser(userId) {
  const [preRows] = await db.query(
    'SELECT p.id AS id_preinscripcion, rad.id_alumno FROM preinscripciones p LEFT JOIN r_a_d rad ON rad.id = p.id_r_a_d WHERE p.id_user = ?',
    [userId]
  );

  // First remove preinscripciones to avoid FK constraint when deleting alumno/representante
  if (preRows.length > 0) {
    const preIds = preRows.map(r => r.id_preinscripcion).filter(Boolean);
    if (preIds.length > 0) {
      await db.query(`DELETE FROM preinscripciones WHERE id_preinscripcion IN (${preIds.map(()=>'?').join(',')})`, preIds);
    }
  }

  for (const row of preRows) {
    if (row.id_alumno) {
      const [[alumno]] = await db.query('SELECT id_representante FROM alumno WHERE id_alumno = ? LIMIT 1', [row.id_alumno]);
      if (alumno?.id_representante) {
        const [[rep]] = await db.query('SELECT id_direccion, id_telefono FROM representantes WHERE id_representante = ? LIMIT 1', [alumno.id_representante]);
        await db.query('DELETE FROM alumno WHERE id_alumno = ?', [row.id_alumno]);
        await db.query('DELETE FROM representantes WHERE id_representante = ?', [alumno.id_representante]);
        if (rep?.id_direccion) {
          await db.query('DELETE FROM direccion WHERE id_direccion = ?', [rep.id_direccion]);
        }
        if (rep?.id_telefono) {
          await db.query('DELETE FROM telefono WHERE id_telefono = ?', [rep.id_telefono]);
        }
      } else {
        await db.query('DELETE FROM alumno WHERE id_alumno = ?', [row.id_alumno]);
      }
    }
  }

  await db.query('DELETE FROM preinscripciones WHERE id_user = ?', [userId]);
  await db.query('DELETE FROM r_u_r WHERE id_usuarios = ?', [userId]);
  await db.query('DELETE FROM usuarios WHERE id_usuarios = ?', [userId]);
  await db.query('DELETE FROM `user` WHERE id_user = ?', [userId]);
}

(async () => {
  try {
    await ensureCatalogs();

    const uniqueId = Date.now();
    const email = `finalvalidate${uniqueId}@escuela.com`;
    const password = 'Admin123!';
    const userId = await createAdminUser(email, password);
    console.log('CREATED_USER_ID', userId);

    const loginResponse = await requestJson('http://localhost:4001/api/auth/login', 'POST', { correo: email, password });
    console.log('LOGIN_STATUS', loginResponse.status);
    console.log('LOGIN_BODY', loginResponse.body);

    const catalogResponse = await requestJson('http://localhost:4001/api/preinscripciones/catalogos', 'GET', null, {
      'x-user-id': String(userId),
      'x-user-role': 'admin'
    });
    console.log('CATALOG_STATUS', catalogResponse.status);
    console.log('CATALOG_BODY', catalogResponse.body.substring(0, 500));

    const payload = {
      nombres: 'Ana',
      apellidos: 'Prueba',
      fecha_nacimiento: '2015-05-12',
      alergias_condiciones: 'Ninguna',
      documento: `V-${uniqueId}-ALUMNO`,
      representante_cedula: `V-${uniqueId}-REP`,
      representante_nombre: 'Roberto Prueba',
      representante_apellido: 'Prueba',
      representante_parentesco: 'Padre',
      direccion_municipio: 'Caracas',
      direccion_calle: 'Av. Principal',
      direccion_avenida: 'Calle 1',
      direccion_num_casa: '12',
      telefono: `0414${String(uniqueId).slice(-8)}`,
      correo: `ana.${uniqueId}@example.com`,
      contacto: `0414${String(uniqueId).slice(-8)}`,
      grado_nombre: 'Primer Grado',
      grado_id: 1,
      grado_cupos_disponibles: 10,
      fecha_inicio: 'Nuevo Ingreso',
      periodo_id: null,
      seccion_nombre: 'A',
      seccion_id: 1,
      userId
    };

    const formResponse = await requestJson('http://localhost:4001/api/solicitudes/admin', 'POST', payload, {
      'x-user-id': String(userId),
      'x-user-role': 'admin'
    });

    console.log('FORM_STATUS', formResponse.status);
    console.log('FORM_BODY', formResponse.body);

    const [rows] = await db.query('SELECT * FROM preinscripciones WHERE id_user = ? ORDER BY id_preinscripcion DESC LIMIT 5', [userId]);
    console.log('DB_PREINSCRIPCIONES', JSON.stringify(rows));

    await cleanupUser(userId);
    console.log('CLEANED_USER_ID', userId);
    process.exit(0);
  } catch (error) {
    console.error('ERROR', error && error.stack ? error.stack : error);
    process.exit(1);
  }
})();
