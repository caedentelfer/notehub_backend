// backend/routes/notesRoutes.js

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import validator from 'validator';
import authenticateToken from '../middleware/authMiddleware.js';
import nodemailer from 'nodemailer';

dotenv.config();

const router = express.Router();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Configure Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail', // Change this if you're using a different email service
  auth: {
    user: process.env.EMAIL_USER, // Your email address
    pass: process.env.EMAIL_PASS, // Your email password or app-specific password
  },
});

// Verify transporter configuration
transporter.verify(function (error, success) {
  if (error) {
    console.error('Nodemailer transporter verification failed:', error);
  } else {
    console.log('Nodemailer transporter is ready to send emails.');
  }
});

/**
 * Get all notes for the authenticated user.
 * @route GET /api/notes
 * @access Private
 */
router.get('/notes', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { data: userNotes, error: userNotesError } = await supabase
      .from('user_notes')
      .select('note_id')
      .eq('user_id', user_id);

    if (userNotesError) throw userNotesError;

    const noteIds = userNotes.map(un => un.note_id);

    if (noteIds.length === 0) {
      return res.json([]);
    }

    const { data: notes, error: notesError } = await supabase
      .from('notes')
      .select('*')
      .in('note_id', noteIds)
      .order('created_on', { ascending: false });

    if (notesError) throw notesError;

    res.json(notes);
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ error: 'An error occurred while fetching notes' });
  }
});

/**
 * Get a specific note by ID.
 * @route GET /api/notes/:id
 * @access Private
 */
router.get('/notes/:id', authenticateToken, async (req, res) => {
  let { id } = req.params;
  id = validator.trim(id);

  try {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('note_id', id)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: 'Note not found' });
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching note:', error);
    res.status(500).json({ error: 'An error occurred while fetching the note', details: error.message });
  }
});

/**
 * Create a new note.
 * @route POST /api/notes
 * @access Private
 */
router.post('/notes', authenticateToken, async (req, res) => {
  let { title, content, category_id, tags } = req.body;
  const { user_id } = req.user;

  title = validator.trim(title);
  content = validator.trim(content);
  category_id = typeof category_id === 'string' ? validator.trim(category_id) : category_id;

  try {
    let categoryId = category_id;

    if (typeof category_id === 'string' && !Number.isInteger(Number(category_id))) {
      if (!category_id) {
        throw new Error('Category name cannot be empty.');
      }

      const { data: newCategory, error: categoryError } = await supabase
        .from('categories')
        .insert({ name: category_id })
        .select()
        .single();

      if (categoryError) throw categoryError;
      categoryId = newCategory.category_id;
    }

    const { data: newNote, error: noteError } = await supabase
      .from('notes')
      .insert([{ title, content, category_id: categoryId, tags }])
      .select()
      .single();

    if (noteError) throw noteError;

    const { data: userNote, error: userNoteError } = await supabase
      .from('user_notes')
      .insert([{ note_id: newNote.note_id, user_id, is_creator: true }])
      .select()
      .single();

    if (userNoteError) throw userNoteError;

    res.status(201).json({ ...newNote, user_note: userNote });
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({ error: 'An error occurred while creating the note', details: error.message });
  }
});

/**
 * Update a note by ID.
 * @route PUT /api/notes/:id
 * @access Private
 */
router.put('/notes/:id', authenticateToken, async (req, res) => {
  let { id } = req.params;
  let { title, content, category_id, tags } = req.body;

  id = validator.trim(id);
  title = validator.trim(title);
  content = validator.trim(content);
  category_id = typeof category_id === 'string' ? validator.trim(category_id) : category_id;

  try {
    const { data, error } = await supabase
      .from('notes')
      .update({
        title,
        content,
        category_id,
        tags,
        last_update: new Date().toISOString()
      })
      .eq('note_id', id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: 'Note not found' });
    }

    res.json(data);
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({ error: 'An error occurred while updating the note', details: error.message });
  }
});

/**
 * Delete a note by ID.
 * @route DELETE /api/notes/:id
 * @access Private
 */
router.delete('/notes/:id', authenticateToken, async (req, res) => {
  let { id } = req.params;
  id = validator.trim(id);

  try {
    const { error: userNotesDeleteError } = await supabase
      .from('user_notes')
      .delete()
      .eq('note_id', id);

    if (userNotesDeleteError) throw userNotesDeleteError;

    const { error: noteSharingDeleteError } = await supabase
      .from('note_sharing')
      .delete()
      .eq('note_id', id);

    if (noteSharingDeleteError) throw noteSharingDeleteError;

    const { error: noteDeleteError } = await supabase
      .from('notes')
      .delete()
      .eq('note_id', id);

    if (noteDeleteError) throw noteDeleteError;

    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: 'An error occurred while deleting the note', details: error.message });
  }
});

/**
 * Get all categories.
 * @route GET /api/categories
 * @access Private
 */
router.get('/categories', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'An error occurred while fetching categories' });
  }
});

/**
 * Create a new category.
 * @route POST /api/categories
 * @access Private
 */
router.post('/categories', authenticateToken, async (req, res) => {
  let { name } = req.body;
  name = validator.trim(name);

  try {
    const { data, error } = await supabase
      .from('categories')
      .insert([{ name }])
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      throw new Error('No data returned from insert operation');
    }

    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'An error occurred while creating the category', details: error.message });
  }
});

/**
 * Update a category by ID.
 * @route PUT /api/categories/:id
 * @access Private
 */
router.put('/categories/:id', authenticateToken, async (req, res) => {
  let { id } = req.params;
  let { name } = req.body;

  id = validator.trim(id);
  name = validator.trim(name);

  try {
    const { data, error } = await supabase
      .from('categories')
      .update({ name })
      .eq('category_id', id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json(data);
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'An error occurred while updating the category', details: error.message });
  }

});

/**
 * Delete a category by ID.
 * @route DELETE /api/categories/:id
 * @access Private
 */
router.delete('/categories/:id', authenticateToken, async (req, res) => {
  let { id } = req.params;
  id = validator.trim(id);

  try {
    const { data, error } = await supabase
      .from('categories')
      .delete()
      .eq('category_id', id);

    if (error) throw error;

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'An error occurred while deleting the category', details: error.message });
  }
});

/**
 * Get all users.
 * @route GET /api/users
 * @access Private
 */
router.get('/users', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('user_id, username, email')
      .order('username', { ascending: true });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'An error occurred while fetching users' });
  }
});

/**
 * Share a note with a user by ID.
 * @route POST /api/notes/:id/share
 * @access Private
 */
router.post('/notes/:id/share', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  // Input validation
  if (!userId) {
    return res.status(400).json({ error: 'User ID to share with is required.' });
  }

  try {
    // Validate userId format (assuming it's numeric)
    if (!validator.isNumeric(userId.toString())) {
      return res.status(400).json({ error: 'Invalid user ID format.' });
    }

    // Check if the note exists
    const { data: noteData, error: noteError } = await supabase
      .from('notes')
      .select('*')
      .eq('note_id', id)
      .single();

    if (noteError || !noteData) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Check if the user exists
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (userError || !userData) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if the note is already shared with the user
    const { data: existingShare, error: existingShareError } = await supabase
      .from('user_notes')
      .select('*')
      .eq('note_id', id)
      .eq('user_id', userId)
      .single();

    if (existingShareError && existingShareError.code !== 'PGRST116') {
      // PGRST116 is the error code for "No rows found" in Supabase
      throw existingShareError;
    }

    if (existingShare) {
      return res.status(400).json({ error: 'Note is already shared with this user' });
    }

    // Add the user to the user_notes table
    const { data: sharedNote, error: shareError } = await supabase
      .from('user_notes')
      .insert([{ note_id: id, user_id: userId, is_creator: false }])
      .select()
      .single();

    if (shareError) throw shareError;

    // Fetch the sharer's username
    const { data: sharerData, error: sharerError } = await supabase
      .from('users')
      .select('username')
      .eq('user_id', req.user.user_id)
      .single();

    if (sharerError || !sharerData) {
      throw sharerError || new Error('Sharer not found');
    }

    // Prepare email options
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: userData.email,
      subject: 'A Note Has Been Shared With You - NoteHub',
      text: `Hello ${userData.username},

${sharerData.username} has shared the note "${noteData.title}" with you on NoteHub.

You can access the note by logging into your account.

Best regards,
NoteHub Team`,
      // Optionally, you can use HTML templates
      // html: `<p>Hello ${userData.username},</p><p>${sharerData.username} has shared the note "<strong>${noteData.title}</strong>" with you on NoteHub.</p><p>You can access the note by logging into your account.</p><p>Best regards,<br/>NoteHub Team</p>`
    };

    // Send email
    await transporter.sendMail(mailOptions);

    console.log(`Email sent to ${userData.email} for sharing note ID ${id}`);

    res.status(200).json({ message: 'Note shared successfully and email sent.' });
  } catch (error) {
    console.error('Error sharing note:', error);
    res.status(500).json({ error: 'An error occurred while sharing the note', details: error.message });
  }
});

/**
 * Get users with access to a specific note.
 * @route GET /api/notes/:id/users
 * @access Private
 */
router.get('/notes/:id/users', authenticateToken, async (req, res) => {
  let { id } = req.params;
  id = validator.trim(id);

  try {
    const { data: users, error } = await supabase
      .from('user_notes')
      .select(`
        user_id,
        is_creator,
        users (
          username,
          email
        )
      `)
      .eq('note_id', id);

    if (error) throw error;

    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching users with access:', error);
    res.status(500).json({ error: 'An error occurred while fetching users with access', details: error.message });
  }
});

/**
 * Remove user access from a note.
 * @route DELETE /api/notes/:noteId/users/:userId
 * @access Private
 */
router.delete('/notes/:noteId/users/:userId', authenticateToken, async (req, res) => {
  let { noteId, userId } = req.params;
  const { user_id: requestingUserId } = req.user;

  noteId = validator.trim(noteId);
  userId = validator.trim(userId);

  try {
    // Check if the requester is the creator of the note
    const { data: creatorData, error: creatorError } = await supabase
      .from('user_notes')
      .select('is_creator')
      .eq('note_id', noteId)
      .eq('user_id', requestingUserId)
      .single();

    if (creatorError) throw creatorError;

    if (!creatorData || !creatorData.is_creator) {
      return res.status(403).json({ error: 'Only the creator can remove user access' });
    }

    const { data, error } = await supabase
      .from('user_notes')
      .delete()
      .eq('note_id', noteId)
      .eq('user_id', userId);

    if (error) throw error;

    res.status(200).json({ message: 'User access removed successfully' });
  } catch (error) {
    console.error('Error removing user access:', error);
    res.status(500).json({ error: 'An error occurred while removing user access', details: error.message });
  }
});

export default router;
