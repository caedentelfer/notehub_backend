const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken'); // Add this line

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

/**
 * @route   POST /api/users/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', async (req, res) => {
    const { username, email, password, user_avatar } = req.body;

    // Basic validation
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Username, email, and password are required.' });
    }

    try {
        // Check if username or email already exists
        const { data: existingUsers, error: fetchError } = await supabase
            .from('users')
            .select('*')
            .or(`username.eq.${username},email.eq.${email}`);

        if (fetchError) throw fetchError;

        if (existingUsers.length > 0) {
            const existingUser = existingUsers[0];
            if (existingUser.username === username) {
                return res.status(400).json({ error: 'Username already exists.' });
            }
            if (existingUser.email === email) {
                return res.status(400).json({ error: 'Email already exists.' });
            }
        }

        // Hash the password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Insert new user into the database
        const { data, error } = await supabase
            .from('users')
            .insert([
                {
                    username,
                    email,
                    password: hashedPassword,
                    user_avatar: user_avatar || null
                }
            ])
            .select()
            .single();

        if (error) throw error;

        // Generate JWT token
        const token = jwt.sign(
            { user_id: data.user_id, username: data.username, email: data.email },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(201).json({ message: 'User registered successfully.', token, user: { user_id: data.user_id, username: data.username, email: data.email, user_avatar: data.user_avatar } });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ error: 'An error occurred while registering the user.', details: error.message });
    }
});

/**
 * @route   POST /api/users/login
 * @desc    Authenticate user and log them in
 * @access  Public
 */
router.post('/login', async (req, res) => {
    const { username, password } = req.body; // Assuming login via username

    // Basic validation
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    try {
        // Fetch user by username
        const { data: user, error: fetchError } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (fetchError) {
            if (fetchError.code === 'PGRST116') { // Not found
                return res.status(400).json({ error: 'Invalid username or password.' });
            }
            throw fetchError;
        }

        // Compare password
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(400).json({ error: 'Invalid username or password.' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { user_id: user.user_id, username: user.username, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(200).json({ message: 'Login successful.', token, user: { user_id: user.user_id, username: user.username, email: user.email, user_avatar: user.user_avatar } });
    } catch (error) {
        console.error('Error logging in user:', error);
        res.status(500).json({ error: 'An error occurred while logging in the user.', details: error.message });
    }
});

module.exports = router;
