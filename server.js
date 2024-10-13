// server.js

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import noteRoutes from './routes/noteRoutes.js';
import userRoutes from './routes/userRoutes.js';
import { createClient } from '@supabase/supabase-js';
import * as Y from 'yjs';

// Initialize environment variables
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

// CORS Middleware
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

// API Routes
app.use('/api', noteRoutes);
app.use('/api/users', userRoutes);

// Supabase Client Initialization
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error('Supabase URL or Key is missing. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// In-memory storage for Yjs documents
const docs = {}; // { noteId: Y.Doc }

// Client ID management
let nextClientID = 1; // Unique numeric client ID generator
const socketIDtoClientID = new Map(); // Maps socket.id (string) to clientID (number)

// Helper function to generate random colors (optional)
function getRandomColor() {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

/**
 * Load Yjs document from Supabase
 * @param {string} noteId 
 * @returns {Y.Doc}
 */
const loadDocument = async (noteId) => {
  if (docs[noteId]) return docs[noteId];

  const ydoc = new Y.Doc();
  try {
    const { data, error } = await supabase
      .from('notes')
      .select('content, yjs_state')
      .eq('note_id', noteId)
      .single();

    if (error) throw error;

    if (data.yjs_state) {
      const decodedState = Buffer.from(data.yjs_state, 'base64');
      Y.applyUpdate(ydoc, decodedState);
    } else if (data.content) {
      // Initialize Yjs document with existing content
      ydoc.getText('content').insert(0, data.content);
      const state = Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString('base64');
      await supabase
        .from('notes')
        .update({ yjs_state: state })
        .eq('note_id', noteId);
    }
  } catch (err) {
    console.error(`Error loading document ${noteId}:`, err);
  }

  docs[noteId] = ydoc;
  return ydoc;
};

/**
 * Persist Yjs document to Supabase
 * @param {string} noteId 
 * @param {Y.Doc} ydoc 
 */
const persistDocument = async (noteId, ydoc) => {
  try {
    const state = Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString('base64');
    await supabase
      .from('notes')
      .update({ yjs_state: state, last_update: new Date().toISOString() })
      .eq('note_id', noteId);
    console.log(`Persisted document ${noteId} to Supabase.`);
  } catch (err) {
    console.error(`Error persisting document ${noteId}:`, err);
  }
};

// Set up Yjs document update listeners for persistence
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('join', async (noteId) => {
    console.log(`User ${socket.id} joined note: ${noteId}`);
    socket.join(noteId);

    const ydoc = await loadDocument(noteId);

    // Assign a unique numeric clientID
    const clientID = nextClientID++;
    socketIDtoClientID.set(socket.id, clientID);

    // Send initial document state to the client
    const state = Y.encodeStateAsUpdate(ydoc);
    socket.emit('yjs-update', state);

    // Listen for document updates from this client
    socket.on('yjs-update', (update) => {
      Y.applyUpdate(ydoc, new Uint8Array(update));
      // Broadcast the update to other clients in the same note
      socket.to(noteId).emit('yjs-update', update);
      // Persist the document
      persistDocument(noteId, ydoc);
    });

    // Listen for cursor position updates from this client
    socket.on('cursor-update', (cursorData) => {
      // Broadcast the cursor position to other clients in the same note
      socket.to(noteId).emit('cursor-update', {
        clientID,
        cursor: cursorData,
      });
    });

    // Handle disconnection and clean up
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      socketIDtoClientID.delete(socket.id);
      // Optionally, notify other clients to remove this user's cursor
      socket.to(noteId).emit('cursor-remove', { clientID });
    });
  });
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
