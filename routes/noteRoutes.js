import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import validator from 'validator'; 
import authenticateToken from '../middleware/authMiddleware.js'; 

dotenv.config();

const router = express.Router();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

/**
 * Get all notes for the authenticated user.
 * @route GET /api/notes
 * @access Private
 */
router.get('/notes', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;
    const { data: userNotes, error: userNotesError } = await supabase /* Get all notes for the authenticated user. */
      .from('user_notes')
      .select('note_id')
      .eq('user_id', user_id);

    if (userNotesError) throw userNotesError;

    const noteIds = userNotes.map(un => un.note_id); /* Extract note IDs from the user_notes data. */

    if (noteIds.length === 0) { 
      return res.json([]);
    }

    const { data: notes, error: notesError } = await supabase /* Get all notes with the extracted note IDs. */
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
  id = validator.trim(id); /* Sanitize the IDs */

  try {
    const { data, error } = await supabase /* Get the note by ID. */
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

  title = validator.trim(title); /* Sanitize the title */
  content = validator.trim(content); /* Sanitize the content */
  category_id = typeof category_id === 'string' ? validator.trim(category_id) : category_id; /* Sanitize the catagory_ids */

  try {
    let categoryId = category_id;

    if (typeof category_id === 'string' && !Number.isInteger(Number(category_id))) { /* Check if the category_id is a string and not a number */
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

    const { data: userNote, error: userNoteError } = await supabase /* Add the note to the user_notes table. */
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

  id = validator.trim(id);  /* Sanitize the IDs */
  title = validator.trim(title); /* Sanitize the title */
  content = validator.trim(content);  /* Sanitize the content */
  category_id = typeof category_id === 'string' ? validator.trim(category_id) : category_id; /* Sanitize the category_id */

  try {
    const { data, error } = await supabase /* Update the note by ID. */
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
  id = validator.trim(id); /* Sanitize the IDs */

  try {
    const { error: userNotesDeleteError } = await supabase /* Delete the note from the user_notes table. */
      .from('user_notes')
      .delete()
      .eq('note_id', id);

    if (userNotesDeleteError) throw userNotesDeleteError;

    const { error: noteSharingDeleteError } = await supabase /* Delete the note from the note_sharing table. */
      .from('note_sharing')
      .delete()
      .eq('note_id', id);

    if (noteSharingDeleteError) throw noteSharingDeleteError;

    const { error: noteDeleteError } = await supabase /* Delete the note by ID. */
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
    const { data, error } = await supabase /* Get all categories. */
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
  name = validator.trim(name); /* Sanitize the name */

  try {
    const { data, error } = await supabase   /* Create a new category. */
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

  id = validator.trim(id); /* Sanitize the IDs */
  name = validator.trim(name);  /* Sanitize the name */

  try {
    const { data, error } = await supabase /* Update the category by ID. */
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
  id = validator.trim(id); /* Sanitize the IDs */

  try {
    const { data, error } = await supabase /* Delete the category by ID. */
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
    const { data, error } = await supabase /* Get all users. */
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
  const { userId } = req.body; /* Get the user ID from the request body */
 
  try {
    // Check if the note exists
    const { data: noteData, error: noteError } = await supabase /* Check if the note exists. */
      .from('notes')
      .select('note_id')
      .eq('note_id', id)
      .single();

    if (noteError) throw noteError;

    if (!noteData) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Check if the user exists
    const { data: userData, error: userError } = await supabase /* Check if the user exists. */
      .from('users')
      .select('user_id')
      .eq('user_id', userId)
      .single();

    if (userError) throw userError;

    if (!userData) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if the note is already shared with the user
    const { data: existingShare, error: existingShareError } = await supabase /* Check if the note is already shared with the user. */
      .from('user_notes')
      .select('*')
      .eq('note_id', id)
      .eq('user_id', userId)
      .single();

    if (existingShareError && existingShareError.code !== 'PGRST116') throw existingShareError; // PGRST116 = no data found

    if (existingShare) {
      return res.status(400).json({ error: 'Note is already shared with this user' });
    }

    // Add the user to the user_notes table
    const { data: sharedNote, error: shareError } = await supabase /* Add the user to the user_notes table. */
      .from('user_notes')
      .insert([{ note_id: id, user_id: userId, is_creator: false }])
      .select()
      .single();

    if (shareError) throw shareError;

    res.status(200).json({ message: 'Note shared successfully', data: sharedNote });
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
  id = validator.trim(id); /* Sanitize the IDs */

  try {
    const { data: users, error } = await supabase /* Get users with access to the note. */
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

  noteId = validator.trim(noteId); /* Sanitize the IDs */
  userId = validator.trim(userId);  /* Sanitize the IDs */

  try {
    // Check if the requester is the creator of the note
    const { data: creatorData, error: creatorError } = await supabase /* Check if the requester is the creator of the note. */
      .from('user_notes')
      .select('is_creator')
      .eq('note_id', noteId)
      .eq('user_id', requestingUserId)
      .single();

    if (creatorError) throw creatorError;

    if (!creatorData || !creatorData.is_creator) {
      return res.status(403).json({ error: 'Only the creator can remove user access' });
    }

    const { data, error } = await supabase /* Remove user access from the note. */
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
