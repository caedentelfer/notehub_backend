// backend/routes/userRoutes.js

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import validator from 'validator';
import authenticateToken from '../middleware/authMiddleware.js'; // Ensure the path and extension are correct

dotenv.config();

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/**
 * Register a new user
 * @route POST /api/users/register
 * @access Public
 */
router.post("/register", async (req, res) => {
  try {
    let { username, email, password, user_avatar } = req.body;

    username = typeof username === 'string' ? validator.trim(username) : '';
    email = typeof email === 'string' ? validator.normalizeEmail(email) : '';
    password = typeof password === 'string' ? validator.trim(password) : '';
    user_avatar = typeof user_avatar === 'string' ? validator.trim(user_avatar) : null;

    if (!username || !email || !password) {
      return res.status(400).json({ error: "Username, email, and password are required." });
    }

    if (!validator.isAlphanumeric(username)) {
      return res.status(400).json({ error: "Username must be alphanumeric." });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: "Invalid email format." });
    }

    const { data: existingUsers, error: fetchError } = await supabase
      .from("users")
      .select("*")
      .or(`username.eq.${username},email.eq.${email}`);

    if (fetchError) throw fetchError;

    if (existingUsers.length > 0) {
      const existingUser = existingUsers[0];
      if (existingUser.username === username) {
        return res.status(400).json({ error: "Username already exists." });
      }
      if (existingUser.email === email) {
        return res.status(400).json({ error: "Email already exists." });
      }
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const { data, error } = await supabase
      .from("users")
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

    res.status(201).json({ message: "User registered successfully.", user: data });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({
      error: "An error occurred while registering the user.",
      details: error.message,
    });
  }
});

/**
 * Authenticate user and log them in
 * @route POST /api/users/login
 * @access Public
 */
router.post("/login", async (req, res) => {
  try {
    let { username, password } = req.body;

    username = typeof username === 'string' ? validator.trim(username) : '';
    password = typeof password === 'string' ? validator.trim(password) : '';

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }

    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") { // Supabase specific code for no data
        return res.status(400).json({ error: "Invalid username or password." });
      }
      throw fetchError;
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(400).json({ error: "Invalid username or password." });
    }

    const payload = {
      user_id: user.user_id,
      username: user.username,
      email: user.email,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    res.status(200).json({
      message: "Login successful.",
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        user_avatar: user.user_avatar,
      },
    });
  } catch (error) {
    console.error("Error logging in user:", error);
    res.status(500).json({
      error: "An error occurred while logging in the user.",
      details: error.message,
    });
  }
});

import nodemailer from 'nodemailer';

// Configure Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Send password reset email
 * @route POST /api/users/reset-password
 * @access Public
 */
router.post("/reset-password", async (req, res) => {
  try {
    let { email } = req.body;
    email = typeof email === 'string' ? validator.normalizeEmail(email) : '';

    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: "Invalid email format." });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: "User not found." });
    }

    const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    const resetLink = `http://localhost:3000/pages/update-password?token=${token}`;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset Instructions - NoteHub",
      text: `To reset your password, click the link below:\n\n${resetLink}`,
    });

    res.status(200).json({
      message: "A reset link for password has been sent to your email",
    });
  } catch (error) {
    console.error("Error handling password reset:", error);
    res.status(500).json({
      error: "An error occurred while processing the request.",
      details: error.message,
    });
  }
});

router.use(authenticateToken);

/**
 * Update the user password in the database
 * @route POST /api/users/update-password
 * @access Private
 */
router.post("/update-password", async (req, res) => {
  try {
    let { email, newPassword } = req.body;

    email = typeof email === 'string' ? validator.normalizeEmail(email) : '';
    newPassword = typeof newPassword === 'string' ? validator.trim(newPassword) : '';

    if (!email || !newPassword) {
      return res.status(400).json({ error: "Email and new password are required." });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: "Invalid email format." });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    const { data, error } = await supabase
      .from("users")
      .update({ password: hashedPassword })
      .eq("email", email);

    if (error) {
      throw error;
    }

    res.status(200).json({ message: "Password updated successfully." });
  } catch (error) {
    console.error("Error updating password:", error);
    res.status(500).json({
      error: "An error occurred while updating the password.",
      details: error.message,
    });
  }
});

/**
 * Verify user password
 * @route POST /api/users/verify-password
 * @access Private
 */
router.post("/verify-password", async (req, res) => {
  try {
    let { userId, password } = req.body;

    userId = typeof userId === 'string' ? validator.trim(userId) : userId;
    password = typeof password === 'string' ? validator.trim(password) : password;

    if (!userId || !password) {
      return res.status(400).json({ error: "User ID and password are required." });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: "User not found." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Incorrect password." });
    }

    res.status(200).json({ isValid: true });
  } catch (error) {
    console.error("Error verifying password:", error);
    res.status(500).json({
      error: "An error occurred while verifying the password.",
      details: error.message,
    });
  }
});

/**
 * Change user email in the database
 * @route POST /api/users/change-email
 * @access Private
 */
router.post("/change-email", async (req, res) => {
  try {
    let { userId, newEmail } = req.body;

    userId = typeof userId === 'string' ? validator.trim(userId) : userId;
    newEmail = typeof newEmail === 'string' ? validator.normalizeEmail(newEmail) : '';

    if (!userId || !newEmail) {
      return res.status(400).json({ error: "User ID and new email address are required" });
    }

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (userError || !userId) {
      return res.status(404).json({ error: "User not found." });
    }

    const { error: updateError } = await supabase
      .from("users")
      .update({ email: newEmail })
      .eq("user_id", userId);

    if (updateError) {
      throw updateError;
    }

    res.status(200).json({ message: "Email changed successfully." });
  } catch (error) {
    console.error("Error changing email:", error);
    res.status(500).json({
      error: "An error occurred while changing the email.",
      details: error.message,
    });
  }
});

/**
 * Change user username in the database
 * @route POST /api/users/change-username
 * @access Private
 */
router.post("/change-username", async (req, res) => {
  try {
    let { userId, newUsername } = req.body;

    userId = typeof userId === 'string' ? validator.trim(userId) : userId;
    newUsername = typeof newUsername === 'string' ? validator.trim(newUsername) : '';

    if (!userId || !newUsername) {
      return res.status(400).json({ error: "User ID and new username are required." });
    }

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: "User not found." });
    }

    const { error: updateError } = await supabase
      .from("users")
      .update({ username: newUsername })
      .eq("user_id", userId);

    if (updateError) {
      throw updateError;
    }

    res.status(200).json({ message: "Username changed successfully." });
  } catch (error) {
    console.error("Error changing username:", error);
    res.status(500).json({
      error: "An error occurred while changing the username.",
      details: error.message,
    });
  }
});

/**
 * Change user profile image URL in the database
 * @route POST /api/users/change-image
 * @access Private
 */
router.post("/change-image", async (req, res) => {
  try {
    let { userId, newProfileImageUrl } = req.body;

    userId = typeof userId === 'string' ? validator.trim(userId) : userId;
    newProfileImageUrl = typeof newProfileImageUrl === 'string' ? validator.trim(newProfileImageUrl) : '';

    if (!userId || !newProfileImageUrl) {
      return res.status(400).json({ error: "User ID and new profile image URL are required." });
    }

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: "User not found." });
    }

    const { error: updateError } = await supabase
      .from("users")
      .update({ user_avatar: newProfileImageUrl })
      .eq("user_id", userId);

    if (updateError) {
      throw updateError;
    }

    res.status(200).json({ message: "Profile image changed successfully." });
  } catch (error) {
    console.error("Error changing profile image:", error);
    res.status(500).json({
      error: "An error occurred while changing the profile image.",
      details: error.message,
    });
  }
});

export default router;
