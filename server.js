// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const noteRoutes = require('./routes/noteRoutes');
const { applyOperation } = require('./utils/ot');
const authRoutes = require('./routes/auth');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes); // Authentication routes

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error('Supabase URL or Key is missing. Please check your .env file.');
  process.exit(1);
}

app.use('/api', noteRoutes);

const activeNotes = {};

io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('join', (noteId) => {
    console.log('User joined note:', noteId);
    socket.join(noteId);
    if (!activeNotes[noteId]) {
      activeNotes[noteId] = { content: '', revision: 0 };
    }
  });

  socket.on('change', ({ noteId, operation, revision }) => {
    console.log('Received change:', { noteId, operation, revision });
    const note = activeNotes[noteId];
    if (revision === note.revision) {
      note.content = applyOperation(note.content, operation);
      note.revision++;
      console.log('Broadcasting update to', noteId);
      socket.to(noteId).emit('update', operation);
    } else {
      console.log('Out of sync, current revision:', note.revision);
      socket.emit('outOfSync');
    }
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});