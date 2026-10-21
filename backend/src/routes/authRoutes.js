const express = require('express')
const router = express.Router()
const authController = require('../controllers/authController')
const { authenticatedOnly, requirePermission, getAuthenticatedUserId } = require('../middleware/authorize')

router.post('/login', authController.login)
router.get('/permissions', authenticatedOnly, authController.getCurrentUserPermissions)
router.post('/logout', async (req, res, next) => {
  try {
    const userId = await getAuthenticatedUserId(req)
    if (!userId) return res.status(401).json({ error: 'La sesión no es válida o ha expirado.' })
    return authController.logout(req, res)
  } catch (error) {
    return next(error)
  }
})
router.get('/users', requirePermission('Leer', 'Usuarios', '/configuracion/usuarios'), authController.listUsers)
router.get('/users/representative-students', requirePermission('Crear', 'Usuarios', '/configuracion/usuarios'), authController.searchRepresentativeStudents)
router.post('/users', requirePermission('Crear', 'Usuarios', '/configuracion/usuarios'), authController.createUserAccount)
router.put('/users/:id', requirePermission('Actualizar', 'Usuarios', '/configuracion/usuarios'), authController.updateUserAccount)
router.delete('/users/:id/role', requirePermission('Actualizar', 'Usuarios', '/configuracion/usuarios'), authController.removeUserRole)
router.delete('/users/:id', requirePermission('Eliminar', 'Usuarios', '/configuracion/usuarios'), authController.deleteUserAccount)

module.exports = router
