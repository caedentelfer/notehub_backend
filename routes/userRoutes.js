const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/**
 * @route   POST /api/users/register
 * @desc    Register a new user
 * @access  Public
 */
router.post("/register", async (req, res) => {
  const { username, email, password, user_avatar } = req.body;

  // Basic validation
  if (!username || !email || !password) {
    return res
      .status(400)
      .json({ error: "Username, email, and password are required." });
  }

  try {
    // Check if username or email already exists
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

    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert new user into the database
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

    res
      .status(201)
      .json({ message: "User registered successfully.", user: data });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({
      error: "An error occurred while registering the user.",
      details: error.message,
    });
  }
});

/**
 * @route   POST /api/users/login
 * @desc    Authenticate user and log them in
 * @access  Public
 */
router.post("/login", async (req, res) => {
  const { username, password } = req.body; // Assuming login via username

  // Basic validation
  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required." });
  }

  try {
    // Fetch user by username
    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        // Not found
        return res.status(400).json({ error: "Invalid username or password." });
      }
      throw fetchError;
    }

    // Compare password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(400).json({ error: "Invalid username or password." });
    }

    // Generate JWT Token
    const payload = {
      user_id: user.user_id,
      username: user.username,
      email: user.email,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    // Optionally, set the token as an HTTP-only cookie
    // res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' });

    // Send the token in the response
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

const nodemailer = require("nodemailer");
/*SMTP transporter*/
const transporter = nodemailer.createTransport({
  service: "gmail" /*our notehub email service provider*/,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * @route   POST /api/users/reset-password
 * @desc    Send password reset email
 * @access  Public
 */
router.post("/reset-password", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required." });
  }

  try {
    /*ensure the user exists in the db*/
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single(); /*ensure only one user is returned (unique email)*/

    if (error || !user) {
      return res.status(404).json({ error: "User not found." });
    }

    // Generate a JWT token with the email
    const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET, {
      expiresIn: "1h", // Token expires in 1 hour
    });

    console.log("Generated Token:", token); // Log the token

    /*link attached in email to reset password*/ //TODO might need to change LINK
    const resetLink = `http://localhost:3000/pages/update-password?token=${token}`;

    /*use nodemailer to send the email*/
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

/**
 * @route   POST /api/users/update-password
 * @desc    Update the user password in the database
 * @access  Public
 */
router.post("/update-password", async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    return res
      .status(400)
      .json({ error: "Email and new password are required." });
  }

  try {
    /*Hash new password*/
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    /*update the users password with the signed in email address */
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
 * @route   POST /api/users/verify-password
 * @desc    Verify user password
 * @access  Public
 */
router.post("/verify-password", async (req, res) => {
  const { userId, password } = req.body;

  if (!userId || !password) {
    return res
      .status(400)
      .json({ error: "User ID and password are required." });
  }

  try {
    /*Retrieve the user from the database using the userId (currently signed in user)*/
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: "User not found." });
    }

    // Compare the provided password with the hashed password stored in the database
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Incorrect password." });
    }

    // If the password is valid, respond with success
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
 * @route   POST /api/users/change-email
 * @desc    Change user email in the database
 * @access  Public
 */
router.post("/change-email", async (req, res) => {
  const { userId, newEmail } = req.body;

  if (!userId || !newEmail) {
    return res
      .status(400)
      .json({ error: "User ID, and new email address are required" });
  }

  try {
    /*get user details from the db*/
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (userError || !userId) {
      return res.status(404).json({ error: "User not found." });
    }

    /*update user email*/
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
 * @route   POST /api/users/change-username
 * @desc    Change user username in the database
 * @access  Public
 */
router.post("/change-username", async (req, res) => {
  const { userId, newUsername } = req.body;

  if (!userId || !newUsername) {
    return res
      .status(400)
      .json({ error: "User ID and new username are required." });
  }

  try {
    /* Get user details from the database */
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: "User not found." });
    }

    /* Update user username */
    const { error: updateError } = await supabase
      .from("users")
      .update({ username: newUsername }) // Update the username field
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
 * @route   POST /api/users/change-image
 * @desc    Change user profile image URL in the database
 * @access  Public
 */
router.post("/change-image", async (req, res) => {
  const { userId, newProfileImageUrl } = req.body;

  if (!userId || !newProfileImageUrl) {
    return res
      .status(400)
      .json({ error: "User ID and new profile image URL are required." });
  }

  try {
    /* Get user details from the database */
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: "User not found." });
    }

    /* Update user profile image URL */
    const { error: updateError } = await supabase
      .from("users")
      .update({ user_avatar: newProfileImageUrl }) // Update the profile image URL field
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

module.exports = router;
