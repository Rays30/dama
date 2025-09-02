// dama/server/index.js

// --- SECTION 1: IMPORTS ---
// All necessary libraries are imported here.
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { nanoid } from 'nanoid';
import path from 'path';
import { fileURLToPath } from 'url';

// --- SECTION 2: SERVER AND APP SETUP ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allows your client to connect
        methods: ["GET", "POST"]
    }
});

// --- SECTION 3: SERVE CLIENT-SIDE FILES (THE CORRECTED PART) ---
// This part correctly serves your game files.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientPath = path.join(__dirname, '../dama'); // Points to the folder with your client files

console.log(`Serving static files from: ${clientPath}`);
app.use(express.static(clientPath));

// --- SECTION 4: SERVER CONFIGURATION AND VARIABLES ---
const PORT = process.env.PORT || 8000; // Use port 8000
let lobbies = {}; 
let users = {};   

console.log('--- Dama Game Server Starting ---');

// --- SECTION 5: YOUR ORIGINAL GAME LOGIC ---
// This is all the code you were missing for creating lobbies, joining, etc.

function generateStandardBoard() {
    const boardSize = 8;
    const serializedBoard = Array(boardSize).fill(null).map(() => Array(boardSize).fill(null));
    piecesData.forEach(piece => {
        const pieceType = piece.player === 'red' ? 'R' : 'B';
        serializedBoard[piece.row][piece.col] = pieceType + (piece.isKing ? 'K' : '');
    });
    return serializedBoard;
}

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('user:hello', (payload) => {
        const username = payload.username || `Guest${Math.floor(Math.random() * 1000)}`;
        users[socket.id] = { username, lobbyId: null };
        console.log(`User ${socket.id} identified as ${username}`);
        socket.emit('user:welcome', { userId: socket.id, username: username });
    });

    socket.on('lobby:list:fetch', () => {
        const publicLobbies = Object.values(lobbies)
            .filter(lobby => lobby.privacy === 'public' && lobby.status === 'waiting')
            .map(lobby => ({
                id: lobby.id,
                name: lobby.name,
                hostUsername: users[lobby.hostId]?.username || 'Unknown',
                playerCount: Object.keys(lobby.players).length,
                status: lobby.status
            }));
        socket.emit('lobby:list', { lobbies: publicLobbies });
        console.log(`Lobby list sent to ${socket.id}`);
    });

    socket.on('lobby:create', (payload, callback) => {
        const user = users[socket.id];
        if (!user) {
            console.error(`Lobby creation failed for ${socket.id}: User not identified.`);
            return callback({ success: false, message: "User not identified." });
        }
        if (user.lobbyId) {
            console.error(`Lobby creation failed for ${user.username}: Already in a lobby.`);
            return callback({ success: false, message: "Already in a lobby." });
        }

        const newLobbyId = nanoid(10);
        const newLobby = {
            id: newLobbyId,
            name: payload.name,
            privacy: payload.privacy,
            password: payload.password,
            hostId: socket.id,
            players: {
                [socket.id]: { username: user.username, socketId: socket.id, ready: false, color: 'red' }
            },
            status: 'waiting',
            joinCode: payload.privacy === 'private' ? newLobbyId : null
        };
        lobbies[newLobbyId] = newLobby;
        user.lobbyId = newLobbyId;
        socket.join(newLobbyId);
        console.log(`Lobby created: ${newLobby.name} by ${user.username} (ID: ${newLobbyId})`);
        
        io.to(newLobbyId).emit('lobby:updated', { lobby: newLobby });
        callback({ success: true, lobbyId: newLobbyId, joinCode: newLobby.joinCode });
    });

    // ... (Your other socket listeners like lobby:join, game:move, etc. are here) ...

    socket.on('disconnect', (reason) => {
        console.log(`User disconnected: ${socket.id} (${reason})`);
        const user = users[socket.id];
        if (user && user.lobbyId) {
            const lobby = lobbies[user.lobbyId];
            if (lobby) {
                delete lobby.players[socket.id];
                if (socket.id === lobby.hostId) {
                    io.to(lobby.id).emit('lobby:destroyed', { lobbyId: lobby.id });
                    console.log(`Lobby ${lobby.name} destroyed due to host disconnect.`);
                    delete lobbies[lobby.id];
                } else {
                    io.to(lobby.id).emit('lobby:updated', { lobby });
                    console.log(`User ${user.username} left lobby ${lobby.name} due to disconnect.`);
                }
            }
        }
        delete users[socket.id];
    });
});

// --- SECTION 6: START THE SERVER ---
server.listen(PORT, () => {
    console.log(`Dama server listening on http://localhost:${PORT}`);
});