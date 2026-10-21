const express = require('express');
const multer = require('multer');
const router = express.Router();
const solicitudController = require('../controllers/solicitudController');
const {
  requirePermission,
  authenticatedOnly,
  requireIntakeCreationPermissions,
  requireExistingStudentPreinscriptionPermissions
} = require('../middleware/authorize');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

router.post('/', solicitudController.create);
router.post('/admin',
  requireIntakeCreationPermissions(),
  upload.fields([
  { name: 'foto_cedula', maxCount: 1 },
  { name: 'foto_alumno', maxCount: 1 }
  ]),
  solicitudController.createAdminInscripcion
);
router.post('/preinscripcion',
  requireExistingStudentPreinscriptionPermissions(),
  solicitudController.createExistingStudentPreinscripcion
);
router.get('/preinscripcion/alumnos',
  authenticatedOnly,
  solicitudController.getRepresentativePreinscriptionStudents
);
router.get('/documentos/catalogos', requirePermission('Leer', 'Solicitudes', '/solicitudes'), solicitudController.getDocumentCatalogs);
router.get('/documentos', requirePermission('Leer', 'Solicitudes', '/solicitudes'), solicitudController.getDocumentos);
router.get('/', requirePermission('Leer', 'Solicitudes', '/solicitudes'), solicitudController.list);
router.get('/:id', requirePermission('Leer', 'Solicitudes', '/solicitudes'), solicitudController.getById);
router.put('/:id/approve',
  requirePermission('Actualizar', 'Solicitudes', '/solicitudes'),
  requirePermission('Crear', 'Preinscripciones', '/preinscripciones'),
  requirePermission('Crear', 'Alumnos', '/alumnos'),
  requirePermission('Crear', 'Representantes', '/representantes'),
  solicitudController.approve
);
router.put('/:id/inscripcion',
  requirePermission('Actualizar', 'Solicitudes', '/solicitudes'),
  requirePermission('Crear', 'Preinscripciones', '/preinscripciones'),
  requirePermission('Crear', 'Alumnos', '/alumnos'),
  requirePermission('Crear', 'Representantes', '/representantes'),
  solicitudController.submitInscripcion
);
router.put('/:id', requirePermission('Actualizar', 'Solicitudes', '/solicitudes'), solicitudController.update);
router.delete('/bulk', requirePermission('Eliminar', 'Solicitudes', '/solicitudes'), solicitudController.removeMany);

module.exports = router;
