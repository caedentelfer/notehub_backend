const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Get notes for a specific user
router.get('/notes', async (req, res) => {
  const { user_id } = req.query;

  try {
    const { data, error } = await supabase
      .from('notes')
      .select('notes.*, user_notes.is_creator')
      .eq('user_notes.user_id', user_id)
      .innerJoin('user_notes', 'notes.note_id', 'user_notes.note_id');

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ error: 'An error occurred while fetching notes' });
  }
});

// Get a single note
router.get('/notes/:id', async (req, res) => {
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

// Create a new note and link it to the user
router.post('/notes', async (req, res) => {
  const { title, content, category_id, user_id, tags } = req.body;

  try {
    // Insert new note into the database
    const { data: newNote, error: noteError } = await supabase
      .from('notes')
      .insert([{ title, content, category_id, tags }])
      .select()
      .single();

    if (noteError) throw noteError;

    // Link the user to the newly created note in user_notes table
    const { data: userNoteLink, error: linkError } = await supabase
      .from('user_notes')
      .insert([{ user_id, note_id: newNote.note_id, is_creator: true }]);

    if (linkError) throw linkError;

    res.status(201).json(newNote);
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({ error: 'An error occurred while creating the note' });
  }
});

// Update a note
router.put('/notes/:id', async (req, res) => {
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
router.delete('/notes/:id', async (req, res) => {
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

// Share a note with another user
router.post('/notes/:id/share', async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  try {
    // Insert the shared note into the user_notes table for the other user
    const { data, error } = await supabase
      .from('user_notes')
      .insert([{ user_id: userId, note_id: id, is_creator: false }])
      .select();

    if (error) throw error;

    res.status(200).json({ message: 'Note shared successfully.' });
  } catch (error) {
    console.error('Error sharing note:', error);
    res.status(500).json({ error: 'An error occurred while sharing the note.' });
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

// Get all users
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
  const { id } = req.params;
  const { userId } = req.body;

  try {
    // First, check if the note exists
    const { data: noteData, error: noteError } = await supabase
      .from('notes')
      .select('note_id')
      .eq('note_id', id)
      .single();

    if (noteError) throw noteError;

    if (!noteData) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Then, check if the user exists
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('user_i d')
      .eq('user_id', userId)
      .single();

    if (userError) throw userError;

    if (!userData) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If both note and user exist, create the sharing relationship
    const { data, error } = await supabase
      .from('user_notes')
      .insert({ user_id: userId, note_id: id })
      .select()
      .single();

    if (error) {
      // If the error is due to a unique constraint violation, it means the note is already shared
      if (error.code === '23505') {
        return res.status(400).json({ error: 'This note is already shared with this user' });
      }
      throw error;
    }

    res.status(201).json({ message: 'Note shared successfully', data });
  } catch (error) {
    console.error('Error sharing note:', error);
    res.status(500).json({ error: 'An error occurred while sharing the note', details: error.message });
  }
});

module.exports = router;