// backend/yjsUtils.js

import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { encoding, decoding } from 'lib0';
import { RedisPersistence } from 'y-redis';

/**
 * Handles a WebSocket connection for Yjs document synchronization.
 * @param {WebSocket} conn - The WebSocket connection.
 * @param {http.IncomingMessage} req - The HTTP request.
 * @param {Object} options - Additional options.
 * @param {RedisPersistence} options.persistence - Redis persistence instance.
 * @param {boolean} options.gc - Garbage collection flag.
 */
export const setupWSConnection = (conn, req, options = {}) => {
    const { persistence, gc = true } = options;

    // Extract document name from the URL, assuming format ws://host/docName
    const docName = req.url.slice(1).split('?')[0];

    // Get the Yjs document from Redis
    const ydoc = persistence.getYDoc(docName);
    ydoc.gc = gc;

    // Bind the Yjs document state to Redis
    persistence.bindState(docName, ydoc);

    const awareness = new Awareness(ydoc);
    awareness.setLocalState(null); // Initialize awareness

    // Encode initial sync step 1
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0); // message type: sync step 1
    const syncStep1 = Y.encodeStateAsUpdate(ydoc);
    encoding.writeVarUint8Array(encoder, syncStep1);
    conn.send(encoding.toUint8Array(encoder));

    // Listen for updates from Yjs document and send to client
    ydoc.on('update', (update) => {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 1); // message type: update
        encoding.writeVarUint8Array(encoder, update);
        conn.send(encoding.toUint8Array(encoder));
    });

    // Handle incoming messages from client
    conn.on('message', (message) => {
        const decoder = decoding.createDecoder(new Uint8Array(message));
        const messageType = decoding.readVarUint(decoder);

        if (messageType === 0) { // sync step 1
            const update = decoding.readVarUint8Array(decoder);
            Y.applyUpdate(ydoc, update);
        } else if (messageType === 1) { // update
            const update = decoding.readVarUint8Array(decoder);
            Y.applyUpdate(ydoc, update);
        } else if (messageType === 2) { // awareness update
            const awarenessUpdate = decoding.readVarUint8Array(decoder);
            awareness.applyUpdate(awarenessUpdate, conn);
        }
    });

    // Handle awareness updates and broadcast to other clients
    awareness.on('update', () => {
        const awarenessUpdate = awareness.encodeUpdate();
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 2); // message type: awareness update
        encoding.writeVarUint8Array(encoder, awarenessUpdate);
        conn.send(encoding.toUint8Array(encoder));
    });

    // Handle connection close
    conn.on('close', () => {
        awareness.destroy();
        persistence.unbindState(docName, ydoc);
    });
};
