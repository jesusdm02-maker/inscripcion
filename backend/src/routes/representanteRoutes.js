const express = require('express');
const router = express.Router();
const representanteController = require('../controllers/representanteController');
const { requirePermission } = require('../middleware/authorize');

router.get('/', requirePermission('Leer', 'Representantes', '/representantes'), representanteController.list);
router.put('/:id', requirePermission('Actualizar', 'Representantes', '/representantes'), representanteController.update);
router.delete('/bulk', requirePermission('Eliminar', 'Representantes', '/representantes'), representanteController.removeMany);

module.exports = router;
