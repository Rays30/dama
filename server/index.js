// dama/server/index.js

// --- SECTION 1: IMPORTS ---
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// IMPORT THE LOBBIES CLASS
import { Lobbies } from './lobbies.js';

// --- SECTION 2: SERVER AND APP SETUP ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allows your client to connect (or specify "http://localhost:8000")
        methods: ["GET", "POST"]
    }
});

// --- SECTION 3: SERVE CLIENT-SIDE FILES ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientPath = path.join(__dirname, '../dama');

console.log(`Serving static files from: ${clientPath}`);
app.use(express.static(clientPath));

// --- SECTION 4: SERVER CONFIGURATION AND VARIABLES ---
const PORT = process.env.PORT || 8000;

// Initialize the Lobbies manager
const lobbyManager = new Lobbies();

console.log('--- Dama Game Server Starting ---');

// --- SECTION 5: SOCKET.IO EVENT LISTENERS ---

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('user:hello', (payload) => {
        socket.data.username = payload.username || `Guest${Math.floor(Math.random() * 1000)}`;
        console.log(`User ${socket.id} identified as ${socket.data.username}`);
        socket.emit('user:welcome', { userId: socket.id, username: socket.data.username });
        lobbyManager._emitLobbyList(io);
    });

    socket.on('lobby:list:fetch', () => {
        socket.emit('lobby:list', { lobbies: lobbyManager.publicSummaries() });
        console.log(`Lobby list sent to ${socket.id}`);
    });

    socket.on('lobby:create', (payload, callback) => {
        lobbyManager.handleCreate(io, socket, payload, callback);
    });

    socket.on('lobby:join', (payload, callback) => {
        lobbyManager.handleJoin(io, socket, payload, callback);
    });

    socket.on('lobby:ready:set', (payload) => {
        lobbyManager.handleReady(io, socket, payload.ready);
    });

    // NEW: Handle host starting the game
    socket.on('lobby:start', () => {
        lobbyManager.handleStartGame(io, socket);
    });

    // NEW: Handle host closing a lobby
    socket.on('lobby:close', (payload) => {
        lobbyManager.handleCloseLobby(io, socket, payload.lobbyId);
    });

    // NEW: Handle a player explicitly leaving a lobby
    socket.on('lobby:leave', () => {
        lobbyManager.handleLeave(io, socket);
    });

    // NEW: Handle host kicking a player
    socket.on('lobby:kick', (payload) => {
        lobbyManager.handleKickPlayer(io, socket, payload);
    });

    socket.on('game:move', (move) => {
        lobbyManager.handleMove(io, socket, move);
    });

    socket.on('disconnect', (reason) => {
        console.log(`User disconnected: ${socket.id} (${reason})`);
        lobbyManager.handleDisconnect(io, socket);
    });
});

// --- SECTION 6: START THE SERVER ---
server.listen(PORT, () => {
    console.log(`Dama server listening on http://localhost:${PORT}`);
});
