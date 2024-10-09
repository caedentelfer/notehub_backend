const cors = require('cors');
const express = require('express');
const noteRoutes = require('./routes/noteRoutes');
const authRoutes = require('./routes/auth');



const app = express();

app.use(cors());  // Enable CORS for all requests
app.use(express.json());  
app.use('/api', noteRoutes);  // Use the routes for notes
app.use('/api/auth', authRoutes); // use the routes for authentication
module.exports = app;