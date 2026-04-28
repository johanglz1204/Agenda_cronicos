/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    .createTable('patients', (table) => {
      table.increments('id').primary();
      table.string('full_name').notNullable();
      table.string('phone').nullable();
      table.string('email').nullable();
      table.timestamps(true, true);
    })
    .createTable('medications', (table) => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.string('presentation').nullable(); // Ej: Tabletas 500mg
      table.timestamps(true, true);
    })
    .createTable('treatments', (table) => {
      table.increments('id').primary();
      table.integer('patient_id').unsigned().references('id').inTable('patients').onDelete('CASCADE');
      table.integer('medication_id').unsigned().references('id').inTable('medications');
      table.float('quantity_supplied').notNullable(); // Cantidad total entregada
      table.float('daily_dosage').notNullable(); // Dosis por día
      table.date('start_date').notNullable();
      table.date('estimated_end_date').notNullable();
      table.date('next_contact_date').notNullable();
      table.boolean('active').defaultTo(true);
      table.timestamps(true, true);
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('treatments')
    .dropTableIfExists('medications')
    .dropTableIfExists('patients');
};
