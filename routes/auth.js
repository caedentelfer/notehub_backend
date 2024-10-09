// /backend/routes/auth.js

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Helper function to check if a user exists by a specific field
const checkUserExists = async (field, value) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq(field, value)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116: No rows found
    throw error;
  }

  return data || null;
};

// Signup Endpoint
router.post('/signup', async (req, res) => {
  const { username, email, password, user_avatar } = req.body;

  // Validate input
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Check if username exists
    const existingUsername = await checkUserExists('username', username);
    if (existingUsername) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Check if email exists
    const existingEmail = await checkUserExists('email', email);
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the new user
    const { data, error } = await supabase
      .from('users')
      .insert([
        {
          username,
          email,
          password: hashedPassword,
          user_avatar: user_avatar || null,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    // Return the new user (excluding password)
    const { password: pw, ...userWithoutPassword } = data;

    res.status(201).json(userWithoutPassword);
  } catch (error) {
    console.error('Error during signup:', error);
    res.status(500).json({ error: 'An error occurred during signup', details: error.message });
  }
});

module.exports = router;
