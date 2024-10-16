import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { encoding, decoding } from 'lib0';
import logger from './logger.js';

/**
 * Handles a WebSocket connection for Yjs document synchronization.
 * @param {WebSocket} conn - The WebSocket connection.
 * @param {http.IncomingMessage} req - The HTTP request.
 * @param {Object} options - Additional options.
 * @param {RedisPersistence} options.persistence - Redis persistence instance.
 * @param {boolean} options.gc - Garbage collection flag.
 */
export const setupWSConnection = async (conn, req, options = {}) => {
    const { persistence, gc = true } = options;

    // Extract document name from the URL, assuming format ws://host/docName
    const docName = req.url.slice(1).split('?')[0];

    try {
        // Get the Yjs document from Redis
        const ydoc = await persistence.getYDoc(docName);
        ydoc.gc = gc;

        // Bind the Yjs document state to Redis
        await persistence.bindState(docName, ydoc);

        const awareness = new Awareness(ydoc);
        awareness.setLocalState(null); // Initialize awareness

        // Encode initial sync step 1
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 0); // message type: sync step 1
        const syncStep1 = Y.encodeStateAsUpdate(ydoc);
        encoding.writeVarUint8Array(encoder, syncStep1);
        conn.send(encoding.toUint8Array(encoder));

        // Listen for updates from Yjs document and send to client
        const updateHandler = (update, origin) => {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 1); // message type: update
            encoding.writeVarUint8Array(encoder, update);
            conn.send(encoding.toUint8Array(encoder));
        };
        ydoc.on('update', updateHandler);

        // Handle incoming messages from client
        conn.on('message', (message) => {
            const decoder = decoding.createDecoder(new Uint8Array(message));
            const messageType = decoding.readVarUint(decoder);

            switch (messageType) {
                case 0: // sync step 1
                    const update = decoding.readVarUint8Array(decoder);
                    Y.applyUpdate(ydoc, update);
                    break;
                case 1: // update
                    const clientUpdate = decoding.readVarUint8Array(decoder);
                    Y.applyUpdate(ydoc, clientUpdate);
                    break;
                case 2: // awareness update
                    const awarenessUpdate = decoding.readVarUint8Array(decoder);
                    awareness.applyUpdate(awarenessUpdate, conn);
                    break;
                default:
                    logger.warn(`Unknown message type received: ${messageType}`);
            }
        });

        // Handle awareness updates and broadcast to other clients
        const awarenessUpdateHandler = ({ added, updated, removed }) => {
            const changedClients = added.concat(updated).concat(removed);
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 2); // message type: awareness update
            encoding.writeVarUint8Array(encoder, awareness.encodeUpdate(changedClients));
            const message = encoding.toUint8Array(encoder);
            conn.send(message);
        };
        awareness.on('update', awarenessUpdateHandler);

        // Handle connection close
        conn.on('close', () => {
            ydoc.off('update', updateHandler);
            awareness.off('update', awarenessUpdateHandler);
            awareness.destroy();
            persistence.unbindState(docName, ydoc);
            logger.info(`WebSocket connection closed for document: ${docName}`);
        });

        logger.info(`WebSocket connection fully set up for document: ${docName}`);
    } catch (error) {
        logger.error(`Error setting up WebSocket connection for ${docName}:`, error);
        conn.close();
    }
};