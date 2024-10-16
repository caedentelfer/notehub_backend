const cors = require('cors');
const express = require('express');
const noteRoutes = require('./routes/noteRoutes');

const app = express(); 

app.use(cors());  /* Enable CORS for all requests */
app.use(express.json());   /* Parse JSON bodies in the requests */
app.use('/api', noteRoutes);  /* Use the routes for notes */

module.exports = app;