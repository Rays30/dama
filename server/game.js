// dama/server/game.js

// This simplified server-side game logic only tracks state and validates turns.
// Full Dama move validation (e.g., can this piece move here, are captures forced)
// is primarily handled client-side to keep server lightweight as per prompt.
// A more robust solution would duplicate full game logic on the server.

/**
 * @typedef {Object} DamaPiece
 * @property {'red'|'blue'} color
 * @property {boolean} isKing
 */

/**
 * @typedef {Object} GameState
 * @property {Array<Array<DamaPiece|null>>} board - 8x8 representation of the board
 * @property {'red'|'blue'} currentTurn
 * @property {Object.<string, {username: string, color: 'red'|'blue', socketId: string}>} players - socketId -> player details
 * @property {'red'|'blue'|null} winner
 * @property {string|null} reason
 * @property {number} redPiecesCount
 * @property {number} bluePiecesCount
 */

/**
 * Represents a simplified Dama game session on the server.
 * Handles turn management and basic move application.
 */
export class GameSession {
    /**
     * @param {string} gameId
     * @param {Object.<string, {username: string, color: 'red'|'blue', socketId: string}>} players - socketId -> player details
     * @param {'red'|'blue'} initialTurn
     */
    constructor(gameId, players, initialTurn) {
        this.gameId = gameId;
        this.players = players; // Map of socketId to { username, color, socketId }
        this.board = this._initializeBoard();
        this.currentTurn = initialTurn;
        this.winner = null;
        this.reason = null;
        this.redPiecesCount = 12;
        this.bluePiecesCount = 12;

        this.playerColors = {}; // { 'red': socketId, 'blue': socketId }
        for (const socketId in players) {
            this.playerColors[players[socketId].color] = socketId;
        }

        console.log(`Game ${this.gameId} started. Red: ${this.playerColors.red}, Blue: ${this.playerColors.blue}. Turn: ${this.currentTurn}`);
    }

    /**
     * Initializes a standard Dama board.
     * @returns {Array<Array<DamaPiece|null>>}
     */
    _initializeBoard() {
        const board = Array(8).fill(null).map(() => Array(8).fill(null));

        const addPieces = (color, startRow, endRow) => {
            for (let r = startRow; r < endRow; r++) {
                for (let c = 0; c < 8; c++) {
                    // Pieces are only on dark squares
                    if ((r + c) % 2 !== 0) { // Dama has pieces on dark squares
                        board[r][c] = { color, isKing: false };
                    }
                }
            }
        };

        addPieces('blue', 0, 3); // Blue pieces at top
        addPieces('red', 5, 8);  // Red pieces at bottom
        return board;
    }

    /**
     * Attempts to apply a move.
     * @param {string} playerSocketId - The socket ID of the player making the move.
     * @param {{from: [number, number], to: [number, number], captures: Array<[number, number]>}} moveData
     * @returns {{success: boolean, message?: string, newState?: GameState}}
     */
    applyMove(playerSocketId, moveData) {
        const player = this.players[playerSocketId];
        if (!player) {
            return { success: false, message: 'Player not found in this game.' };
        }
        if (player.color !== this.currentTurn) {
            return { success: false, message: `It's not ${player.username}'s turn (${player.color}). It's ${this.currentTurn}'s turn.` };
        }

        const { from, to, captures } = moveData;

        // Basic validation:
        // Ensure 'from' and 'to' are valid board coordinates
        if (!this._isValidCoord(from) || !this._isValidCoord(to)) {
            return { success: false, message: 'Invalid move coordinates.' };
        }
        // Ensure there's a piece at 'from' and it belongs to the current player
        const piece = this.board[from[0]][from[1]];
        if (!piece || piece.color !== this.currentTurn) {
            return { success: false, message: 'No valid piece at the starting position for your turn.' };
        }
        // Ensure 'to' square is empty (basic, client-side handles complex moves)
        // This is tricky as client also handles capture logic.
        // For simplicity, server just trusts client's move + captures and applies.
        // A full server-side game logic would re-validate the move here.

        // Apply the move to the server's board state
        this.board[to[0]][to[1]] = piece;
        this.board[from[0]][from[1]] = null;

        // Check for King promotion
        if (!piece.isKing) {
            if (piece.color === 'red' && to[0] === 0) {
                this.board[to[0]][to[1]].isKing = true;
            } else if (piece.color === 'blue' && to[0] === 7) {
                this.board[to[0]][to[1]].isKing = true;
            }
        }

        // Apply captures
        if (captures && captures.length > 0) {
            for (const capCoord of captures) {
                if (this._isValidCoord(capCoord) && this.board[capCoord[0]][capCoord[1]]) {
                    const capturedPiece = this.board[capCoord[0]][capCoord[1]];
                    this.board[capCoord[0]][capCoord[1]] = null;
                    if (capturedPiece.color === 'red') {
                        this.redPiecesCount--;
                    } else {
                        this.bluePiecesCount--;
                    }
                }
            }
        }

        // Check for game end condition (no pieces left)
        if (this.redPiecesCount === 0) {
            this.endGame('no_pieces', 'blue');
        } else if (this.bluePiecesCount === 0) {
            this.endGame('no_pieces', 'red');
        } else {
            // Switch turn
            this.currentTurn = this.currentTurn === 'red' ? 'blue' : 'red';
        }

        return { success: true, newState: this.getCurrentState() };
    }

    _isValidCoord(coord) {
        return Array.isArray(coord) && coord.length === 2 &&
               coord[0] >= 0 && coord[0] < 8 &&
               coord[1] >= 0 && coord[1] < 8;
    }

    /**
     * Ends the current game session.
     * @param {string} reason - Reason for ending (e.g., 'forfeit', 'no_moves', 'disconnected').
     * @param {'red'|'blue'|null} winner - The color of the winning player, or null for a draw/disconnected game.
     */
    endGame(reason, winner) {
        this.winner = winner;
        this.reason = reason;
        console.log(`Game ${this.gameId} ended. Winner: ${winner}, Reason: ${reason}`);
    }

    /**
     * Gets the current public state of the game.
     * @returns {GameState}
     */
    getCurrentState() {
        // Return a simplified board for client: array of strings instead of objects
        const clientBoard = this.board.map(row =>
            row.map(piece => {
                if (!piece) return null;
                return piece.color === 'red' ? (piece.isKing ? 'RK' : 'R') : (piece.isKing ? 'BK' : 'B');
            })
        );

        return {
            gameId: this.gameId,
            board: clientBoard,
            currentTurn: this.currentTurn,
            players: this.players,
            winner: this.winner,
            reason: this.reason,
            redPiecesCount: this.redPiecesCount,
            bluePiecesCount: this.bluePiecesCount,
        };
    }
}
