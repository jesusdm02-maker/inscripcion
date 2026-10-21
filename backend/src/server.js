const app = require('./app');
const db = require('./db');
const dotenv = require('dotenv');
dotenv.config();

const DEFAULT_PORT = 4000;

async function startServer(port) {
  await db.ready;
  const server = app.listen(port, () => console.log(`Server running on port ${port}`));
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`El puerto ${port} está ocupado. Cierra el proceso anterior o cambia la configuración.`);
      process.exit(1);
    } else {
      throw error;
    }
  });
}

startServer(DEFAULT_PORT).catch((error) => {
  console.error('No se pudo iniciar el servidor porque falló la inicialización de la base de datos:', error);
  process.exitCode = 1;
});
