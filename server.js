// backend/server.js

import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import noteRoutes from './routes/noteRoutes.js';
import userRoutes from './routes/userRoutes.js';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis'; // Import Redis from 'ioredis'
import { RedisPersistence } from 'y-redis'; // Import RedisPersistence from 'y-redis'
import { setupWSConnection } from './yjsUtils.js'; // Import your custom setupWSConnection
import logger from './logger.js'; // Import logger if implemented

dotenv.config();

const app = express();
const server = http.createServer(app);

const port = process.env.PORT || 3001;

// Configure CORS
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
  logger.error('Supabase URL or Key is missing. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Initialize Redis
if (!process.env.REDIS_URL) {
  logger.error('Redis URL is missing. Please set the REDIS_URL environment variable.');
  process.exit(1);
}

const redisClient = new Redis(process.env.REDIS_URL); // Initialize Redis client

const redisPersistence = new RedisPersistence(redisClient); // Initialize RedisPersistence

// Add error handling for Redis connection
redisClient.on('error', (err) => {
  logger.error(`Redis connection error: ${err}`);
});

redisClient.on('connect', () => {
  logger.info('Connected to Redis successfully');
});

// Initialize Yjs document map
const docs = new Map();

// Load and Persist Functions
const loadDocument = async (noteId) => {
  if (docs.has(noteId)) return docs.get(noteId);

  const ydoc = new Y.Doc();

  try {
    // Try to load the document from Redis first
    const redisDoc = await redisPersistence.getYDoc(noteId);
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
      await redisPersistence.storeYDoc(noteId, Y.encodeStateAsUpdate(ydoc));
    }
  } catch (err) {
    logger.error(`Error loading document ${noteId}: ${err}`);
  }

  docs.set(noteId, ydoc);
  return ydoc;
};

const persistDocument = async (noteId, ydoc) => {
  try {
    const state = Y.encodeStateAsUpdate(ydoc);
    const base64State = Buffer.from(state).toString('base64');

    // Update Redis
    await redisPersistence.storeYDoc(noteId, state);

    // Update Supabase
    await supabase
      .from('notes')
      .update({ yjs_state: base64State, last_update: new Date().toISOString() })
      .eq('note_id', noteId);

    logger.info(`Persisted document ${noteId} to Redis and Supabase.`);
  } catch (err) {
    logger.error(`Error persisting document ${noteId}: ${err}`);
  }
};

// Initialize WebSocket Server
const wss = new WebSocketServer({ noServer: true });

// Handle WebSocket Connections with Redis Persistence
wss.on('connection', (ws, req) => {
  logger.info(`New WebSocket connection established for document: ${req.url}`);
  setupWSConnection(ws, req, { persistence: redisPersistence, gc: true });
});

// Handle WebSocket upgrade requests
server.on('upgrade', (request, socket, head) => {
  // You can add authentication here if needed
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Persistence interval
const PERSISTENCE_INTERVAL = 5 * 60 * 1000; // 5 minutes

setInterval(() => {
  for (const [noteId, ydoc] of docs.entries()) {
    persistDocument(noteId, ydoc);
  }
}, PERSISTENCE_INTERVAL);

// Start the Server
server.listen(port, () => {
  logger.info(`Server running on port ${port}`);
});

// Graceful Shutdown Handling
const shutdown = () => {
  logger.info('Shutting down server...');
  wss.close(() => {
    logger.info('WebSocket server closed.');
    redisClient.quit(() => {
      logger.info('Redis connection closed.');
      server.close(() => {
        logger.info('HTTP server closed.');
        process.exit(0);
      });
    });
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { app, server };
