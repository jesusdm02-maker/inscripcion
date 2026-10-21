const express = require('express')
const router = express.Router()
const { requirePermission, requireAnyPermission } = require('../middleware/authorize')
const accesoController = require('../controllers/accesoController')

router.get('/', requireAnyPermission([
  ['Leer', 'Modulos'],
  ['Actualizar', 'Modulos']
]), accesoController.listRoleModuleAccess)
router.post('/', requirePermission('Actualizar', 'Modulos', '/configuracion/modulos'), accesoController.saveRoleModuleAccess)

module.exports = router
