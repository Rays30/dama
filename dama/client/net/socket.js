// FILE: dama/client/net/socket.js
import io_client_lib from 'https://cdn.socket.io/4.7.5/socket.io.esm.min.js';

let socket = null;
let connectionStatusCallback = () => {};
let localUser = null;

export const getLocalUser = () => localUser;

export const connectSocket = (serverUrl = null, statusCb) => {
    if (statusCb) connectionStatusCallback = statusCb;
    if (socket && socket.connected) return socket;

    const url = serverUrl || `${location.protocol}//${location.hostname}:8000`;
    console.log(`Attempting to connect to Socket.IO server at: ${url}`);
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

// ===============================================
// MODIFIED/NEW FUNCTIONS ARE BELOW
// ===============================================

/**
 * Sends a request to the server to create a new lobby.
 * @param {string} lobbyName - The desired name for the lobby.
 * @param {boolean} isPrivate - Whether the lobby should be private or public.
 */
export const createLobby = (lobbyName, isPrivate) => {
    if (!socket || !socket.connected) return console.error("Not connected to server.");

    const payload = {
        name: lobbyName,
        privacy: isPrivate ? 'private' : 'public',
        password: '', // You can add password logic later
    };
    
    console.log("Sending 'lobby:create' with payload:", payload);

    socket.emit('lobby:create', payload, (response) => {
        console.log("Server responded to 'lobby:create':", response);
        if (response.success) {
            const code = response.joinCode || 'N/A (Public Lobby)';
            // This is where you would show your "Share Game Code" modal
            alert(`Lobby created!\nShare this code with a friend: ${code}`);
        } else {
            alert(`Error creating lobby: ${response.message}`);
        }
    });
};

/**
 * Sends a request to the server to join a lobby using a code.
 * @param {string} code - The game code provided by the host.
 */
export const joinLobbyWithCode = (code) => {
    if (!socket || !socket.connected) return console.error("Not connected to server.");

    const payload = {
        code: code,
        password: '' // You can add password logic later
    };

    console.log("Sending 'lobby:join' with code:", payload);

    socket.emit('lobby:join', payload, (response) => {
        console.log("Server responded to 'lobby:join':", response);
        if (response.success) {
            alert(`Successfully joined lobby ID: ${response.lobbyId}`);
            // Here you would switch to that lobby's waiting screen
        } else {
            alert(`Error joining lobby: ${response.message}`);
        }
    });
};

// --- Other helper functions your code needs ---
export const getSocket = () => socket;
export const isSocketConnected = () => socket && socket.connected;
export const disconnectSocket = () => {
    if (socket && socket.connected) {
        socket.disconnect();
    }
};