// backend/routes/authRoutes.js

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Helper function to generate JWT
const generateToken = (user) => {
  return jwt.sign(
    {
      user_id: user.user_id,
      username: user.username,
      email: user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' } // Token expires in 1 hour
  );
};

// Registration Route
router.post('/register', async (req, res) => {
  const { username, email, password, user_avatar } = req.body;

  // Basic validation
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required.' });
  }

  try {
    // Check if user already exists
    const { data: existingUsers, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (existingUsers) {
      return res.status(400).json({ error: 'User with this email already exists.' });
    }

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116: Row not found
      throw fetchError;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user into the database
    const { data: newUser, error: insertError } = await supabase
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

    if (insertError) throw insertError;

    // Generate JWT token
    const token = generateToken(newUser);

    res.status(201).json({
      message: 'User registered successfully.',
      token,
      user: {
        user_id: newUser.user_id,
        username: newUser.username,
        email: newUser.email,
        user_avatar: newUser.user_avatar,
      },
    });
  } catch (error) {
    console.error('Error during registration:', error);
    res.status(500).json({ error: 'An error occurred during registration.', details: error.message });
  }
});

// Login Route
router.post('/login', async (req, res) => {
  const { email, password, rememberMe } = req.body;

  // Basic validation
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    // Fetch user by email
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (fetchError) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: rememberMe ? '7d' : '1h' } // Longer expiry if "Remember me" is checked
    );

    res.status(200).json({
      message: 'Logged in successfully.',
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        user_avatar: user.user_avatar,
      },
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'An error occurred during login.', details: error.message });
  }
});

module.exports = router;
