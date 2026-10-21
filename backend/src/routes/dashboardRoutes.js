const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { requirePermission } = require('../middleware/authorize');

router.get('/summary', requirePermission('Leer', 'Panel', '/'), dashboardController.summary);

module.exports = router;
