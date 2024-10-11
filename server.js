// backend/server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const noteRoutes = require('./routes/noteRoutes');
const userRoutes = require('./routes/userRoutes');
const { applyOperation, transformOperation } = require('./utils/ot');
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

const activeNotes = {}; // { noteId: { content: '', revision: 0, history: [] } }

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('join', async (noteId) => {
    console.log(`User ${socket.id} joined note: ${noteId}`);
    socket.join(noteId);

    if (!activeNotes[noteId]) {
      try {
        const { data, error } = await supabase
          .from('notes')
          .select('content, last_update')
          .eq('note_id', noteId)
          .single();

        if (error) throw error;

        activeNotes[noteId] = { content: data.content, revision: 0, history: [] };
      } catch (err) {
        console.error(`Exception fetching note ${noteId}:`, err);
        socket.emit('error', 'An exception occurred while fetching note content.');
        return;
      }
    }

    // Send current content and revision to the newly joined client
    socket.emit('init', {
      content: activeNotes[noteId].content,
      revision: activeNotes[noteId].revision
    });
  });

  socket.on('update', async ({ noteId, operations, revision }) => {
    console.log(`Received update for note ${noteId} from ${socket.id}:`, { operations, revision });

    if (!activeNotes[noteId]) {
      console.error(`Note ${noteId} not found in activeNotes.`);
      socket.emit('error', 'Note not found.');
      return;
    }

    const note = activeNotes[noteId];

    if (revision < note.revision) {
      // Transform incoming operations
      const opsSinceRevision = note.history.slice(revision);
      for (const pastOp of opsSinceRevision) {
        operations = transformOperation(operations, pastOp.operations);
      }
    }

    try {
      // Apply operations to server content
      const newContent = applyOperation(note.content, operations);
      note.content = newContent;
      note.revision += 1;

      // Save operation history
      note.history.push({ operations, revision: note.revision });

      // Acknowledge the client
      socket.emit('ack', note.revision);

      // Broadcast the operations to other clients
      socket.to(noteId).emit('update', { operations, revision: note.revision });

      // Persist the changes to Supabase
      const { data, error } = await supabase
        .from('notes')
        .update({ content: note.content, last_update: new Date().toISOString() })
        .eq('note_id', noteId);

      if (error) {
        console.error(`Error updating note ${noteId} in Supabase:`, error);
        socket.emit('error', 'Failed to persist changes.');
      }
    } catch (err) {
      console.error(`Error applying operations for note ${noteId}:`, err);
      socket.emit('error', 'Failed to apply operations.');
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Optional: Handle cleanup if necessary
  });
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});


