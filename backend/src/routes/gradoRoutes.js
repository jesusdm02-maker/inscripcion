const express = require('express')
const router = express.Router()
const { requirePermission } = require('../middleware/authorize')
const gradoController = require('../controllers/gradoController')

router.get('/', requirePermission('Leer', 'Grados y Secciones', '/grados'), gradoController.listGrados)
router.get('/secciones', requirePermission('Leer', 'Grados y Secciones', '/grados'), gradoController.listSecciones)
router.post('/', requirePermission('Crear', 'Grados y Secciones', '/grados'), gradoController.createGrado)
router.post('/secciones', requirePermission('Crear', 'Grados y Secciones', '/grados'), gradoController.createSeccion)
router.delete('/bulk', requirePermission('Eliminar', 'Grados y Secciones', '/grados'), gradoController.deleteGrados)
router.delete('/secciones/bulk', requirePermission('Eliminar', 'Grados y Secciones', '/grados'), gradoController.deleteSecciones)
router.put('/:id', requirePermission('Actualizar', 'Grados y Secciones', '/grados'), gradoController.updateGrado)
router.delete('/:id', requirePermission('Eliminar', 'Grados y Secciones', '/grados'), gradoController.deleteGrado)
router.put('/secciones/:id', requirePermission('Actualizar', 'Grados y Secciones', '/grados'), gradoController.updateSeccion)
router.delete('/secciones/:id', requirePermission('Eliminar', 'Grados y Secciones', '/grados'), gradoController.deleteSeccion)

module.exports = router
