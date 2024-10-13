// backend/collab-server/collabServer.js

import http from 'http';
import { WebSocketServer, WebSocket } from 'ws'; // Updated import
import * as Y from 'yjs';
import { encodeStateAsUpdate, applyUpdate } from 'yjs';
import pkg from 'lodash'; // Import lodash as default
const { debounce } = pkg; // Destructure debounce

const PORT = 1234; // Choose an appropriate port

const server = http.createServer();
const wss = new WebSocketServer({ server }); // Correct instantiation

const docs = new Map(); // Stores documents associated with each room

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const roomID = url.pathname.slice(1) || 'default-room';

    if (!docs.has(roomID)) {
        const doc = new Y.Doc();
        docs.set(roomID, doc);
    }

    const doc = docs.get(roomID);

    // Send the current document state to the new client
    const state = Y.encodeStateAsUpdate(doc);
    ws.send(state);

    // Function to broadcast updates to other clients
    const broadcastUpdate = debounce((update) => {
        wss.clients.forEach((client) => {
            if (
                client !== ws &&
                client.readyState === WebSocket.OPEN &&
                client.roomID === roomID
            ) {
                client.send(update);
            }
        });
    }, 10); // Debounce to prevent flooding

    // Listen for updates from this client
    ws.on('message', (data) => {
        if (data instanceof Buffer) {
            try {
                Y.applyUpdate(doc, new Uint8Array(data));
                broadcastUpdate(data);
            } catch (error) {
                console.error('Error applying update:', error);
            }
        } else {
            console.log('Received non-binary data');
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });

    ws.roomID = roomID; // Assign roomID to client for broadcasting
});

server.listen(PORT, () => {
    console.log(`Collaborative WebSocket server started on ws://localhost:${PORT}`);
});
