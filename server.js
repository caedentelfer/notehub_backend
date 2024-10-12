// server.js

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

// Use noteRoutes and userRoutes
app.use('/api', noteRoutes);
app.use('/api/users', userRoutes);

const activeNotes = {}; // { noteId: { content: '', revision: 0, history: [Operation], cursors: { socketId: position } } }

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('join', async (noteId) => {
    console.log(`User ${socket.id} joined note: ${noteId}`);
    socket.join(noteId);

    // Initialize activeNotes if not present
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

    // Send current content, revision, and existing cursor positions to the newly joined client
    socket.emit('init', {
      content: activeNotes[noteId].content,
      revision: activeNotes[noteId].revision,
      cursors: activeNotes[noteId].cursors
    });
  });

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

    // Get all operations that have been applied since the client's revision
    const concurrentOps = note.history.slice(revision);
    console.log(`Concurrent operations to transform against:`, concurrentOps);

    // Transform the incoming operations against concurrent operations
    const transformedOps = transformOperations(operations, concurrentOps);
    console.log(`Transformed operations:`, transformedOps);

    // Apply the transformed operations to the server's content
    try {
      const newContent = applyOperations(note.content, transformedOps);
      console.log(`New content after applying operations:`, newContent);
      note.content = newContent;
      note.revision += transformedOps.length; // Increment revision by number of operations

      // Add the transformed operations to the history
      note.history.push(...transformedOps);
      console.log(`Updated operation history:`, note.history);

      // Update cursor position for the sender
      note.cursors[socket.id] = cursorPosition;

      // Broadcast the transformed operations and updated revision to other clients
      socket.to(noteId).emit('update', { operations: transformedOps, revision: note.revision });
      socket.to(noteId).emit('cursor-update', { socketId: socket.id, cursorPosition });

      // Persist the changes to Supabase
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

  socket.on('cursor-update', ({ noteId, cursorPosition }) => {
    if (!activeNotes[noteId]) return;

    // Update the cursor position for this socket
    activeNotes[noteId].cursors[socket.id] = cursorPosition;

    // Broadcast the cursor position to other clients in the room
    socket.to(noteId).emit('cursor-update', { socketId: socket.id, cursorPosition });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Remove the user's cursor positions from all notes
    for (const noteId in activeNotes) {
      if (activeNotes[noteId].cursors[socket.id]) {
        delete activeNotes[noteId].cursors[socket.id];
        // Broadcast the cursor removal
        socket.to(noteId).emit('cursor-remove', { socketId: socket.id });
      }
    }
  });
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
