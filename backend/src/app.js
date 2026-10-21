const express = require('express');
const cors = require('cors');
const multer = require('multer');

const alumnoRoutes = require('./routes/alumnoRoutes');
const representanteRoutes = require('./routes/representanteRoutes');
const preinscripcionRoutes = require('./routes/preinscripcionRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const solicitudRoutes = require('./routes/solicitudRoutes');
const roleRoutes = require('./routes/roleRoutes');
const moduloRoutes = require('./routes/moduloRoutes');
const gradoRoutes = require('./routes/gradoRoutes');
const accesoRoutes = require('./routes/accesoRoutes');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/alumnos', alumnoRoutes);
app.use('/api/representantes', representanteRoutes);
app.use('/api/preinscripciones', preinscripcionRoutes);
app.use('/api/solicitudes', solicitudRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/modulos', moduloRoutes);
app.use('/api/grados', gradoRoutes);
app.use('/api/acceso', accesoRoutes);

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Cada imagen debe pesar como máximo 5 MB. Reduce el tamaño de las fotos e inténtalo de nuevo.' });
    }
    return res.status(400).json({ error: 'No se pudieron recibir las imágenes adjuntas. Verifica los archivos e inténtalo de nuevo.' });
  }

  console.error(error);
  return res.status(500).json({ error: 'Ocurrió un error interno al procesar la solicitud.' });
});

module.exports = app;
