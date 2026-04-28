const db = require('../config/db');
const treatmentService = require('../services/treatmentService');

exports.registerPatientAndTreatment = async (req, res) => {
  const { 
    full_name, phone, email, 
    medication_id, quantity_supplied, daily_dosage, start_date 
  } = req.body;

  const trx = await db.transaction();

  try {
    // 1. Registrar o encontrar paciente
    const [patientId] = await trx('patients').insert({
      full_name, phone, email
    });

    // 2. Calcular fechas
    const alertMargin = process.env.MARGEN_ALERTA || 3;
    const { estimatedEndDate, nextContactDate } = treatmentService.calculateTreatmentDates(
      start_date, 
      quantity_supplied, 
      daily_dosage, 
      alertMargin
    );

    // 3. Registrar tratamiento
    await trx('treatments').insert({
      patient_id: patientId,
      medication_id,
      quantity_supplied,
      daily_dosage,
      start_date,
      estimated_end_date: estimatedEndDate,
      next_contact_date: nextContactDate
    });

    await trx.commit();
    res.status(201).json({ 
      message: 'Paciente y tratamiento registrados con éxito',
      next_contact_date: nextContactDate 
    });
  } catch (error) {
    await trx.rollback();
    console.error(error);
    res.status(500).json({ error: 'Error al registrar el paciente' });
  }
};

exports.getRefillAgenda = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Obtenemos pacientes que deben ser contactados hoy o antes que no han sido atendidos
    const agenda = await db('treatments')
      .join('patients', 'treatments.patient_id', 'patients.id')
      .join('medications', 'treatments.medication_id', 'medications.id')
      .select(
        'patients.full_name',
        'patients.phone',
        'medications.name as medication',
        'treatments.next_contact_date',
        'treatments.estimated_end_date'
      )
      .where('treatments.active', true)
      .andWhere('treatments.next_contact_date', '<=', today)
      .orderBy('treatments.next_contact_date', 'asc');

    res.json(agenda);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener la agenda de resurtidos' });
  }
};
