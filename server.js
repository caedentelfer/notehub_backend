const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const noteRoutes = require('./routes/noteRoutes');
const userRoutes = require('./routes/userRoutes');
const { transformOperations, applyOperations } = require('./utils/ot');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

const port = process.env.PORT || 3001;

app.use(cors({
  origin: new URL(process.env.FRONTEND_URL || "http://localhost:3000").origin,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true
}));

app.options('*', cors({
  origin: new URL(process.env.FRONTEND_URL || "http://localhost:3000").origin,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true
}));

app.use(express.json());

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error('Supabase URL or Key is missing. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.use('/api', noteRoutes);
app.use('/api/users', userRoutes);

const activeNotes = {};

/**
 * Handles WebSocket connections for real-time collaboration.
 * Upon a new connection, various events such as `join`, `update`, `cursor-update`, and `disconnect` are handled.
 * The server maintains a state for active notes, where each note has content, revision history, and cursor positions.
 */
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  /**
   * Handles when a user joins a note for collaboration.
   * If the note is not yet active, it fetches the note content from the database and initializes it.
   * The current content, revision, and cursor positions are sent to the newly connected client.
   * @param {string} noteId - The ID of the note to join.
   */
  socket.on('join', async (noteId) => {
    console.log(`User ${socket.id} joined note: ${noteId}`);
    socket.join(noteId);

    if (!activeNotes[noteId]) {
      activeNotes[noteId] = { content: '', revision: 0, history: [], cursors: {} };
      try {
        const { data, error } = await supabase
          .from('notes')
          .select('content, last_update')
          .eq('note_id', noteId)
          .single();

        if (error) throw error;

        activeNotes[noteId].content = data.content;
      } catch (err) {
        console.error(`Exception fetching note ${noteId}:`, err);
        socket.emit('error', 'An exception occurred while fetching note content.');
        return;
      }
    }

    socket.emit('init', {
      content: activeNotes[noteId].content,
      revision: activeNotes[noteId].revision,
      cursors: activeNotes[noteId].cursors
    });
  });

  /**
   * Handles updates made by users to the note content.
   * Operations are transformed against concurrent operations and applied to the note's content.
   * The transformed operations and new cursor position are broadcasted to other users in the same note.
   * The changes are persisted to the database.
   * @param {Object} data - Contains noteId, operations, revision, and cursor position.
   */
  socket.on('update', ({ noteId, operations, revision, cursorPosition }) => {
    console.log(`Received update for note ${noteId} from ${socket.id}:`, { operations, revision, cursorPosition });

    if (!activeNotes[noteId]) {
      console.error(`Note ${noteId} not found in activeNotes.`);
      socket.emit('error', 'Note not found.');
      return;
    }

    const note = activeNotes[noteId];

    if (revision > note.revision) {
      console.warn(`Client revision (${revision}) is ahead of server revision (${note.revision}).`);
      socket.emit('error', 'Invalid revision number.');
      return;
    }

    const concurrentOps = note.history.slice(revision);
    console.log(`Concurrent operations to transform against:`, concurrentOps);

    const transformedOps = transformOperations(operations, concurrentOps);
    console.log(`Transformed operations:`, transformedOps);

    try {
      const newContent = applyOperations(note.content, transformedOps);
      console.log(`New content after applying operations:`, newContent);
      note.content = newContent;
      note.revision += transformedOps.length;

      note.history.push(...transformedOps);
      console.log(`Updated operation history:`, note.history);

      note.cursors[socket.id] = cursorPosition;

      socket.to(noteId).emit('update', { operations: transformedOps, revision: note.revision });
      socket.to(noteId).emit('cursor-update', { socketId: socket.id, cursorPosition });

      supabase
        .from('notes')
        .update({ content: note.content, last_update: new Date().toISOString() })
        .eq('note_id', noteId)
        .then(({ data, error }) => {
          if (error) {
            console.error(`Error updating note ${noteId} in Supabase:`, error);
            socket.emit('error', 'Failed to persist changes.');
          } else {
            console.log(`Successfully updated note ${noteId} in Supabase.`);
          }
        });
    } catch (err) {
      console.error(`Error applying operations for note ${noteId}:`, err);
      socket.emit('error', 'Failed to apply operations.');
    }
  });

  /**
   * Handles cursor position updates from users.
   * Broadcasts the cursor position to other users in the same note.
   * @param {Object} data - Contains noteId and cursor position.
   */
  socket.on('cursor-update', ({ noteId, cursorPosition }) => {
    if (!activeNotes[noteId]) return;

    activeNotes[noteId].cursors[socket.id] = cursorPosition;
    socket.to(noteId).emit('cursor-update', { socketId: socket.id, cursorPosition });
  });

  /**
   * Handles the disconnection of a user.
   * Removes the user's cursor from all notes they were participating in and broadcasts the removal to other users.
   */
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    for (const noteId in activeNotes) {
      if (activeNotes[noteId].cursors[socket.id]) {
        delete activeNotes[noteId].cursors[socket.id];
        socket.to(noteId).emit('cursor-remove', { socketId: socket.id });
      }
    }
  });
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});