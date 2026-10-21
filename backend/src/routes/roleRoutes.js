const express = require('express')
const router = express.Router()
const { requirePermission } = require('../middleware/authorize')
const roleController = require('../controllers/roleController')

router.get('/', requirePermission('Leer', 'Roles', '/configuracion/roles'), roleController.listRoles)
router.post('/', requirePermission('Crear', 'Roles', '/configuracion/roles'), roleController.createRole)
router.put('/:id', requirePermission('Actualizar', 'Roles', '/configuracion/roles'), roleController.updateRole)
router.delete('/:id', requirePermission('Eliminar', 'Roles', '/configuracion/roles'), roleController.deleteRole)

module.exports = router
