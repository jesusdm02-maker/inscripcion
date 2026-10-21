const http = require('http');

const data = JSON.stringify({ correo: 'admin@escuela.com', password: '1234' });

const options = {
  hostname: '127.0.0.1',
  port: 4007,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    console.log('BODY', body);
  });
});

req.on('error', (e) => {
  console.error('ERROR', e.message);
});

req.write(data);
req.end();
