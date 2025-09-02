import { generateId } from './utils/id.js';
import { GameSession } from './game.js';

const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 20;
const MIN_LOBBY_NAME_LENGTH = 3;
const MAX_LOBBY_NAME_LENGTH = 30;

/**
 * @typedef {Object} PublicLobbySummary
 * @property {string} id
 * @property {string} name
 * @property {string} hostUsername
 * @property {number} playerCount
 * @property {'waiting'|'in-game'} status
 * @property {number} createdAt
 * @property {string} region // Always 'LAN' for this implementation
 */

/**
 * @typedef {Object} LobbyPlayer
 * @property {string} socketId
 * @property {string} username
 * @property {boolean} ready
 * @property {'red'|'blue'|null} [color]
 */

/**
 * @typedef {Object} Lobby
 * @property {string} id
 * @property {string} name
 * @property {'public'|'private'} privacy
 * @property {string} [password]
 * @property {string} hostId
 * @property {Map<string, LobbyPlayer>} players // socketId -> LobbyPlayer
 * @property {GameSession|null} gameSession // Reference to the active game
 * @property {'waiting'|'in-game'} status
 * @property {string} [joinCode] // For private lobbies
 * @property {number} createdAt
 */


export class Lobbies {
    constructor() {
        /** @type {Map<string, Lobby>} */
        this.lobbies = new Map(); // lobbyId -> Lobby
        /** @type {Map<string, string>} */
        this.playerLobbyMap = new Map(); // socketId -> lobbyId
        console.log('Lobby manager initialized.');
    }

    _sanitizeInput(input) {
        return typeof input === 'string' ? input.slice(0, 100).replace(/</g, "&lt;").replace(/>/g, "&gt;").trim() : '';
    }

    _emitLobbyList(io) {
        io.emit('lobby:list', { lobbies: this.publicSummaries() });
    }

    /**
     * Helper to emit updates to all players in a specific lobby.
     * @param {SocketIO.Server} io
     * @param {string} lobbyId
     */
    _emitLobbyUpdate(io, lobbyId) {
        const lobby = this.lobbies.get(lobbyId);
        if (lobby) {
            const playerDetails = {};
            lobby.players.forEach(p => playerDetails[p.socketId] = { username: p.username, ready: p.ready, color: p.color, socketId: p.socketId });

            const summary = {
                id: lobby.id,
                name: lobby.name,
                hostId: lobby.hostId,
                hostUsername: lobby.players.get(lobby.hostId)?.username || 'Unknown',
                privacy: lobby.privacy,
                playerCount: lobby.players.size,
                status: lobby.status,
                joinCode: lobby.privacy === 'private' ? lobby.joinCode : undefined,
                players: playerDetails // Send full player details to lobby members
            };
            io.to(lobbyId).emit('lobby:updated', { lobby: summary });
            this._emitLobbyList(io); // Update public list for non-members too
        }
    }

    /**
     * @param {SocketIO.Server} io
     * @param {SocketIO.Socket} socket
     * @param {import('./lobbies').LobbyCreatePayload} payload
     * @param {Function} cb
     */
    handleCreate(io, socket, payload, cb) {
        const username = socket.data.username;
        if (!username) {
            return cb({ success: false, message: 'You must set a username first.' });
        }
        if (this.playerLobbyMap.has(socket.id)) {
            return cb({ success: false, message: 'You are already in a lobby.' });
        }

        const name = this._sanitizeInput(payload.name);
        const privacy = payload.privacy === 'private' ? 'private' : 'public';
        const password = privacy === 'private' ? this._sanitizeInput(payload.password) : undefined;

        if (name.length < MIN_LOBBY_NAME_LENGTH || name.length > MAX_LOBBY_NAME_LENGTH) {
            return cb({ success: false, message: `Lobby name must be between ${MIN_LOBBY_NAME_LENGTH} and ${MAX_LOBBY_NAME_LENGTH} characters.` });
        }

        const lobbyId = generateId(6);
        const joinCode = privacy === 'private' ? generateId(6).toUpperCase() : undefined;

        /** @type {Lobby} */
        const newLobby = {
            id: lobbyId,
            name,
            privacy,
            password: password && password.length > 0 ? password : undefined,
            hostId: socket.id,
            players: new Map([[socket.id, { socketId: socket.id, username, ready: false, color: null }]]),
            gameSession: null,
            status: 'waiting',
            joinCode,
            createdAt: Date.now(),
        };

        this.lobbies.set(lobbyId, newLobby);
        this.playerLobbyMap.set(socket.id, lobbyId);
        socket.join(lobbyId);

        console.log(`Lobby created: ${lobbyId} by ${username}. Privacy: ${privacy}`);
        if (privacy === 'private') {
            console.log(`  Join Code: ${joinCode}`);
        }

        cb({ success: true, lobbyId, joinCode });
        this._emitLobbyUpdate(io, lobbyId);
    }

    /**
     * @param {SocketIO.Server} io
     * @param {SocketIO.Socket} socket
     * @param {import('./lobbies').LobbyJoinPayload} payload
     * @param {Function} cb
     */
    handleJoin(io, socket, payload, cb) {
        const username = socket.data.username;
        if (!username) {
            return cb({ success: false, message: 'You must set a username first.' });
        }
        if (this.playerLobbyMap.has(socket.id)) {
            return cb({ success: false, message: 'You are already in a lobby.' });
        }

        let lobby = null;
        if (payload.lobbyId) { // Public lobby via ID
            lobby = this.lobbies.get(payload.lobbyId);
            if (!lobby) {
                return cb({ success: false, message: 'Lobby not found.' });
            }
            if (lobby.privacy === 'private') {
                return cb({ success: false, message: 'This is a private lobby, please use a code.' });
            }
        } else if (payload.code) { // Private lobby via code
            const code = this._sanitizeInput(payload.code);
            lobby = Array.from(this.lobbies.values()).find(l => l.joinCode === code);
            if (!lobby) {
                return cb({ success: false, message: 'Private lobby not found with that code.' });
            }
            if (lobby.password && lobby.password !== this._sanitizeInput(payload.password)) {
                return cb({ success: false, message: 'Incorrect password for this private lobby.' });
            }
        } else {
            return cb({ success: false, message: 'Invalid join request.' });
        }

        if (lobby.players.size >= 2) {
            return cb({ success: false, message: 'Lobby is full.' });
        }
        if (lobby.status !== 'waiting') {
            return cb({ success: false, message: 'Lobby is already in-game.' });
        }

        lobby.players.set(socket.id, { socketId: socket.id, username, ready: false, color: null });
        this.playerLobbyMap.set(socket.id, lobby.id);
        socket.join(lobby.id);

        console.log(`${username} joined lobby ${lobby.id}`);
        cb({ success: true, lobbyId: lobby.id });
        this._emitLobbyUpdate(io, lobby.id);
    }

    /**
     * @param {SocketIO.Server} io
     * @param {SocketIO.Socket} socket
     */
    handleLeave(io, socket) {
        const lobbyId = this.playerLobbyMap.get(socket.id);
        if (!lobbyId) {
            return; // Not in a lobby
        }

        const lobby = this.lobbies.get(lobbyId);
        if (!lobby) {
            this.playerLobbyMap.delete(socket.id);
            return; // Lobby somehow disappeared
        }

        socket.leave(lobbyId);
        lobby.players.delete(socket.id);
        this.playerLobbyMap.delete(socket.id);

        console.log(`${socket.data.username} left lobby ${lobbyId}`);

        if (lobby.players.size === 0) {
            // Lobby empty, destroy it
            this.lobbies.delete(lobbyId);
            io.emit('lobby:destroyed', { lobbyId, message: `Lobby '${lobby.name}' was closed.` });
            console.log(`Lobby ${lobbyId} destroyed as it's empty.`);
        } else {
            // If host left, assign new host (first player in map)
            if (lobby.hostId === socket.id) {
                const newHostId = lobby.players.keys().next().value;
                lobby.hostId = newHostId;
                console.log(`New host for lobby ${lobbyId}: ${lobby.players.get(newHostId)?.username}`);
                // Unready all players if game was about to start, new host needs to re-evaluate
                lobby.players.forEach(p => p.ready = false);
            }

            // If a game was in progress, end it
            if (lobby.gameSession && lobby.status === 'in-game') {
                lobby.gameSession.endGame('forfeit', this._getOtherPlayerColor(lobby, socket.id));
                io.to(lobbyId).emit('game:end', {
                    reason: 'opponent_disconnected',
                    winner: lobby.gameSession.winner
                });
                lobby.status = 'waiting';
                lobby.gameSession = null;
                // Re-enable players to join/start new game in this lobby
                lobby.players.forEach(p => p.ready = false);
            }
            this._emitLobbyUpdate(io, lobbyId);
        }
        this._emitLobbyList(io);
    }

    /**
     * @param {SocketIO.Server} io
     * @param {SocketIO.Socket} socket
     * @param {boolean} ready
     */
    handleReady(io, socket, ready) {
        const lobbyId = this.playerLobbyMap.get(socket.id);
        if (!lobbyId) return;

        const lobby = this.lobbies.get(lobbyId);
        if (!lobby || lobby.status !== 'waiting') return;

        const player = lobby.players.get(socket.id);
        if (player) {
            player.ready = ready;
            this._emitLobbyUpdate(io, lobbyId);

            // Check if all players are ready and game can start
            if (lobby.players.size === 2 && Array.from(lobby.players.values()).every(p => p.ready)) {
                this._startGame(io, lobby);
            }
        }
    }

    /**
     * Initiates a game session for a lobby.
     * @param {SocketIO.Server} io
     * @param {Lobby} lobby
     */
    _startGame(io, lobby) {
        if (lobby.gameSession) {
            console.warn(`Lobby ${lobby.id} already has an active game.`);
            return;
        }

        lobby.status = 'in-game';

        // Assign colors deterministically (e.g., host is red, or random)
        const playerArray = Array.from(lobby.players.values());
        const redPlayer = playerArray[0]; // First player (often host)
        const bluePlayer = playerArray[1];

        redPlayer.color = 'red';
        bluePlayer.color = 'blue';

        // Update lobby players map with colors
        lobby.players.set(redPlayer.socketId, redPlayer);
        lobby.players.set(bluePlayer.socketId, bluePlayer);

        const gamePlayers = {
            [redPlayer.socketId]: { username: redPlayer.username, color: 'red', socketId: redPlayer.socketId },
            [bluePlayer.socketId]: { username: bluePlayer.username, color: 'blue', socketId: bluePlayer.socketId },
        };

        const initialTurn = 'red'; // Red always starts in Dama

        const gameSession = new GameSession(lobby.id, gamePlayers, initialTurn);
        lobby.gameSession = gameSession;

        io.to(lobby.id).emit('game:start', {
            lobbyId: lobby.id,
            players: gamePlayers,
            turn: initialTurn,
            initialBoard: gameSession.getCurrentState().board // Send initial board state
        });
        this._emitLobbyUpdate(io, lobby.id); // Update lobby status to in-game
        console.log(`Game started for lobby ${lobby.id}. Red: ${redPlayer.username}, Blue: ${bluePlayer.username}`);
    }


    /**
     * Relays game moves and validates turn.
     * @param {SocketIO.Server} io
     * @param {SocketIO.Socket} socket
     * @param {import('./lobbies').GameMovePayload} move
     */
    handleMove(io, socket, move) {
        const lobbyId = this.playerLobbyMap.get(socket.id);
        if (!lobbyId) {
            return socket.emit('error', { code: 'NOT_IN_GAME', message: 'You are not in an active game.' });
        }
        const lobby = this.lobbies.get(lobbyId);
        if (!lobby || !lobby.gameSession || lobby.status !== 'in-game') {
            return socket.emit('error', { code: 'GAME_NOT_ACTIVE', message: 'The game is not active.' });
        }

        const result = lobby.gameSession.applyMove(socket.id, move);

        if (!result.success) {
            return socket.emit('error', { code: 'INVALID_MOVE', message: result.message });
        }

        // Emit updated game state to both players in the lobby
        io.to(lobbyId).emit('game:move', {
            lobbyId: lobbyId,
            board: result.newState.board,
            currentTurn: result.newState.currentTurn,
            redPiecesCount: result.newState.redPiecesCount,
            bluePiecesCount: result.newState.bluePiecesCount
        });

        if (lobby.gameSession.winner) {
            io.to(lobbyId).emit('game:end', {
                reason: lobby.gameSession.reason,
                winner: lobby.gameSession.winner
            });
            lobby.status = 'waiting';
            lobby.gameSession = null; // Clear game session
            // Reset ready states for next potential game
            lobby.players.forEach(p => p.ready = false);
            this._emitLobbyUpdate(io, lobbyId);
        }
    }

    /**
     * @param {SocketIO.Server} io
     * @param {SocketIO.Socket} socket
     */
    handleDisconnect(io, socket) {
        this.handleLeave(io, socket); // Disconnect is treated as a forced leave
    }

    /**
     * Returns a list of public lobbies.
     * @returns {Array<PublicLobbySummary>}
     */
    publicSummaries() {
        return Array.from(this.lobbies.values())
            .filter(lobby => lobby.privacy === 'public')
            .map(lobby => ({
                id: lobby.id,
                name: lobby.name,
                hostUsername: lobby.players.get(lobby.hostId)?.username || 'Unknown',
                playerCount: lobby.players.size,
                status: lobby.status,
                createdAt: lobby.createdAt,
                region: 'LAN'
            }));
    }

    _getOtherPlayerColor(lobby, disconnectedSocketId) {
        const player = lobby.players.get(disconnectedSocketId);
        if (!player || !player.color) return null;
        return player.color === 'red' ? 'blue' : 'red';
    }
}