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

dotenv.config();

const app = express();
const server = http.createServer(app);

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

// API Routes
app.use('/api', noteRoutes);
app.use('/api/users', userRoutes);

// Supabase Client Initialization
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error('Supabase URL or Key is missing. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Redis setup
const redisClient = new Redis(process.env.REDIS_URL);
const redisProvider = new RedisProvider(redisClient);

// Add error handling for Redis connection
redisClient.on('error', (err) => {
  console.error('Redis connection error:', err);
});

redisClient.on('connect', () => {
  console.log('Connected to Redis successfully');
});

const docs = new Map();

const loadDocument = async (noteId) => {
  if (docs.has(noteId)) return docs.get(noteId);

  const ydoc = new Y.Doc();

  try {
    // Try to load the document from Redis first
    const redisDoc = await redisProvider.getYDoc(noteId);
    if (redisDoc) {
      Y.applyUpdate(ydoc, redisDoc);
    } else {
      // If not in Redis, load from Supabase
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
        ydoc.getText('content').insert(0, data.content);
      }

      // Store the loaded document in Redis
      await redisProvider.storeYDoc(noteId, Y.encodeStateAsUpdate(ydoc));
    }
  } catch (err) {
    console.error(`Error loading document ${noteId}:`, err);
  }

  docs.set(noteId, ydoc);
  return ydoc;
};

const persistDocument = async (noteId, ydoc) => {
  try {
    const state = Y.encodeStateAsUpdate(ydoc);
    const base64State = Buffer.from(state).toString('base64');

    // Update Redis
    await redisProvider.storeYDoc(noteId, state);

    // Update Supabase
    await supabase
      .from('notes')
      .update({ yjs_state: base64State, last_update: new Date().toISOString() })
      .eq('note_id', noteId);

    console.log(`Persisted document ${noteId} to Redis and Supabase.`);
  } catch (err) {
    console.error(`Error persisting document ${noteId}:`, err);
  }
};

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, req) => {
  setupWSConnection(ws, req, {
    docs: docs,
    awareness: {},
    gc: true,
    provider: redisProvider, // Pass the Redis provider to y-websocket
  });
});

// Handle WebSocket upgrade requests
server.on('upgrade', (request, socket, head) => {
  const handleAuth = (ws) => {
    wss.emit('connection', ws, request);
  };

  wss.handleUpgrade(request, socket, head, handleAuth);
});

// Persistence interval
const PERSISTENCE_INTERVAL = 5 * 60 * 1000;

setInterval(() => {
  for (const [noteId, ydoc] of docs.entries()) {
    persistDocument(noteId, ydoc);
  }
}, PERSISTENCE_INTERVAL);

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

export { app, server };