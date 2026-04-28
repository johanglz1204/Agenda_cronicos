const express = require('express');
const path = require('path');
require('dotenv').config();

const routes = require('./routes');

const app = express();

app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api', routes);

// Health check
app.get('/', (req, res) => {
  res.send('API de Farmacia Agenda funcionando correctamente.');
});

module.exports = app;
