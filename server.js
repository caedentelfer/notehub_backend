import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import noteRoutes from './routes/noteRoutes.js';
import userRoutes from './routes/userRoutes.js';
import { createClient } from '@supabase/supabase-js';
import * as Y from 'yjs';
import { setupWSConnection } from 'y-websocket/bin/utils';

// Initialize environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);

const port = process.env.PORT || 3001;

// CORS Middleware Configuration
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

// Middleware to parse JSON bodies
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
const docs = new Map();

/**
 * Load Yjs document from Supabase.
 * @param {string} noteId - The ID of the note to load.
 * @returns {Promise<Y.Doc>} - The loaded Yjs document.
 */
const loadDocument = async (noteId) => {
  if (docs.has(noteId)) return docs.get(noteId);

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

  docs.set(noteId, ydoc);
  return ydoc;
};

/**
 * Persist Yjs document to Supabase.
 * @param {string} noteId - The ID of the note to persist.
 * @param {Y.Doc} ydoc - The Yjs document to persist.
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

// Set up WebSocket server
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, req) => {
  setupWSConnection(ws, req, { docs: docs, awareness: {}, gc: true });
});

server.on('upgrade', (request, socket, head) => {
  const handleAuth = (ws) => {
    wss.emit('connection', ws, request);
  };

  wss.handleUpgrade(request, socket, head, handleAuth);
});

// Persistence interval (e.g., every 5 minutes)
const PERSISTENCE_INTERVAL = 5 * 60 * 1000;

setInterval(() => {
  for (const [noteId, ydoc] of docs.entries()) {
    persistDocument(noteId, ydoc);
  }
}, PERSISTENCE_INTERVAL);

// Start the server
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

export { app, server };
