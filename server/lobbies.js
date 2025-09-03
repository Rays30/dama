// dama/server/lobbies.js

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
 * @property {'public'|'private'} privacy
 * @property {number} createdAt
 * @property {string} region
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
     * @param {import("socket.io").Server} io
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
     * @param {import("socket.io").Server} io
     * @param {import("socket.io").Socket} socket
     * @param {{name: string, privacy: 'public'|'private', password?: string}} payload
     * @param {Function} cb
     */
    handleCreate(io, socket, payload, cb) {
        const username = socket.data.username;
        if (!username) {
            return cb({ success: false, message: 'You must set a username first.' });
        }
        if (this.playerLobbyMap.has(socket.id)) {
            return cb({ success: false, message: "Already in a lobby." });
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
            players: new Map([[socket.id, { socketId: socket.id, username, ready: false, color: 'red' }]]), // Host is always red
            gameSession: null,
            status: 'waiting',
            joinCode,
            createdAt: Date.now(),
        };

        this.lobbies.set(lobbyId, newLobby);
        this.playerLobbyMap.set(socket.id, lobbyId);
        socket.join(lobbyId);

        // FIX: Use newLobby.id instead of undefined newLobbyId
        console.log(`Lobby created: ${newLobby.name} (ID: ${newLobby.id}) by ${username}. Privacy: ${privacy}`);
        if (privacy === 'private') {
            console.log(`  Join Code: ${joinCode}`);
        }

        cb({ success: true, lobbyId: newLobby.id, joinCode: newLobby.joinCode });
        this._emitLobbyUpdate(io, lobbyId);
    }

    /**
     * @param {import("socket.io").Server} io
     * @param {import("socket.io").Socket} socket
     * @param {{lobbyId?: string, code?: string, password?: string}} payload
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
        if (payload.lobbyId) { // Joining via lobbyId (from list click or direct ID input)
            lobby = this.lobbies.get(payload.lobbyId);
            if (!lobby) {
                return cb({ success: false, message: 'Lobby not found.' });
            }

            if (lobby.privacy === 'private') {
                if (lobby.password && lobby.password.length > 0) {
                    if (lobby.password !== this._sanitizeInput(payload.password)) {
                        return cb({ success: false, message: 'Incorrect password for this private lobby.' });
                    }
                } else {
                    console.log(`User ${username} joining private lobby ${lobby.id} without password.`);
                }
            }

        } else if (payload.code) { // Joining via join code (usually for private lobbies)
            const code = this._sanitizeInput(payload.code);
            lobby = Array.from(this.lobbies.values()).find(l => l.joinCode === code);
            if (!lobby) {
                return cb({ success: false, message: 'Private lobby not found with that code.' });
            }
            if (lobby.privacy !== 'private') {
                return cb({ success: false, message: 'This is a public lobby, please join via its ID from the list.' });
            }
            if (lobby.password && lobby.password.length > 0 && lobby.password !== this._sanitizeInput(payload.password)) {
                return cb({ success: false, message: 'Incorrect password for this private lobby.' });
            }
        } else {
            return cb({ success: false, message: 'Invalid join request: must provide lobbyId or code.' });
        }

        if (lobby.players.size >= 2) {
            return cb({ success: false, message: 'Lobby is full.' });
        }
        if (lobby.status !== 'waiting') {
            return cb({ success: false, message: 'Lobby is already in-game.' });
        }

        // Assign player color: the other color not taken by host
        const hostPlayer = lobby.players.get(lobby.hostId);
        const playerColor = hostPlayer.color === 'red' ? 'blue' : 'red';

        lobby.players.set(socket.id, { socketId: socket.id, username, ready: false, color: playerColor });
        this.playerLobbyMap.set(socket.id, lobby.id);
        socket.join(lobby.id);

        console.log(`${username} joined lobby ${lobby.id}`);
        cb({ success: true, lobbyId: lobby.id });
        this._emitLobbyUpdate(io, lobby.id);
    }

    /**
     * @param {import("socket.io").Server} io
     * @param {import("socket.io").Socket} socket
     */
    handleLeave(io, socket) {
        const lobbyId = this.playerLobbyMap.get(socket.id);
        if (!lobbyId) {
            console.log(`User ${socket.data.username || socket.id} tried to leave but was not in a lobby.`);
            return;
        }

        const lobby = this.lobbies.get(lobbyId);
        if (!lobby) {
            console.warn(`Lobby ${lobbyId} for user ${socket.data.username || socket.id} not found, cleaning up map.`);
            this.playerLobbyMap.delete(socket.id);
            return;
        }

        const leftPlayerUsername = socket.data.username || socket.id;

        socket.leave(lobbyId);
        lobby.players.delete(socket.id);
        this.playerLobbyMap.delete(socket.id);

        console.log(`${leftPlayerUsername} left lobby ${lobbyId}`);

        if (lobby.players.size === 0) {
            this.lobbies.delete(lobbyId);
            io.to(lobbyId).emit('lobby:destroyed', { lobbyId, message: `Lobby '${lobby.name}' was closed.` });
            console.log(`Lobby ${lobbyId} destroyed as it's empty.`);
        } else {
            if (lobby.hostId === socket.id) {
                const newHostId = lobby.players.keys().next().value;
                lobby.hostId = newHostId;
                console.log(`New host for lobby ${lobbyId}: ${lobby.players.get(newHostId)?.username}`);
                lobby.players.forEach(p => p.ready = false);
            }

            if (lobby.gameSession && lobby.status === 'in-game') {
                const winningColor = this._getOtherPlayerColor(lobby, socket.id);
                lobby.gameSession.endGame('forfeit', winningColor);
                io.to(lobbyId).emit('game:end', {
                    reason: 'opponent_disconnected',
                    winner: lobby.gameSession.winner
                });
                lobby.status = 'waiting';
                lobby.gameSession = null;
                lobby.players.forEach(p => p.ready = false);
            }
            this._emitLobbyUpdate(io, lobbyId);
        }
        this._emitLobbyList(io);
    }

    /**
     * @param {import("socket.io").Server} io
     * @param {import("socket.io").Socket} socket
     * @param {boolean} ready
     */
    handleReady(io, socket, ready) {
        const lobbyId = this.playerLobbyMap.get(socket.id);
        if (!lobbyId) {
            socket.emit('error', { code: 'NOT_IN_LOBBY', message: 'You are not in a lobby.' });
            return;
        }

        const lobby = this.lobbies.get(lobbyId);
        if (!lobby || lobby.status !== 'waiting') {
            socket.emit('error', { code: 'LOBBY_UNAVAILABLE', message: 'Lobby is not in a waiting state.' });
            return;
        }

        const player = lobby.players.get(socket.id);
        if (player) {
            player.ready = ready;
            this._emitLobbyUpdate(io, lobbyId);

            if (lobby.players.size === 2 && Array.from(lobby.players.values()).every(p => p.ready) && lobby.hostId === socket.id) {
                 io.to(socket.id).emit('message', {type: 'info', text: 'All players ready! Click "Start Game" when ready.'});
            }
        }
    }

    /**
     * Initiates a game session for a lobby.
     * @param {import("socket.io").Server} io
     * @param {Lobby} lobby
     */
    _startGame(io, lobby) {
        if (lobby.gameSession) {
            console.warn(`Lobby ${lobby.id} already has an active game.`);
            return;
        }
        if (lobby.players.size < 2) {
             console.warn(`Lobby ${lobby.id} cannot start game: Not enough players (${lobby.players.size}/2).`);
             return;
        }
        if (!Array.from(lobby.players.values()).every(p => p.ready)) {
            console.warn(`Lobby ${lobby.id} cannot start game: Not all players are ready.`);
            return;
        }

        lobby.status = 'in-game';

        const playerArray = Array.from(lobby.players.values());
        const redPlayer = playerArray.find(p => p.color === 'red');
        const bluePlayer = playerArray.find(p => p.color === 'blue');

        if (!redPlayer || !bluePlayer) {
            console.error(`ERROR: Cannot start game in lobby ${lobby.id}. Missing player colors. Red: ${redPlayer?.username}, Blue: ${bluePlayer?.username}`);
            io.to(lobby.id).emit('error', { code: 'GAME_START_FAILED', message: 'Failed to start game: player colors not assigned.' });
            lobby.status = 'waiting';
            this._emitLobbyUpdate(io, lobby.id);
            return;
        }
        
        const gamePlayers = {
            [redPlayer.socketId]: { username: redPlayer.username, color: 'red', socketId: redPlayer.socketId },
            [bluePlayer.socketId]: { username: bluePlayer.username, color: 'blue', socketId: bluePlayer.socketId },
        };

        const initialTurn = 'red';

        const gameSession = new GameSession(lobby.id, gamePlayers, initialTurn);
        lobby.gameSession = gameSession;

        io.to(lobby.id).emit('game:start', {
            lobbyId: lobby.id,
            players: gamePlayers,
            turn: initialTurn,
            initialBoard: gameSession.getCurrentState().board
        });
        this._emitLobbyUpdate(io, lobby.id);
        console.log(`Game started for lobby ${lobby.id}. Red: ${redPlayer.username} (${redPlayer.socketId}), Blue: ${bluePlayer.username} (${bluePlayer.socketId}).`);
    }

    /**
     * Relays game moves and validates turn.
     * @param {import("socket.io").Server} io
     * @param {import("socket.io").Socket} socket
     * @param {{from: [number, number], to: [number, number], captures: Array<[number, number]>}} move
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
            lobby.gameSession = null;
            lobby.players.forEach(p => p.ready = false);
            this._emitLobbyUpdate(io, lobbyId);
        }
    }

    /**
     * @param {import("socket.io").Server} io
     * @param {import("socket.io").Socket} socket
     * @param {string} lobbyIdToClose
     */
    handleCloseLobby(io, socket, lobbyIdToClose) {
        const lobby = this.lobbies.get(lobbyIdToClose);
        if (!lobby) {
            socket.emit('error', { code: 'LOBBY_NOT_FOUND', message: 'Lobby not found.' });
            console.warn(`Attempt to close non-existent lobby: ${lobbyIdToClose} by ${socket.data.username || socket.id}`);
            return;
        }
        if (lobby.hostId !== socket.id) {
            socket.emit('error', { code: 'NOT_HOST', message: 'Only the host can close this lobby.' });
            console.warn(`User ${socket.data.username || socket.id} (not host) attempted to close lobby ${lobbyIdToClose}.`);
            return;
        }

        console.log(`Lobby ${lobbyIdToClose} (${lobby.name}) closed by host ${socket.data.username}.`);
        
        io.to(lobbyIdToClose).emit('lobby:destroyed', { lobbyId: lobbyIdToClose, message: `Lobby '${lobby.name}' was closed by the host.` });

        lobby.players.forEach((player) => {
            const playerSocket = io.sockets.sockets.get(player.socketId);
            if (playerSocket) {
                playerSocket.leave(lobbyIdToClose);
                this.playerLobbyMap.delete(player.socketId);
            }
        });

        this.lobbies.delete(lobbyIdToClose);
        this._emitLobbyList(io);
    }

    /**
     * @param {import("socket.io").Server} io
     * @param {import("socket.io").Socket} socket
     */
    handleDisconnect(io, socket) {
        this.handleLeave(io, socket);
    }

    /**
     * Host explicitly requests to start the game.
     * @param {import("socket.io").Server} io
     * @param {import("socket.io").Socket} socket
     */
    handleStartGame(io, socket) {
        const lobbyId = this.playerLobbyMap.get(socket.id);
        if (!lobbyId) {
            socket.emit('error', { code: 'NOT_IN_LOBBY', message: 'You are not in a lobby.' });
            return;
        }

        const lobby = this.lobbies.get(lobbyId);
        if (!lobby) {
            socket.emit('error', { code: 'LOBBY_NOT_FOUND', message: 'Lobby not found.' });
            return;
        }
        if (lobby.hostId !== socket.id) {
            socket.emit('error', { code: 'NOT_HOST', message: 'Only the host can start the game.' });
            return;
        }
        if (lobby.players.size < 2) {
            socket.emit('error', { code: 'NOT_ENOUGH_PLAYERS', message: 'Need 2 players to start a game.' });
            return;
        }
        if (!Array.from(lobby.players.values()).every(p => p.ready)) {
            socket.emit('error', { code: 'NOT_ALL_READY', message: 'All players must be ready to start the game.' });
            return;
        }
        if (lobby.status === 'in-game') {
            socket.emit('error', { code: 'GAME_ALREADY_STARTED', message: 'Game already in progress.' });
            return;
        }

        console.log(`Host ${socket.data.username} explicitly started game in lobby ${lobbyId}.`);
        this._startGame(io, lobby); // Now, _startGame is only called by host action
    }

    /**
     * Host kicks a player from the lobby.
     * @param {import("socket.io").Server} io
     * @param {import("socket.io").Socket} hostSocket - The host's socket.
     * @param {{lobbyId: string, playerId: string}} payload - The lobby ID and player's socket ID to kick.
     */
    handleKickPlayer(io, hostSocket, payload) {
        const { lobbyId, playerId } = payload;
        const lobby = this.lobbies.get(lobbyId);

        if (!lobby) {
            hostSocket.emit('error', { code: 'LOBBY_NOT_FOUND', message: 'Lobby not found.' });
            return;
        }
        if (lobby.hostId !== hostSocket.id) {
            hostSocket.emit('error', { code: 'NOT_HOST', message: 'Only the host can kick players.' });
            return;
        }
        if (playerId === hostSocket.id) {
            hostSocket.emit('error', { code: 'CANNOT_KICK_SELF', message: 'You cannot kick yourself.' });
            return;
        }

        const playerToKick = lobby.players.get(playerId);
        if (!playerToKick) {
            hostSocket.emit('error', { code: 'PLAYER_NOT_FOUND', message: 'Player to kick not found in this lobby.' });
            return;
        }

        const playerSocketToKick = io.sockets.sockets.get(playerId);
        if (playerSocketToKick) {
            this.handleLeave(io, playerSocketToKick); // Use handleLeave for full cleanup
            playerSocketToKick.emit('message', { type: 'info', text: `You have been kicked from the lobby '${lobby.name}'.` });
            console.log(`Player ${playerToKick.username} (${playerId}) kicked from lobby ${lobby.id} by host ${hostSocket.data.username}.`);
            hostSocket.emit('message', { type: 'success', text: `Player ${playerToKick.username} kicked.` });
        } else {
            console.warn(`Attempted to kick player ${playerToKick.username} (${playerId}) but their socket was not found. Performing cleanup.`);
            this.handleLeave(io, { id: playerId, data: { username: playerToKick.username } }); // Simulate leave for cleanup
            hostSocket.emit('message', { type: 'info', text: `Player ${playerToKick.username} was already disconnected and removed.` });
        }
    }


    publicSummaries() {
        return Array.from(this.lobbies.values())
            .map(lobby => ({
                id: lobby.id,
                name: lobby.name,
                hostUsername: lobby.players.get(lobby.hostId)?.username || 'Unknown',
                playerCount: lobby.players.size,
                status: lobby.status,
                privacy: lobby.privacy,
                createdAt: lobby.createdAt,
                region: 'LAN'
            }));
    }

    _getOtherPlayerColor(lobby, disconnectedSocketId) {
        const otherPlayer = Array.from(lobby.players.values()).find(p => p.socketId !== disconnectedSocketId);
        return otherPlayer ? otherPlayer.color : null;
    }
}