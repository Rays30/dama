import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors'; // For development convenience, allows cross-origin requests
import { Lobbies } from './lobbies.js';

const app = express();
const server = http.createServer(app);

// Use CORS for Socket.IO to allow connections from different origins during development
// In production on LAN, you might restrict this more or remove if serving client from same origin
const io = new SocketIOServer(server, {
    cors: {
        origin: "*", // Allow all origins for LAN development
        methods: ["GET", "POST"]
    }
});

const lobbies = new Lobbies();

// Serve static files from the 'dama' directory (adjust path as needed)
app.use(express.static('../dama')); // Assuming 'server' is sibling to 'dama'

io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Client -> Server: user:hello
    // Payload: { username: string }
    socket.on('user:hello', ({ username }) => {
        const sanitizedUsername = String(username || 'Guest').slice(0, 20).replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();
        socket.data.username = sanitizedUsername || 'Guest';
        console.log(`User ${socket.id} identified as ${socket.data.username}`);

        // Server -> Client: user:welcome
        // Payload: { userId: string, username: string }
        socket.emit('user:welcome', { userId: socket.id, username: socket.data.username });

        // Server -> Client: lobby:list (initial list)
        // Payload: { lobbies: Array<PublicLobbySummary> }
        socket.emit('lobby:list', { lobbies: lobbies.publicSummaries() });
    });

    // Client -> Server: lobby:list:fetch
    socket.on('lobby:list:fetch', () => {
        socket.emit('lobby:list', { lobbies: lobbies.publicSummaries() });
    });

    // Client -> Server: lobby:create
    // Payload: { name: string, privacy: 'public'|'private', password?: string }
    socket.on('lobby:create', (payload, cb) => lobbies.handleCreate(io, socket, payload, cb));

    // Client -> Server: lobby:join
    // Payload: { lobbyId?: string, code?: string, password?: string }
    socket.on('lobby:join', (payload, cb) => lobbies.handleJoin(io, socket, payload, cb));

    // Client -> Server: lobby:leave
    socket.on('lobby:leave', () => lobbies.handleLeave(io, socket));

    // Client -> Server: lobby:ready:set
    // Payload: { ready: boolean }
    socket.on('lobby:ready:set', ({ ready }) => lobbies.handleReady(io, socket, !!ready));

    // Client -> Server: game:move
    // Payload: { from: [number, number], to: [number, number], captures: Array<[number, number]> }
    socket.on('game:move', (move) => lobbies.handleMove(io, socket, move));

    // Standard Socket.IO disconnect event
    socket.on('disconnect', (reason) => {
        console.log(`Socket disconnected: ${socket.id}, reason: ${reason}`);
        lobbies.handleDisconnect(io, socket);
    });

    // Generic error handling
    socket.on('error', (err) => {
        console.error(`Socket error for ${socket.id}:`, err);
        socket.emit('error', { code: 'SERVER_ERROR', message: 'An internal server error occurred.' });
    });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Dama LAN server running on port ${PORT}. Serving client from ../dama`));
