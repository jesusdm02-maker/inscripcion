const express = require('express')
const router = express.Router()
const { requirePermission } = require('../middleware/authorize')
const moduloController = require('../controllers/moduloController')

router.get('/', requirePermission('Leer', 'Modulos', '/configuracion/modulos'), moduloController.listModulos)

module.exports = router
