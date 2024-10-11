const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const authenticateToken = require('../middleware/authMiddleware');

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

router.get('/notes', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.user;

    // Step 1: Fetch note_ids from user_notes
    const { data: userNotes, error: userNotesError } = await supabase
      .from('user_notes')
      .select('note_id')
      .eq('user_id', user_id);

    if (userNotesError) throw userNotesError;

    const noteIds = userNotes.map(un => un.note_id);

    if (noteIds.length === 0) {
      return res.json([]); // No notes for the user
    }

    // Step 2: Fetch notes with the retrieved note_ids
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


// Get a single note
router.get('/notes/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
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

// Create a new note
router.post('/notes', authenticateToken, async (req, res) => {
  const { title, content, category_id, tags } = req.body;
  const { user_id } = req.user;

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
      .insert([{ title, content, category_id: categoryId, tags }])
      .select()
      .single();

    if (noteError) throw noteError;

    // Insert the user_note entry with is_creator set to true
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

// Update a note
router.put('/notes/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title, content, category_id, tags } = req.body;

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

// Delete a note
router.delete('/notes/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('notes')
      .delete()
      .eq('note_id', id);

    if (error) throw error;

    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: 'An error occurred while deleting the note' });
  }
});

// Get all categories
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

// Create a new category
router.post('/categories', authenticateToken, async (req, res) => {
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
router.put('/categories/:id', authenticateToken, async (req, res) => {
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
router.delete('/categories/:id', authenticateToken, async (req, res) => {
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

// Get all users
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

// Share a note with a user
router.post('/notes/:id/share', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  try {
    // Check if the note exists
    const { data: noteData, error: noteError } = await supabase
      .from('notes')
      .select('note_id')
      .eq('note_id', id)
      .single();

    if (noteError) throw noteError;

    if (!noteData) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Check if the user exists
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('user_id')
      .eq('user_id', userId)
      .single();

    if (userError) throw userError;

    if (!userData) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if the note is already shared with the user
    const { data: existingShare, error: existingShareError } = await supabase
      .from('user_notes')
      .select('*')
      .eq('note_id', id)
      .eq('user_id', userId)
      .single();

    if (existingShareError && existingShareError.code !== 'PGRST116') throw existingShareError;

    if (existingShare) {
      return res.status(400).json({ error: 'Note is already shared with this user' });
    }

    // Add the user to the user_notes table
    const { data: sharedNote, error: shareError } = await supabase
      .from('user_notes')
      .insert({ note_id: id, user_id: userId, is_creator: false })
      .select()
      .single();

    if (shareError) throw shareError;

    res.status(200).json({ message: 'Note shared successfully', data: sharedNote });
  } catch (error) {
    console.error('Error sharing note:', error);
    res.status(500).json({ error: 'An error occurred while sharing the note', details: error.message });
  }
});

module.exports = router;