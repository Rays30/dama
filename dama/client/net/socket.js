// FILE: dama/client/net/socket.js
import io_client_lib from 'https://cdn.socket.io/4.7.5/socket.io.esm.min.js'; // Ensure this is the correct import

let socket = null;
let connectionStatusCallback = () => {}; // Callback to update UI

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

    if (socket && !socket.connected) {
        socket.disconnect();
    }

    // Use the imported io_client_lib to create the socket instance
    socket = io_client_lib(url, { transports: ['websocket'] }); // Ensure 'transports' is set correctly

    socket.on('connect', () => {
        console.log('Connected to Socket.IO server', socket.id);
        connectionStatusCallback('Connected');
    });

    socket.on('disconnect', (reason) => {
        console.log('Disconnected from Socket.IO server', reason);
        connectionStatusCallback(`Disconnected: ${reason}`);
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        connectionStatusCallback(`Connection Error: ${error.message}`);
    });

    socket.on('error', (payload) => {
        console.error('Socket error from server:', payload);
    });

    return socket;
};

export const getSocket = () => socket;
export const disconnectSocket = () => { /* ... */ };
export const isSocketConnected = () => socket && socket.connected;