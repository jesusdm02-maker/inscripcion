const express = require('express');
const router = express.Router();
const preinscripcionController = require('../controllers/preinscripcionController');
const { requirePermission, requireAnyPermission } = require('../middleware/authorize');

router.get('/', requirePermission('Leer', 'Preinscripciones', '/preinscripciones'), preinscripcionController.list);
router.get('/catalogos', requireAnyPermission([
  ['Leer', 'Preinscripciones'],
  ['Crear', 'Preinscripciones'],
  ['Actualizar', 'Preinscripciones']
]), preinscripcionController.catalogos);
router.put('/:id', requirePermission('Actualizar', 'Preinscripciones', '/preinscripciones'), preinscripcionController.update);
router.delete('/bulk', requirePermission('Eliminar', 'Preinscripciones', '/preinscripciones'), preinscripcionController.removeMany);
router.delete('/:id', requirePermission('Eliminar', 'Preinscripciones', '/preinscripciones'), preinscripcionController.remove);

module.exports = router;
