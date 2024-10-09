const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Get all notes
router.get('/notes', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .order('created_on', { ascending: false });

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

// Create a new note
router.post('/notes', async (req, res) => {
  const { title, content, category_id } = req.body;

  try {
    const { data, error } = await supabase
      .from('notes')
      .insert([{ title, content, category_id }])
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      throw new Error('No data returned from insert operation');
    }

    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({ error: 'An error occurred while creating the note', details: error.message });
  }
});

// Update a note
router.put('/notes/:id', async (req, res) => {
  const { id } = req.params;
  const { title, content, category_id } = req.body;

  try {
    const { data, error } = await supabase
      .from('notes')
      .update({ title, content, category_id })
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
    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('note_id', id);

    if (error) throw error;

    res.status(204).send();
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

module.exports = router;