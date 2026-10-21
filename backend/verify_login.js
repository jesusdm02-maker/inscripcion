const http = require('http');
const db = require('./src/db');

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(payload));
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode, body });
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  try {
    const [rows] = await db.query(
      "SELECT id_user, nombre, apellido, correo FROM `user` WHERE correo IN ('jesus@escuela.com', 'admin@escuela.com') ORDER BY id_user"
    );
    console.log('USER_ROWS', JSON.stringify(rows));

    const jesus = await postJson('http://localhost:4004/api/auth/login', {
      correo: 'jesus@escuela.com',
      password: 'jesus123'
    });
    console.log('JESUS_STATUS', jesus.status);
    console.log('JESUS_BODY', jesus.body);

    const admin = await postJson('http://localhost:4004/api/auth/login', {
      correo: 'admin@escuela.com',
      password: '1234'
    });
    console.log('ADMIN_STATUS', admin.status);
    console.log('ADMIN_BODY', admin.body);

    const dashboard = await new Promise((resolve, reject) => {
      const req = http.request('http://localhost:4004/api/dashboard/summary', {
        method: 'GET',
        headers: {
          'x-user-id': '1',
          'x-user-role': 'admin'
        }
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
      req.end();
    });

    console.log('DASHBOARD_STATUS', dashboard.status);
    console.log('DASHBOARD_BODY', dashboard.body);

    process.exit(0);
  } catch (error) {
    console.error('ERROR', error && error.stack ? error.stack : error);
    process.exit(1);
  }
})();
