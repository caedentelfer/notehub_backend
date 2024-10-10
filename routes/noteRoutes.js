const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const authMiddleware = require('../middleware/auth'); // Import auth middleware
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Apply auth middleware to all routes in this router
router.use(authMiddleware);

// Get all notes accessible to the user
router.get('/notes', async (req, res) => {
  const userId = req.user.user_id;

  try {
    // Join user_notes with notes to fetch notes linked to the user
    const { data, error } = await supabase
      .from('user_notes')
      .select(`
        notes (
          note_id,
          title,
          content,
          category_id,
          tags,
          created_on,
          last_update
        )
      `)
      .eq('user_id', userId);

    if (error) throw error;

    // Extract notes from the joined data
    const notes = data.map(userNote => userNote.notes);

    res.json(notes);
  } catch (error) {
    console.error('Error fetching user notes:', error);
    res.status(500).json({ error: 'An error occurred while fetching notes' });
  }
});

// Get a single note, ensure the user has access
router.get('/notes/:id', async (req, res) => {
  const userId = req.user.user_id;
  const { id } = req.params;

  try {
    // Check if user has access to the note
    const { data: userNote, error: userNoteError } = await supabase
      .from('user_notes')
      .select('*')
      .eq('user_id', userId)
      .eq('note_id', id)
      .single();

    if (userNoteError) {
      if (userNoteError.code === 'PGRST116') { // Not found
        return res.status(404).json({ error: 'Note not found or access denied' });
      }
      throw userNoteError;
    }

    // Fetch the note
    const { data: noteData, error: noteError } = await supabase
      .from('notes')
      .select('*')
      .eq('note_id', id)
      .single();

    if (noteError) throw noteError;

    res.json(noteData);
  } catch (error) {
    console.error('Error fetching note:', error);
    res.status(500).json({ error: 'An error occurred while fetching the note', details: error.message });
  }
});

// Create a new note
router.post('/notes', async (req, res) => {
  const userId = req.user.user_id;
  const { title, content, category_id, tags } = req.body;

  try {
    let categoryId = category_id;

    // If category_id is a string (name of a new category), create it first
    if (typeof category_id === 'string' && !Number.isInteger(Number(category_id))) {
      const { data: newCategory, error: categoryError } = await supabase
        .from('categories')
        .insert({ name: category_id })
        .select()
        .single();

      if (categoryError) throw categoryError;
      categoryId = newCategory.category_id;
    }

    // Insert the new note
    const { data: newNote, error: noteError } = await supabase
      .from('notes')
      .insert([{ title, content, category_id: categoryId, tags, created_on: new Date().toISOString(), last_update: new Date().toISOString() }])
      .select()
      .single();

    if (noteError) throw noteError;

    // Insert into user_notes with is_creator = true
    const { data: userNoteData, error: userNoteError } = await supabase
      .from('user_notes')
      .insert([{ user_id: userId, note_id: newNote.note_id, is_creator: true }])
      .select()
      .single();

    if (userNoteError) throw userNoteError;

    res.status(201).json(newNote);
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({ error: 'An error occurred while creating the note', details: error.message });
  }
});

// Update a note, ensure the user has access
router.put('/notes/:id', async (req, res) => {
  const userId = req.user.user_id;
  const { id } = req.params;
  const { title, content, category_id, tags } = req.body;

  try {
    // Check if user has access to the note
    const { data: userNote, error: userNoteError } = await supabase
      .from('user_notes')
      .select('*')
      .eq('user_id', userId)
      .eq('note_id', id)
      .single();

    if (userNoteError) {
      if (userNoteError.code === 'PGRST116') { // Not found
        return res.status(404).json({ error: 'Note not found or access denied' });
      }
      throw userNoteError;
    }

    // Update the note
    const { data: updatedNote, error: updateError } = await supabase
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

    if (updateError) throw updateError;

    res.json(updatedNote);
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({ error: 'An error occurred while updating the note', details: error.message });
  }
});

// Delete a note, ensure the user is the creator
router.delete('/notes/:id', async (req, res) => {
  const userId = req.user.user_id;
  const { id } = req.params;

  try {
    // Check if user is the creator
    const { data: userNote, error: userNoteError } = await supabase
      .from('user_notes')
      .select('*')
      .eq('user_id', userId)
      .eq('note_id', id)
      .single();

    if (userNoteError) {
      if (userNoteError.code === 'PGRST116') { // Not found
        return res.status(404).json({ error: 'Note not found or access denied' });
      }
      throw userNoteError;
    }

    if (!userNote.is_creator) {
      return res.status(403).json({ error: 'Only the creator can delete the note' });
    }

    // Delete the note
    const { data: deletedNote, error: deleteError } = await supabase
      .from('notes')
      .delete()
      .eq('note_id', id)
      .select()
      .single();

    if (deleteError) throw deleteError;

    // Remove all user_notes entries for this note
    const { error: deleteUserNotesError } = await supabase
      .from('user_notes')
      .delete()
      .eq('note_id', id);

    if (deleteUserNotesError) throw deleteUserNotesError;

    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: 'An error occurred while deleting the note', details: error.message });
  }
});

// Get all categories
router.get('/categories', async (req, res) => {
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

// Create a new category
router.post('/categories', async (req, res) => {
  const { name } = req.body;

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

// Update a category
router.put('/categories/:id', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

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

// Delete a category
router.delete('/categories/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('categories')
      .delete()
      .eq('category_id', id);

    if (error) throw error;

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'An error occurred while deleting the category' });
  }
});

// Get all users (for sharing)
router.get('/users', async (req, res) => {
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

// Share a note with a user
router.post('/notes/:id/share', async (req, res) => {
  const userId = req.user.user_id; // the sharer
  const { id } = req.params; // note_id
  const { userId: targetUserId } = req.body; // the user to share with

  if (userId === targetUserId) {
    return res.status(400).json({ error: 'Cannot share note with yourself' });
  }

  try {
    // Check if note exists and user has access
    const { data: userNote, error: userNoteError } = await supabase
      .from('user_notes')
      .select('*')
      .eq('user_id', userId)
      .eq('note_id', id)
      .single();

    if (userNoteError) {
      if (userNoteError.code === 'PGRST116') { // Not found
        return res.status(404).json({ error: 'Note not found or access denied' });
      }
      throw userNoteError;
    }

    // Check if target user exists
    const { data: targetUser, error: targetUserError } = await supabase
      .from('users')
      .select('*')
      .eq('user_id', targetUserId)
      .single();

    if (targetUserError) {
      if (targetUserError.code === 'PGRST116') { // Not found
        return res.status(404).json({ error: 'User to share with not found' });
      }
      throw targetUserError;
    }

    // Check if the note is already shared with the target user
    const { data: existingShare, error: existingShareError } = await supabase
      .from('user_notes')
      .select('*')
      .eq('user_id', targetUserId)
      .eq('note_id', id)
      .single();

    if (!existingShareError && existingShare) {
      return res.status(400).json({ error: 'This note is already shared with this user' });
    }

    // Insert into user_notes
    const { data: sharedNote, error: shareError } = await supabase
      .from('user_notes')
      .insert([{ user_id: targetUserId, note_id: id, is_creator: false }])
      .select()
      .single();

    if (shareError) throw shareError;

    res.status(201).json({ message: 'Note shared successfully', sharedNote });
  } catch (error) {
    console.error('Error sharing note:', error);
    res.status(500).json({ error: 'An error occurred while sharing the note', details: error.message });
  }
});

module.exports = router;
