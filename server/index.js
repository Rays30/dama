// dama-server/index.js
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { nanoid } from 'nanoid'; // <-- ADDED: Import nanoid
import path from 'path'; // <-- ADDED: Import path for file paths
import { fileURLToPath } from 'url'; // <-- ADDED: Needed for ES Modules __dirname equivalent

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// --- ADDED: Code to serve your client files ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Construct the absolute path to the client folder, which is one level up
const clientPath = path.join(__dirname, '../client'); 
console.log(`Serving static files from: ${clientPath}`);
app.use(express.static(clientPath));
// ---------------------------------------------

const PORT = process.env.PORT || 8000; // <-- CHANGED: Port set to 8000 to match client

let lobbies = {}; 
let users = {};   

console.log('--- Dama Game Server Starting ---');

// --- (No changes to your game logic below this line) ---

// --- NEW HELPER: Generate a standard Dama board state ---
function generateStandardBoard() {
    // ... your generateStandardBoard function ...
    // This function is perfectly fine, no changes needed.
    const boardSize = 8;
    const initialBoard = Array(boardSize).fill(null).map(() => Array(boardSize).fill(null));
    const piecesData = [];
    let pieceCounter = 0;

    const topPlayerColor = 'blue';
    const bottomPlayerColor = 'red';

    for (let r = 0; r < boardSize; r++) {
        for (let c = 0; c < boardSize; c++) {
            if ((r + c) % 2 !== 0) { 
                if (r < 3) { 
                    piecesData.push({ id: pieceCounter++, player: topPlayerColor, row: r, col: c, isKing: false });
                } else if (r >= boardSize - 3) {
                    piecesData.push({ id: pieceCounter++, player: bottomPlayerColor, row: r, col: c, isKing: false });
                }
            }
        }
    }

    const serializedBoard = Array(boardSize).fill(null).map(() => Array(boardSize).fill(null));
    piecesData.forEach(piece => {
        const pieceType = piece.player === 'red' ? 'R' : 'B';
        serializedBoard[piece.row][piece.col] = pieceType + (piece.isKing ? 'K' : '');
    });

    return serializedBoard;
}

io.on('connection', (socket) => {
    // ... all of your io.on('connection', ...) logic is perfectly fine ...
    // No changes are needed inside this block.
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
                hostUsername: users[lobby.hostId]?.username || 'Unknown', // Add nullish coalescing
                playerCount: Object.keys(lobby.players).length,
                status: lobby.status
            }));
        socket.emit('lobby:list', { lobbies: publicLobbies });
        console.log(`Lobby list sent to ${socket.id}`);
    });

    socket.on('lobby:create', (payload, callback) => {
        const user = users[socket.id];
        if (!user) {
            return callback({ success: false, message: "User not identified." });
        }
        if (user.lobbyId) {
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

    // ... rest of your socket event listeners ...
    // lobby:join, lobby:leave, lobby:ready:set, game:move, disconnect
});

server.listen(PORT, () => {
    console.log(`Dama server listening on http://localhost:${PORT}`);
});