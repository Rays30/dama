// FILE: dama/client/net/socket.js
import io_client_lib from 'https://cdn.socket.io/4.7.5/socket.io.esm.min.js';

let socket = null;
let connectionStatusCallback = () => {};
let localUser = null;

export const getLocalUser = () => localUser;

// ADD THESE EXPORTS:
export const getSocket = () => socket; // This will return the current socket instance

export const isSocketConnected = () => socket && socket.connected; // This will return true if connected

export const disconnectSocket = () => {
    if (socket) {
        console.log('Explicitly disconnecting socket.');
        socket.disconnect();
        socket = null; // Clear the socket instance
        connectionStatusCallback('Disconnected'); // Update status immediately
        localUser = null; // Clear local user data
            }
};

export const connectSocket = (serverUrl = null, statusCb) => {
    if (statusCb) connectionStatusCallback = statusCb;
    if (socket && socket.connected) return socket;

    const url = serverUrl || undefined;

    console.log(`Attempting to connect to Socket.IO server at: ${url || 'current host/port'}`);
    connectionStatusCallback('Connecting...');

    if (socket) socket.disconnect();
    
    socket = io_client_lib(url, { transports: ['websocket'] });

    socket.on('connect', () => {
        console.log('Connected to server! My socket ID is:', socket.id);
        connectionStatusCallback('Connected');
        
        const username = "Player" + Math.floor(Math.random() * 1000);
        console.log(`Identifying myself to the server as: ${username}`);
        socket.emit('user:hello', { username: username });
    });

    socket.on('user:welcome', (data) => {
        console.log('Server welcomed me!', data);
        localUser = data;
    });

    socket.on('disconnect', (reason) => {
        console.log('Disconnected from server:', reason);
        connectionStatusCallback(`Disconnected: ${reason}`);
        localUser = null;
    });

    socket.on('connect_error', (error) => {
        console.error('Connection Error:', error.message);
        connectionStatusCallback(`Connection Error: ${error.message}`);
    });

    return socket;
};