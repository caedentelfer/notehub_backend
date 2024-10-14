// backend/routes/userRoutes.js

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import validator from 'validator';
import authenticateToken from '../middleware/authMiddleware.js'; // Ensure the path and extension are correct
import nodemailer from 'nodemailer';

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

    /*hash / encrypt password using bcrypt*/
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    /*insert new user in db*/
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
  const { username, password, rememberMe } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  try {
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

    const expiresIn = rememberMe ? '5h' : '1h';
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });

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


/**
 * Refresh the user token
 * @route POST /api/users/refresh-token
 * @access Public
 */
router.post("/refresh-token", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const newToken = jwt.sign(
      {
        user_id: decoded.user_id,
        username: decoded.username,
        email: decoded.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ token: newToken });
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});


/**
 * Refresh the user token
 * @route POST /api/users/refresh-token
 * @access Public
 */
router.post("/refresh-token", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const newToken = jwt.sign(
      {
        user_id: decoded.user_id,
        username: decoded.username,
        email: decoded.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ token: newToken });
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});


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

    /*use JWT tokens for verification*/
    const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET, {
      expiresIn: "1h",
      expiresIn: "1h",
    });

    console.log("Generated Token:", token); /*debug logging*/

    /*link attached in email to reset password*/ //TODO might need to change LINK
    const resetLink = `http://localhost:3000/pages/update-password?token=${token}`;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset Instructions - NoteHub",
      text: `Please click the link below in order to reset your password:\n\n${resetLink}`,
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

  let { email, newPassword } = req.body;

  email = typeof email === 'string' ? validator.normalizeEmail(email) : '';
  newPassword = typeof newPassword === 'string' ? validator.trim(newPassword) : '';

  if (!email || !newPassword) {
    return res.status(400).json({ error: "Email and new password are required." });
  }

  if (!validator.isEmail(email)) {
    return res.status(400).json({ error: "Invalid email format." });
  }

  try {
    /*Hash new password for encryption*/
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
    console.error("Error updating password:", error); /*debug logging*/
    res.status(500).json({
      error: "Error occurred while updating the password.",
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

    /*Compare provided password with encrypted password in db*/
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Incorrect password." });
    }

    /*if valid, successful */
    res.status(200).json({ isValid: true });
  } catch (error) {
    console.error("Error verifying password:", error);
    res.status(500).json({
      error: "Error occurred while verifying the password.",
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
      error: "Error occurred while changing user email.",
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

  let { userId, newUsername } = req.body;

  userId = typeof userId === 'string' ? validator.trim(userId) : userId;
  newUsername = typeof newUsername === 'string' ? validator.trim(newUsername) : '';

  if (!userId || !newUsername) {
    return res.status(400).json({ error: "User ID and new username are required." });
  }

  try {
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
      error: "Error occurred while changing username.",
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

    res.status(200).json({ message: "User avatar changed successfully." });
  } catch (error) {
    console.error("Error changing user avatar:", error);
    res.status(500).json({
      error: "Error occurred while changing user avatar.",
      details: error.message,
    });
  }
});

/**
 * @route   POST /api/users/delete
 * @desc    Delete a user and their associated notes from the database
 * @access  Public
 */
router.post("/delete", async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "UserId is required." });
  }

  try {
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: "User not found." });
    }

    /*Delete all notes associated with userId in user_notes table*/
    const { error: deleteNotesError } = await supabase
      .from("user_notes")
      .delete()
      .eq("user_id", userId);

    if (deleteNotesError) {
      throw deleteNotesError;
    }

    /*finally delete user from the db*/
    const { error: deleteUserError } = await supabase
      .from("users")
      .delete()
      .eq("user_id", userId);

    if (deleteUserError) {
      throw deleteUserError;
    }

    res
      .status(200)
      .json({ message: "User and associated have been deleted successfully " });
  } catch (error) {
    console.error("Error deleting user and notes:", error);
    res.status(500).json({
      error: "Error occurred while deleting user.",
      details: error.message,
    });
  }
});

export default router;
