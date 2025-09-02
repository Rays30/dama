// FILE: dama/client/net/socket.js
import { io } from 'https://cdn.socket.io/4.7.5/socket.io.esm.min.js';

let socket = null;
let connectionStatusCallback = () => {}; // Callback to update UI

/**
 * Connects to the Socket.IO server.
 * @param {string|null} serverUrl - The URL of the Socket.IO server. Defaults to current host:4000.
 * @param {Function} statusCb - Callback for connection status updates (e.g., UI display).
 * @returns {SocketIO.Socket} The Socket.IO client instance.
 */
export const connectSocket = (serverUrl = null, statusCb) => {
    if (statusCb) {
        connectionStatusCallback = statusCb;
    }

    if (socket && socket.connected) {
        console.log('Socket already connected.');
        connectionStatusCallback('Connected');
        return socket;
    }

    const url = serverUrl || `${location.protocol}//${location.hostname}:4000`;
    console.log(`Attempting to connect to Socket.IO server at: ${url}`);
    connectionStatusCallback('Connecting...');

    // Close any existing but disconnected socket
    if (socket && !socket.connected) {
        socket.disconnect();
    }

    socket = io(url, { transports: ['websocket'] });

    socket.on('connect', () => {
        console.log('Connected to Socket.IO server', socket.id);
        connectionStatusCallback('Connected');
    });

    socket.on('disconnect', (reason) => {
        console.log('Disconnected from Socket.IO server', reason);
        connectionStatusCallback(`Disconnected: ${reason}`);
        // Optionally handle UI changes, e.g., show a reconnection message
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        connectionStatusCallback(`Connection Error: ${error.message}`);
    });

    socket.on('error', (payload) => {
        console.error('Socket error from server:', payload);
        // Display error to user in a more prominent way
    });

    return socket;
};

/**
 * Returns the current Socket.IO client instance.
 * @returns {SocketIO.Socket|null}
 */
export const getSocket = () => socket;

/**
 * Disconnects the socket.
 */
export const disconnectSocket = () => {
    if (socket && socket.connected) {
        socket.disconnect();
        socket = null;
        connectionStatusCallback('Disconnected');
        console.log('Manually disconnected from Socket.IO server.');
    }
};

/**
 * Checks if the socket is connected.
 * @returns {boolean}
 */
export const isSocketConnected = () => socket && socket.connected;