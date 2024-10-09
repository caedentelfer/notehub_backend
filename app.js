const cors = require('cors');
const express = require('express');
const noteRoutes = require('./routes/noteRoutes');

const app = express();

app.use(cors());  // Enable CORS for all requests
app.use(express.json());  
app.use('/api', noteRoutes);  // Use the routes for notes

module.exports = app;