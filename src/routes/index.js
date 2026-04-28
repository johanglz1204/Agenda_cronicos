const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');

// Rutas de Pacientes y Tratamientos
router.post('/patients', patientController.registerPatientAndTreatment);
router.get('/agenda/refills', patientController.getRefillAgenda);
router.get('/medications', patientController.getMedications);

module.exports = router;
