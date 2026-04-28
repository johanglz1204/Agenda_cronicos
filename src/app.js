const express = require('express');
const cors = require('cors');
require('dotenv').config();

const routes = require('./routes');

const app = express();

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', routes);

// Health check
app.get('/', (req, res) => {
  res.send('API de Farmacia Agenda funcionando correctamente.');
});

module.exports = app;
