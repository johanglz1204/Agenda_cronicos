/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('medications').del();
  await knex('medications').insert([
    { name: 'Paracetamol', presentation: 'Tabletas 500mg' },
    { name: 'Amoxicilina', presentation: 'Cápsulas 500mg' },
    { name: 'Ibuprofeno', presentation: 'Tabletas 400mg' },
    { name: 'Loratadina', presentation: 'Jarabe 100ml' },
    { name: 'Metformina', presentation: 'Tabletas 850mg' }
  ]);
};
