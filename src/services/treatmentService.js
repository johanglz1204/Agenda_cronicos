const { DateTime } = require('luxon');

class TreatmentService {
  /**
   * Calcula las fechas de fin y de contacto basadas en el suministro y la dosis.
   * @param {string} startDate - Fecha de inicio (YYYY-MM-DD)
   * @param {number} quantity - Cantidad total surtida
   * @param {number} dailyDosage - Dosis diaria
   * @param {number} alertMargin - Días antes del fin para contactar (default 3)
   */
  calculateTreatmentDates(startDate, quantity, dailyDosage, alertMargin = 3) {
    const start = DateTime.fromISO(startDate);
    
    // Calcular cuántos días durará el medicamento
    const durationDays = Math.floor(quantity / dailyDosage);
    
    // Fecha en la que se termina el medicamento
    const estimatedEndDate = start.plus({ days: durationDays });
    
    // Fecha ideal de contacto
    const nextContactDate = estimatedEndDate.minus({ days: alertMargin });
    
    return {
      estimatedEndDate: estimatedEndDate.toISODate(),
      nextContactDate: nextContactDate.toISODate()
    };
  }
}

module.exports = new TreatmentService();
