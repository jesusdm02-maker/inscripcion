const express = require('express');
const router = express.Router();
const alumnoController = require('../controllers/alumnoController');
const { requirePermission } = require('../middleware/authorize');

router.get('/buscar-preinscripcion',
  requirePermission('Leer', 'Alumnos', '/alumnos'),
  alumnoController.searchForPreinscripcion
);
router.get('/', requirePermission('Leer', 'Alumnos', '/alumnos'), alumnoController.list);
router.put('/:id', requirePermission('Actualizar', 'Alumnos', '/alumnos'), alumnoController.update);
router.delete('/bulk', requirePermission('Eliminar', 'Alumnos', '/alumnos'), alumnoController.removeMany);

module.exports = router;
