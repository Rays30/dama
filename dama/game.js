import { BOARD_SIZE, PLAYER_RED, PLAYER_BLUE, AI_DIFFICULTY, getOpponent, animateMove, getEffectivePlayerDirection, getEffectivePromotionRow, deepCopyBoard } from './utils.js';
import { initializeAI } from './ai.js'; // Import the AI factory function

// DamaGame Class
export class DamaGame {
    constructor(boardContainerId, config) {
        this.dom = {
            boardContainer: document.getElementById(boardContainerId),
        };
        if (!this.dom.boardContainer) {
            console.error(`DamaGame: Board container with ID '${boardContainerId}' not found.`);
            return;
        }

        // Configuration callbacks from main.js for UI updates
        this.config = config; // { mode, playerColor, aiDifficulty, socket, lobbyId, onTurnChange, onGameEnd, onMessage, onUndoVisibility }

        // Game State (formerly global 'gameState' object, now instance property)
        this.state = {
            board: [], // 2D array of Piece objects or null
            pieces: [], // Flat array of all Piece objects (references to actual Piece objects)
            currentPlayer: null,
            selectedPiece: null,
            possibleMoves: [], // Array of move objects for highlight
            mandatoryCaptures: [], // Array of capture sequences (each seq is [{from, to, captured}, ...])
            gameMode: null, // 'local', 'ai', 'online'
            aiDifficulty: null,
            winner: null,
            ai: null, // AI instance
            humanPlayerColor: null, // User's chosen color (or assigned in online)
            aiPlayerColor: null,    // AI's color (for single player)
            onlineGameSocket: null, // Socket.IO instance for online games
            onlineLobbyId: null,    // Lobby ID for online games
            isMyTurn: false,        // For online game, tracks if it's client's turn
            moveHistory: [], // Stores { boardState, currentPlayer, piecesData, selectedPieceData, mandatoryCaptures, winner } for undo
            pieceCounter: 0 // Unique ID for pieces for the client-side
        };

        this._initEventListeners(); // Setup event listeners for the board (square clicks)
        this.resetGame(config); // Initial setup of the game
    }

    // --- Inner Piece Class (Now part of DamaGame's scope) ---
    // This allows Piece objects to reference the DamaGame instance's methods (like handlePieceClick)
    Piece = class {
        constructor(id, player, row, col) {
            this.id = id;
            this.player = player; // 'red' or 'blue'
            this.row = row;
            this.col = col;
            this.isKing = false;
            this.element = null; // Reference to the DOM element
        }

        // Creates and appends the piece's DOM element
        render(boardContainer, handlePieceClickMethod) {
            const pieceEl = document.createElement('div');
            pieceEl.classList.add('piece', this.player);
            pieceEl.dataset.id = this.id;
            pieceEl.dataset.row = this.row;
            pieceEl.dataset.col = this.col;
            
            this.element = pieceEl;
            boardContainer.appendChild(pieceEl);

            // Attach listener, ensuring it calls the DamaGame's method with 'this' context
            // Bind handlePieceClickMethod to the DamaGame instance's 'this'
            pieceEl.addEventListener('click', (e) => handlePieceClickMethod(e, this));
            this.updatePosition(); // Set initial transform based on current row/col
        }

        // Updates piece's DOM element position after JS state change
        updatePosition() {
            if (this.element) {
                const squareSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--square-size'));
                this.element.style.transform = `translate(${this.col * squareSize}px, ${this.row * squareSize}px)`;
                this.element.dataset.row = this.row;
                this.element.dataset.col = this.col;
            }
        }

        // Promotes piece to King
        promoteToKing() {
            this.isKing = true;
            if (this.element) {
                this.element.classList.add('king');
                this.element.animate(
                    [{ transform: 'scale(1.2) rotate(0deg)' }, { transform: 'scale(1) rotate(360deg)' }],
                    { duration: 500, easing: 'ease-out' }
                );
            }
        }
    }

    // --- Game Initialization & Reset ---
    _initEventListeners() {
        this.dom.boardContainer.addEventListener('click', (e) => {
            // Only proceed if it's a square click and not a piece click (which is handled separately by Piece's listener)
            if (e.target.classList.contains('square')) {
                const row = parseInt(e.target.dataset.row);
                const col = parseInt(e.target.dataset.col);
                this.handleSquareClick(e, row, col);
            }
        });
    }

    // Public method to reset the game, called by main.js
    resetGame(config) {
        // Update game configuration
        this.config = config;

        // Reset game state to defaults
        this.state.board = [];
        this.state.pieces = [];
        this.state.selectedPiece = null;
        this.state.possibleMoves = [];
        this.state.mandatoryCaptures = [];
        this.state.winner = null;
        this.state.moveHistory = [];
        this.state.pieceCounter = 0; // Reset unique ID counter for new pieces

        // Apply mode-specific configurations
        this.state.gameMode = config.mode;
        this.state.aiDifficulty = config.aiDifficulty;
        this.state.humanPlayerColor = config.playerColor; // For AI or assigned in online
        this.state.onlineGameSocket = config.socket;
        this.state.onlineLobbyId = config.lobbyId;

        // Determine AI's color if in AI mode
        if (config.mode === 'ai') {
            this.state.aiPlayerColor = getOpponent(this.state.humanPlayerColor);
            this.state.ai = initializeAI(config.aiDifficulty, this.state.humanPlayerColor); // Initialize YOUR AI
            this.config.onUndoVisibility(true); // Show undo button
        } else {
            this.state.aiPlayerColor = null;
            this.state.ai = null;
            this.config.onUndoVisibility(false); // Hide undo button
        }

        this.state.isOnlineGame = (config.mode === 'online');

        // Set initial turn and board based on mode
        if (this.state.isOnlineGame && config.initialBoard && config.initialTurn) {
            // Online game: Server dictates board and turn
            this._loadBoardFromSerialized(config.initialBoard);
            this.state.currentPlayer = config.initialTurn;
            this.state.isMyTurn = (this.state.currentPlayer === this.state.humanPlayerColor);
        } else {
            // Local or AI game: Initialize standard board
            this._initializeStandardBoard();
            this.state.currentPlayer = PLAYER_RED; // Red always starts for local/AI
            this.state.isMyTurn = (this.state.gameMode !== 'online' || this.state.currentPlayer === this.state.humanPlayerColor); // Simplified for local/AI
        }
        
        this._renderBoard(); // Render the board with pieces
        this.updateTurnIndicator();
        this.config.onMessage(''); // Clear messages
        this.saveMoveHistory(); // Save initial state

        // Check for immediate AI move if AI is the starting player
        if (this.state.gameMode === 'ai' && this.state.currentPlayer === this.state.aiPlayerColor) {
            setTimeout(() => this.makeAIMove(), 700);
        }
    }

    // Helper to load board from server's serialized format
    _loadBoardFromSerialized(serializedBoard) {
        this.dom.boardContainer.innerHTML = ''; // Clear DOM

        // Re-initialize board state
        this.state.board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
        this.state.pieces = [];
        this.state.pieceCounter = 0; // Reset piece counter, assign new IDs to be unique

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const serializedPiece = serializedBoard[r][c];
                if (serializedPiece) {
                    const player = serializedPiece.startsWith('R') ? PLAYER_RED : PLAYER_BLUE;
                    const isKing = serializedPiece.includes('K');
                    
                    // Re-create Piece object with new client-side ID
                    const piece = new this.Piece(this.state.pieceCounter++, player, r, c);
                    piece.isKing = isKing;
                    this.state.pieces.push(piece);
                    this.state.board[r][c] = piece;
                    piece.render(this.dom.boardContainer, this.handlePieceClick.bind(this)); // Render with current DamaGame instance's click handler
                }
            }
        }
    }

    // Helper to initialize a standard Dama board for local/AI games
    _initializeStandardBoard() {
        this.dom.boardContainer.innerHTML = ''; // Clear DOM

        // Re-initialize board state
        this.state.board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
        this.state.pieces = [];
        this.state.pieceCounter = 0;

        // Setup board squares
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const squareEl = document.createElement('div');
                squareEl.classList.add('square');
                squareEl.classList.add((r + c) % 2 === 0 ? 'light' : 'dark');
                squareEl.dataset.row = r;
                squareEl.dataset.col = c;
                // Square click handler is already attached in _initEventListeners
                this.dom.boardContainer.appendChild(squareEl);
            }
        }

        // Place pieces dynamically based on configured colors (human at bottom, AI/opponent at top)
        const topPlayerColor = this.state.humanPlayerColor === PLAYER_RED ? PLAYER_BLUE : PLAYER_RED; // Default to Red at top, Blue at bottom if humanColor not set (local)
        const bottomPlayerColor = this.state.humanPlayerColor || PLAYER_BLUE; // Default human player to Blue if not set

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if ((r + c) % 2 !== 0) { // Pieces only on dark squares
                    if (r < 3) { // Top 3 rows for topPlayerColor
                        const piece = new this.Piece(this.state.pieceCounter++, topPlayerColor, r, c);
                        this.state.pieces.push(piece);
                        this.state.board[r][c] = piece;
                        piece.render(this.dom.boardContainer, this.handlePieceClick.bind(this));
                    } else if (r >= BOARD_SIZE - 3) { // Bottom 3 rows for bottomPlayerColor
                        const piece = new this.Piece(this.state.pieceCounter++, bottomPlayerColor, r, c);
                        this.state.pieces.push(piece);
                        this.state.board[r][c] = piece;
                        piece.render(this.dom.boardContainer, this.handlePieceClick.bind(this));
                    }
                }
            }
        }
    }

    // Renders pieces on the board after a non-animated move or state restoration
    _renderBoard() {
        // Clear all existing pieces from the DOM
        this.dom.boardContainer.querySelectorAll('.piece').forEach(p => p.remove());

        // Re-render pieces based on current state.pieces
        this.state.pieces.forEach(piece => {
            piece.render(this.dom.boardContainer, this.handlePieceClick.bind(this));
            if (piece.isKing) {
                piece.element.classList.add('king'); // Ensure king class is applied visually
            }
            piece.updatePosition(); // Set initial transform
        });
        this.clearHighlights();
        this.updateTurnIndicator();
    }


    // --- Game Logic ---

    handlePieceClick(event, piece) {
        if (this.state.winner) return; // Game over, no more moves
        // Prevent interaction during AI turn or if not my turn in online mode
        if (this.state.gameMode === 'ai' && this.state.currentPlayer === this.state.aiPlayerColor) {
            this.config.onMessage("It's the AI's turn! Please wait.");
            return;
        }
        if (this.state.isOnlineGame && !this.state.isMyTurn) {
            this.config.onMessage("It's not your turn!", 'red');
            return;
        }
        if (this.state.currentPlayer !== piece.player) {
            this.config.onMessage(`It's ${this.state.currentPlayer.toUpperCase()}'s turn. Not your piece.`);
            return;
        }

        if (this.state.selectedPiece === piece) {
            // Deselect the piece
            this.deselectPiece();
        } else {
            // Select new piece
            this.selectPiece(piece);
        }
    }

    handleSquareClick(event, row, col) {
        if (this.state.winner) return; // Game over, no more moves
        // Prevent interaction during AI turn or if not my turn in online mode
        if (this.state.gameMode === 'ai' && this.state.currentPlayer === this.state.aiPlayerColor) {
            this.config.onMessage("It's the AI's turn! Please wait.");
            return;
        }
        if (this.state.isOnlineGame && !this.state.isMyTurn) {
            this.config.onMessage("It's not your turn!", 'red');
            return;
        }
        if (!this.state.selectedPiece) {
            this.config.onMessage('Select a piece to move.');
            return;
        }

        const targetMove = this.state.possibleMoves.find(
            move => move.to.row === row && move.to.col === col
        );

        if (targetMove) {
            this.executeMove(this.state.selectedPiece, targetMove);
        } else {
            this.config.onMessage('Invalid move. Please select a highlighted square or deselect your piece.');
        }
    }

    selectPiece(piece) {
        this.deselectPiece(); // Clear any previous selection

        this.state.selectedPiece = piece;
        piece.element.classList.add('selected');

        // Find all valid moves for this piece
        const moves = this._getValidMovesForPiece(piece);
        
        // Find all mandatory captures for the current player on the CURRENT BOARD STATE
        this.state.mandatoryCaptures = this._findAllMandatoryCaptures(this.state.currentPlayer);

        if (this.state.mandatoryCaptures.length > 0) {
            const pieceMandatoryCaptures = this.state.mandatoryCaptures.filter(
                chain => chain.piece.id === piece.id
            );
            if (pieceMandatoryCaptures.length > 0) {
                this.state.possibleMoves = pieceMandatoryCaptures;
                this.config.onMessage(`Mandatory capture!`);
            } else {
                // This piece *cannot* make a mandatory capture, but *some* other piece can. Deselect.
                this.deselectPiece();
                this.config.onMessage(`You must take a capture. Select a piece that can capture.`);
                return;
            }
        } else {
            this.state.possibleMoves = moves;
            this.config.onMessage(''); // Clear "Mandatory capture!" message if no captures needed
        }
        
        this._highlightMoves(this.state.possibleMoves);
    }

    // Corrected deselectPiece method
    deselectPiece() {
        if (this.state.selectedPiece) {
            this.state.selectedPiece.element.classList.remove('selected');
            this.state.selectedPiece = null;
        }
        this.clearHighlights();
        // Only clear the message if there are no pending mandatory captures for the current player
        // (as a new mandatory capture message would be set by selectPiece)
        if (this.state.mandatoryCaptures.length === 0) {
             this.config.onMessage('');
        }
    }


    // Function to get all valid moves (regular or capture) for a single piece
    // This function should always work on the *current* `this.state.board`
    _getValidMovesForPiece(piece) {
        const moves = [];
        const isKing = piece.isKing;
        const pieceLogicalDirection = getEffectivePlayerDirection(piece.player, this.state.humanPlayerColor);

        const regularMoveRowDirections = [pieceLogicalDirection];
        const allRowDirections = [-1, 1];
        const colDirections = [-1, 1];

        // 1. Check for Regular Moves (non-capturing)
        if (!isKing) {
            for (const dr of regularMoveRowDirections) {
                for (const dc of colDirections) {
                    const newRow = piece.row + dr;
                    const newCol = piece.col + dc;

                    if (this._isValidPosition(newRow, newCol) && !this.state.board[newRow][newCol]) {
                        moves.push({
                            piece: { ...piece }, // Shallow copy piece info
                            path: [{ from: { row: piece.row, col: piece.col }, to: { row: newRow, col: newCol } }],
                            to: { row: newRow, col: newCol },
                            capturedPieces: [],
                            isKingPromotion: this._checkKingPromotion(piece.player, newRow)
                        });
                    }
                }
            }
        } else { // King piece - can move multiple squares (any diagonal)
            for (const dr of allRowDirections) {
                for (const dc of colDirections) {
                    for (let i = 1; i < BOARD_SIZE; i++) {
                        const kingRow = piece.row + i * dr;
                        const kingCol = piece.col + i * dc;
                        if (this._isValidPosition(kingRow, kingCol) && !this.state.board[kingRow][kingCol]) {
                            moves.push({
                                piece: { ...piece },
                                path: [{ from: { row: piece.row, col: piece.col }, to: { row: kingRow, col: kingCol } }],
                                to: { row: kingRow, col: kingCol },
                                capturedPieces: [],
                                isKingPromotion: false
                            });
                        } else {
                            break;
                        }
                    }
                }
            }
        }

        // 2. Check for Captures
        for (const dr of allRowDirections) {
            for (const dc of colDirections) {
                // Standard single-jump capture
                const capturedRow = piece.row + dr;
                const capturedCol = piece.col + dc;
                const targetRow = piece.row + 2 * dr;
                const targetCol = piece.col + 2 * dc;

                if (this._isValidPosition(targetRow, targetCol) &&
                    this._isValidPosition(capturedRow, capturedCol)) {

                    const capturedPiece = this.state.board[capturedRow][capturedCol];
                    const targetSquare = this.state.board[targetRow][targetCol];

                    if (capturedPiece && capturedPiece.player !== piece.player && !targetSquare) {
                        moves.push({
                            piece: { ...piece },
                            path: [{ from: { row: piece.row, col: piece.col }, to: { row: targetRow, col: targetCol }, captured: { row: capturedRow, col: capturedCol } }],
                            to: { row: targetRow, col: targetCol },
                            capturedPieces: [{ ...capturedPiece }], // Shallow copy captured piece for tracking
                            isKingPromotion: this._checkKingPromotion(piece.player, targetRow)
                        });
                    }
                }
                
                // King flying capture logic
                if (isKing) {
                    for (let i = 1; i < BOARD_SIZE; i++) {
                        const checkRow = piece.row + i * dr;
                        const checkCol = piece.col + i * dc;

                        if (!this._isValidPosition(checkRow, checkCol)) break;

                        const currentPiece = this.state.board[checkRow][checkCol];

                        if (currentPiece && currentPiece.player !== piece.player) {
                            for (let j = i + 1; j < BOARD_SIZE; j++) {
                                const landRow = piece.row + j * dr;
                                const landCol = piece.col + j * dc;

                                if (!this._isValidPosition(landRow, landCol)) break;

                                if (!this.state.board[landRow][landCol]) {
                                    moves.push({
                                        piece: { ...piece },
                                        path: [{ from: { row: piece.row, col: piece.col }, to: { row: landRow, col: landCol }, captured: { row: checkRow, col: checkCol } }],
                                        to: { row: landRow, col: landCol },
                                        capturedPieces: [{ ...currentPiece }],
                                        isKingPromotion: false
                                    });
                                } else {
                                    break;
                                }
                            }
                            break; // Found first opponent piece, break from this 'i' loop
                        } else if (currentPiece) {
                            break;
                        }
                    }
                }
            }
        }
        return moves;
    }

    /**
     * Determines all possible valid moves for a given player based on current board state,
     * adhering to the mandatory capture rule (if captures exist, only the longest ones are returned).
     * If no captures are available, all regular moves are returned.
     * This always works on the *actual* game board (`this.state.board`).
     * @param {string} player - The player whose moves are to be calculated.
     * @returns {Array} An array of move objects.
     */
    _getAllPlayerMoves(player) {
        let allCaptures = [];
        let allRegularMoves = [];

        for (const piece of this.state.pieces) {
            if (piece.player === player) {
                // Explore full capture chains for this piece first
                // IMPORTANT: Pass a deep copy of the board to _getPieceCaptureChains
                // so it doesn't modify the actual game state during its recursive search.
                const chains = this._getPieceCaptureChains(deepCopyBoard(this.state.board), piece, [], [], this.state.humanPlayerColor);
                if (chains.length > 0) {
                    allCaptures.push(...chains);
                }
                // Also get regular (non-capturing) moves for this piece
                // This works on the actual board as it's not recursive
                const pieceMoves = this._getValidMovesForPiece(piece);
                const regularMovesForPiece = pieceMoves.filter(m => m.capturedPieces.length === 0);
                allRegularMoves.push(...regularMovesForPiece);
            }
        }

        if (allCaptures.length > 0) {
            // If any captures are available, find the maximum number of pieces captured in any chain
            const maxCaptures = Math.max(...allCaptures.map(chain => chain.capturedPieces.length));
            // Only return those chains that achieve the maximum number of captures (mandatory longest capture)
            return allCaptures.filter(chain => chain.capturedPieces.length === maxCaptures);
        }
        // If no captures are available at all, return all regular moves
        return allRegularMoves;
    }

    // Function to find all mandatory capture chains for a player
    // This is the initial entry point for finding mandatory captures on the *actual* board
    _findAllMandatoryCaptures(player) {
        // IMPORTANT: Use _getAllPlayerMoves, as it handles the deep copy for recursion
        // and ensures the longest chain logic.
        return this._getAllPlayerMoves(player).filter(move => move.capturedPieces.length > 0);
    }


    /**
     * Recursive helper to find all possible capture chains for a piece on a **simulated board**.
     * This function is crucial and was refactored to take `currentBoard` as a parameter.
     * @param {Array<Array<object|null>>} currentBoard - The board state for this specific simulation branch.
     * @param {object} piece - The piece object (could be a simulated copy) at its current position in the chain.
     * @param {Array<object>} currentPath - The sequence of steps leading to `piece`'s current position.
     * @param {Array<object>} capturedPieces - IDs of pieces captured so far in this chain.
     * @param {string} humanPlayerColor - The human player's chosen color for direction logic.
     * @returns {Array<object>} An array of complete capture chains.
     */
    _getPieceCaptureChains(currentBoard, piece, currentPath, capturedPieces, humanPlayerColor) {
        const chains = [];
        const isKing = piece.isKing;
        
        let foundCaptureInThisStep = false;
        
        const rowDirectionsForCaptures = [-1, 1];
        const colDirections = [-1, 1];

        for (const dr of rowDirectionsForCaptures) {
            for (const dc of colDirections) {
                // Standard jump capture check
                const capturedRow = piece.row + dr;
                const capturedCol = piece.col + dc;
                const targetRow = piece.row + 2 * dr;
                const targetCol = piece.col + 2 * dc;

                if (this._isValidPosition(targetRow, targetCol) && this._isValidPosition(capturedRow, capturedCol)) {
                    const captured = currentBoard[capturedRow][capturedCol];
                    const target = currentBoard[targetRow][targetCol];

                    if (captured && captured.player !== piece.player && !target &&
                        !capturedPieces.some(p => p.id === captured.id)) { 
                        
                        foundCaptureInThisStep = true;
                        const newCapturedPieces = [...capturedPieces, { id: captured.id }];
                        
                        // Simulate piece state for next recursion
                        const nextPieceState = {
                            id: piece.id,
                            player: piece.player,
                            row: targetRow,
                            col: targetCol,
                            isKing: piece.isKing || getEffectivePromotionRow(piece.player, humanPlayerColor) === targetRow
                        };

                        const newPath = [...currentPath, {
                            from: { row: piece.row, col: piece.col },
                            to: { row: targetRow, col: targetCol },
                            captured: { row: capturedRow, col: capturedCol, id: captured.id }
                        }];

                        // Create a NEW TEMPORARY BOARD for this recursive branch
                        const nextBoardState = deepCopyBoard(currentBoard);
                        nextBoardState[capturedRow][capturedCol] = null; // Remove captured piece
                        nextBoardState[piece.row][piece.col] = null; // Remove the moving piece from its *current* simulated position
                        nextBoardState[targetRow][targetCol] = nextPieceState; // Place at new position

                        // Recursively find further captures FROM THE NEW POSITION (nextPieceState)
                        const furtherChains = this._getPieceCaptureChains(nextBoardState, nextPieceState, newPath, newCapturedPieces, humanPlayerColor);

                        if (furtherChains.length > 0) {
                            chains.push(...furtherChains);
                        } else {
                            // If no further captures, this is an end of a chain
                            chains.push({
                                piece: { ...piece }, // Original piece info that started the chain
                                path: newPath,
                                to: { row: nextPieceState.row, col: nextPieceState.col }, // Final destination
                                capturedPieces: newCapturedPieces,
                                isKingPromotion: nextPieceState.isKing && !piece.isKing // Only if promoted during this capture
                            });
                        }
                    }
                }
                
                // King flying capture logic
                if (isKing) {
                    for (let i = 1; i < BOARD_SIZE; i++) {
                        const checkRow = piece.row + i * dr;
                        const checkCol = piece.col + i * dc;

                        if (!this._isValidPosition(checkRow, checkCol)) break;

                        const currentPieceAtCheck = currentBoard[checkRow][checkCol];

                        if (currentPieceAtCheck && currentPieceAtCheck.player !== piece.player) {
                            for (let j = i + 1; j < BOARD_SIZE; j++) {
                                const landRow = piece.row + j * dr;
                                const landCol = piece.col + j * dc;

                                if (!this._isValidPosition(landRow, landCol)) break;

                                if (!currentBoard[landRow][landCol]) { // Check if landing square is empty
                                    if (!capturedPieces.some(p => p.id === currentPieceAtCheck.id)) {
                                        foundCaptureInThisStep = true;
                                        const newCapturedPieces = [...capturedPieces, { id: currentPieceAtCheck.id }];

                                        const nextPieceState = {
                                            id: piece.id,
                                            player: piece.player,
                                            row: landRow,
                                            col: landCol,
                                            isKing: true,
                                        };

                                        const newPath = [...currentPath, {
                                            from: { row: piece.row, col: piece.col },
                                            to: { row: landRow, col: landCol },
                                            captured: { row: checkRow, col: checkCol, id: currentPieceAtCheck.id }
                                        }];

                                        // Create a NEW TEMPORARY BOARD for this recursive branch
                                        const nextBoardState = deepCopyBoard(currentBoard);
                                        nextBoardState[checkRow][checkCol] = null; // Remove captured piece
                                        nextBoardState[piece.row][piece.col] = null; // Remove moving piece
                                        nextBoardState[landRow][landCol] = nextPieceState; // Place at new position

                                        const furtherChains = this._getPieceCaptureChains(nextBoardState, nextPieceState, newPath, newCapturedPieces, humanPlayerColor);

                                        if (furtherChains.length > 0) {
                                            chains.push(...furtherChains);
                                        } else {
                                            chains.push({
                                                piece: { ...piece },
                                                path: newPath,
                                                to: { row: nextPieceState.row, col: nextPieceState.col },
                                                capturedPieces: newCapturedPieces,
                                                isKingPromotion: false
                                            });
                                        }
                                    }
                                } else {
                                    break;
                                }
                            }
                            break;
                        } else if (currentPieceAtCheck) {
                            break;
                        }
                    }
                }
            }
        }

        // If no captures were found from this position, and we had previous captures,
        // then this branch is a valid chain ending.
        if (!foundCaptureInThisStep && currentPath.length > 0) {
            chains.push({
                piece: { ...piece },
                path: currentPath,
                to: { row: piece.row, col: piece.col }, // Final destination
                capturedPieces: capturedPieces,
                isKingPromotion: !piece.isKing && getEffectivePromotionRow(piece.player, humanPlayerColor) === piece.row
            });
        }

        return chains;
    }

    async executeMove(piece, move) {
        this.deselectPiece();
        this.saveMoveHistory(); // Save state before move

        const originalRow = piece.row;
        const originalCol = piece.col;

        // --- ONLINE GAME INTEGRATION ---
        if (this.state.isOnlineGame && this.state.onlineGameSocket && this.state.isMyTurn) {
            const movePayload = {
                from: [originalRow, originalCol],
                to: [move.to.row, move.to.col],
                // Collect all captured pieces' coordinates in the path for server
                captures: move.path.filter(step => step.captured).map(step => [step.captured.row, step.captured.col]),
                lobbyId: this.state.onlineLobbyId
            };
            console.log('Emitting game:move to server:', movePayload);
            this.state.onlineGameSocket.emit('game:move', movePayload);
            this.state.isMyTurn = false; // Temporarily disable input until server confirms/updates
            this.config.onMessage("Waiting for opponent...", 'blue');
            // The server will send a 'game:move' event back, which will then call applyServerMove
            return; // Exit here for online games
        }
        // --- END ONLINE GAME INTEGRATION ---


        // NON-ONLINE (Local/AI) Game Logic continues below:
        // Remove piece from old position (in the board array only, not from DOM yet)
        this.state.board[originalRow][originalCol] = null;

        let hasFurtherCaptures = false;
        
        // Animate and process each step in the path (important for chain captures)
        for (const step of move.path) {
            if (step.captured) {
                const capturedPiece = this.state.pieces.find(p => p.id === step.captured.id);
                if (capturedPiece && capturedPiece.element) { // Ensure piece exists and has a DOM element
                    // Animate capture
                    capturedPiece.element.animate(
                        [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0)' }],
                        { duration: 200, easing: 'ease-out' }
                    );
                    await new Promise(resolve => setTimeout(resolve, 200)); // Wait for capture animation

                    // Remove captured piece from game state and DOM
                    this.state.board[capturedPiece.row][capturedPiece.col] = null;
                    capturedPiece.element.remove();
                    this.state.pieces = this.state.pieces.filter(p => p.id !== capturedPiece.id);
                }
            }

            // Animate piece movement
            await new Promise(resolve => {
                animateMove(piece.element, piece.row, piece.col, step.to.row, step.to.col, resolve);
            });

            // Update piece's JS state (row/col)
            piece.row = step.to.row;
            piece.col = step.to.col;
            piece.updatePosition(); // Immediately update transform after animation ends, ensures data attributes are correct
        }

        // Place piece in new position in the board array
        this.state.board[piece.row][piece.col] = piece;

        // Check for King promotion
        // Only promote if it wasn't a king already and reached the farthest row
        if (move.isKingPromotion && !piece.isKing) {
            piece.promoteToKing();
        }

        // If a capture was made, check for further chain captures by the *same* piece
        if (move.capturedPieces.length > 0) {
            const longestFurtherCaptures = this._findAllMandatoryCapturesForPieceAtLocation(piece);

            if (longestFurtherCaptures.length > 0) {
                hasFurtherCaptures = true;
                this.state.selectedPiece = piece; // Keep piece selected for chain capture
                this.state.possibleMoves = longestFurtherCaptures;
                this._highlightMoves(this.state.possibleMoves);
                this.config.onMessage('Chain capture! Make another move with this piece.');

                // IMPORTANT: If this is an AI's turn and it has further captures, trigger AI again
                if (this.state.gameMode === 'ai' && this.state.currentPlayer === this.state.aiPlayerColor) {
                    setTimeout(() => this.makeAIChainMove(), 700); // Trigger a new AI move for the chain
                    return; // Prevent switchTurn() from being called here, as the AI turn continues
                }
            }
        }

        if (!hasFurtherCaptures) {
            this.switchTurn();
        }
    }


    /**
     * Applies game state received from the server. This is a public method called by main.js.
     * @param {Array<Array<string>>} serializedBoard - Board state from server.
     * @param {'red'|'blue'} serverCurrentTurn - Current turn from server.
     * @param {number} serverRedPiecesCount - Red pieces count from server.
     * @param {number} serverBluePiecesCount - Blue pieces count from server.
     */
    applyServerMove(serializedBoard, serverCurrentTurn, serverRedPiecesCount, serverBluePiecesCount) {
        // Full re-render the board for now for simplicity, can be optimized later
        this._loadBoardFromSerialized(serializedBoard); // Recreates DOM pieces and internal state

        this.state.currentPlayer = serverCurrentTurn;
        // The piece counts are not directly used in game logic, but can be for UI
        // this.state.redPieces = serverRedPiecesCount;
        // this.state.bluePieces = serverBluePiecesCount;

        this.deselectPiece(); // Clear any existing selection and highlights

        this.state.mandatoryCaptures = this._findAllMandatoryCaptures(this.state.currentPlayer);

        this.updateTurnIndicator();
        this.state.isMyTurn = (this.state.currentPlayer === this.state.humanPlayerColor);

        if (this.state.isMyTurn) {
            this.config.onMessage("It's your turn!", 'blue');
        } else {
            this.config.onMessage("Waiting for opponent...", 'blue');
        }

        this.checkGameEnd(); // Check for game end condition after server move
    }


    // New function to handle AI continuing a chain capture
    async makeAIChainMove() {
        this.config.onMessage(`${this.state.currentPlayer.toUpperCase()}'s turn (AI continuing chain...)`);
        // For AI's chain move, we need a fresh deep copy of the current `this.state.board`
        // as the AI's `getBestMove` expects a clean board for evaluation.
        const currentBoardForAI = deepCopyBoard(this.state.board);
        const aiPlayer = this.state.currentPlayer;
        const humanPlayer = getOpponent(aiPlayer);
        
        let bestNextChainMove = null;
        let bestScore = -Infinity;

        // The AI's `getBestMove` will already handle chain captures,
        // so we can call it here with the current board state.
        // We pass the actual `Piece` object to AI for its `_getPieceCaptureChains` method.
        // However, `getBestMove` from `ai.js` expects the piece object to be found from `board` parameter.
        // It uses `move.piece.id` to identify the piece.
        // So, we need to pass the *actual* piece object for the AI to start its search from.
        const selectedPieceForAI = currentBoardForAI[this.state.selectedPiece.row][this.state.selectedPiece.col];
        if (!selectedPieceForAI) {
            console.error("makeAIChainMove: Selected piece not found on currentBoardForAI for evaluation.");
            this.switchTurn(); // Fallback: end turn if AI can't find its piece
            return;
        }

        // We need the AI's capture chain logic, but specifically starting from the `selectedPieceForAI`
        // and its current `currentBoardForAI` context.
        // The AI's `_getAllPossibleMoves` will filter all moves including chains.
        // Let's adapt the AI's internal method directly here.
        
        const aiPossibleMoves = this.state.ai._getAllPossibleMoves(currentBoardForAI, aiPlayer);

        // Filter these moves to ensure they *continue* the current chain from `selectedPieceForAI`
        // This is crucial: the AI should only consider moves that start where `this.state.selectedPiece` is and are part of a capture.
        const relevantChainMoves = aiPossibleMoves.filter(move =>
            move.piece.id === selectedPieceForAI.id && move.capturedPieces.length > 0
        );

        if (relevantChainMoves.length === 0) {
            console.warn("AI expected to chain capture but found no valid relevant moves. Ending turn.");
            this.switchTurn();
            return;
        }
        
        // Now, find the best move among these relevant chain moves
        for (const move of relevantChainMoves) {
            const simulatedBoard = this.state.ai._applyMoveToBoard(currentBoardForAI, move); // AI's apply move on simulated board
            const score = this.state.ai._minimax(simulatedBoard, this.state.ai.maxDepth - 1, -Infinity, Infinity, false, aiPlayer, humanPlayer);

            if (score > bestScore) {
                bestScore = score;
                bestNextChainMove = move;
            }
        }

        if (bestNextChainMove) {
            await new Promise(resolve => setTimeout(resolve, 300)); // Small pause
            this.executeMove(this.state.selectedPiece, bestNextChainMove); // AI executes the next step in the chain
        } else {
            console.warn("AI expected to chain capture but failed to find optimal next step. Ending turn.");
            this.switchTurn();
        }
    }


    // Helper to find mandatory captures for a specific piece at its current location
    _findAllMandatoryCapturesForPieceAtLocation(piece) {
        // IMPORTANT: Pass a deep copy of the board to _getPieceCaptureChains
        // so it doesn't modify the actual game state during its recursive search.
        const allChains = this._getPieceCaptureChains(deepCopyBoard(this.state.board), piece, [], [], this.state.humanPlayerColor);
        
        if (allChains.length === 0) return [];

        const maxCaptures = Math.max(...allChains.map(chain => chain.capturedPieces.length));
        return allChains.filter(chain => chain.capturedPieces.length === maxCaptures);
    }


    switchTurn() {
        this.deselectPiece(); // Deselect piece and clear highlights
        this.state.currentPlayer = getOpponent(this.state.currentPlayer);
        this.updateTurnIndicator();
        
        // Crucial: Calculate mandatory captures for the *new* player immediately.
        this.state.mandatoryCaptures = this._findAllMandatoryCaptures(this.state.currentPlayer);

        // Check game end first, as this might bypass further logic
        this.checkGameEnd(); 
        
        if (!this.state.winner) {
            if (this.state.mandatoryCaptures.length > 0) {
                this.config.onMessage(`${this.state.currentPlayer.toUpperCase()} must take a capture!`);
            } else {
                this.config.onMessage(''); // Clear message if no mandatory capture
            }

            // If it's AI's turn now, trigger AI move
            if (this.state.gameMode === 'ai' && this.state.currentPlayer === this.state.aiPlayerColor) {
                setTimeout(() => this.makeAIMove(), 700); // Give a small delay for better UX
            }
        }
        this.saveMoveHistory(); // Save state after full turn switch
    }

    async makeAIMove() {
        this.config.onMessage(`${this.state.currentPlayer.toUpperCase()}'s turn (AI is thinking...)`);
        // Pass a deep copy of the board to the AI to prevent direct modification during its search
        const currentBoardState = deepCopyBoard(this.state.board); // Use AI's deepCopy utility
        const aiPlayer = this.state.currentPlayer;
        const humanPlayer = getOpponent(aiPlayer);

        // The AI's `getBestMove` will directly return the best move found
        const bestMove = this.state.ai.getBestMove(currentBoardState, aiPlayer, humanPlayer);

        if (bestMove) {
            // Find the actual piece object from this.state.pieces using the ID from bestMove.piece
            const pieceToMove = this.state.pieces.find(p => p.id === bestMove.piece.id);
            if (pieceToMove) {
                // Mimic human player's turn flow visually
                this.selectPiece(pieceToMove); // AI "selects" its piece (highlights)
                await new Promise(resolve => setTimeout(resolve, 300)); // Small pause
                this.executeMove(pieceToMove, bestMove); // AI executes the move
            } else {
                console.error("AI tried to move a piece not found in current game state:", bestMove.piece);
                this.state.winner = humanPlayer;
                this.showResultScreen();
            }
        } else {
            // AI has no moves, game over
            this.state.winner = humanPlayer; // Opponent wins because AI cannot move
            this.showResultScreen();
        }
    }

    checkGameEnd() {
        const redPieces = this.state.pieces.filter(p => p.player === PLAYER_RED).length;
        const bluePieces = this.state.pieces.filter(p => p.player === PLAYER_BLUE).length;

        if (redPieces === 0) {
            this.state.winner = PLAYER_BLUE;
        } else if (bluePieces === 0) {
            this.state.winner = PLAYER_RED;
        } else {
            // Check if current player has ANY valid move (including mandatory captures)
            // IMPORTANT: Pass a deep copy of the board to _getAllPlayerMoves for this check
            const currentPlayerMoves = this._getAllPlayerMoves(this.state.currentPlayer);
            
            if (currentPlayerMoves.length === 0) {
                // Player has pieces but no moves available
                this.state.winner = getOpponent(this.state.currentPlayer);
            }
        }

        if (this.state.winner) {
            this.showResultScreen();
        }
    }

    showResultScreen() {
        this.config.onMessage(''); // Clear any game messages
        const redCount = this.state.pieces.filter(p => p.player === PLAYER_RED).length;
        const blueCount = this.state.pieces.filter(p => p.player === PLAYER_BLUE).length;
        this.config.onGameEnd(this.state.winner, redCount, blueCount, this.state.isOnlineGame);
    }

    // --- UI Updates ---
    updateTurnIndicator() {
        this.config.onTurnChange(this.state.currentPlayer, this.state.isOnlineGame, this.state.humanPlayerColor);
    }

    _highlightMoves(moves) {
        this.clearHighlights();
        moves.forEach(move => {
            const squareEl = this.dom.boardContainer.querySelector(`.square[data-row="${move.to.row}"][data-col="${move.to.col}"]`);
            if (squareEl) {
                const highlightEl = document.createElement('div');
                highlightEl.classList.add('highlight');
                if (move.capturedPieces && move.capturedPieces.length > 0) {
                    highlightEl.classList.add('capture');
                }
                squareEl.appendChild(highlightEl);
            }
        });
    }

    clearHighlights() {
        this.dom.boardContainer.querySelectorAll('.highlight').forEach(el => el.remove());
    }

    // --- Helper Functions ---
    _isValidPosition(row, col) {
        return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
    }

    // Updated to use getEffectivePromotionRow helper
    _checkKingPromotion(player, row) {
        return row === getEffectivePromotionRow(player, this.state.humanPlayerColor);
    }

    // --- Undo Functionality (for Single Player / Local) ---
    saveMoveHistory() {
        if (this.state.gameMode === 'online') return; // No undo for online

        // Deep copy current state
        const currentBoard = this.state.board.map(row => row.map(cell => cell ? { ...cell } : null));
        // Store piece data, not actual Piece objects, to avoid circular references with 'element'
        const currentPiecesData = this.state.pieces.map(p => ({
            id: p.id,
            player: p.player,
            row: p.row,
            col: p.col,
            isKing: p.isKing
        }));
        
        this.state.moveHistory.push({
            boardState: currentBoard,
            currentPlayer: this.state.currentPlayer,
            piecesData: currentPiecesData, // Store piece data
            selectedPieceData: this.state.selectedPiece ? { // Store data, not object
                id: this.state.selectedPiece.id,
                row: this.state.selectedPiece.row,
                col: this.state.selectedPiece.col
            } : null,
            // Deep copy moves and captured pieces within moves
            mandatoryCaptures: this.state.mandatoryCaptures.map(m => ({
                ...m,
                path: m.path.map(step => ({...step, captured: step.captured ? {...step.captured} : undefined})),
                capturedPieces: m.capturedPieces.map(p => ({...p}))
            })),
            winner: this.state.winner,
            humanPlayerColor: this.state.humanPlayerColor, // Store chosen colors for undo
            aiPlayerColor: this.state.aiPlayerColor,
            gameMode: this.state.gameMode,
            aiDifficulty: this.state.aiDifficulty
        });

        if (this.state.moveHistory.length > 20) { // Limit history size
            this.state.moveHistory.shift();
        }
    }

    undoLastMove() {
        if (this.state.gameMode === 'online') {
            this.config.onMessage('Undo is not available in online mode.', 'red');
            return;
        }

        if (this.state.moveHistory.length <= 1) { // Keep at least the initial state
            this.config.onMessage('Cannot undo further.', 'red');
            return;
        }

        // If in AI mode, undo the human's move AND the AI's response.
        if (this.state.gameMode === 'ai' && this.state.moveHistory.length > 1) {
             this.state.moveHistory.pop(); // Remove AI's response state
             if (this.state.moveHistory.length <= 1) { // Check if only initial state is left
                this.config.onMessage('Cannot undo further.', 'red');
                return;
             }
        }
        
        // Pop the previous state
        const prevState = this.state.moveHistory.pop(); 
        
        if (prevState) {
            // Restore state properties
            this.state.currentPlayer = prevState.currentPlayer;
            this.state.winner = prevState.winner;
            this.state.selectedPiece = null;
            this.state.mandatoryCaptures = prevState.mandatoryCaptures.map(m => ({
                ...m,
                path: m.path.map(step => ({...step, captured: step.captured ? {...step.captured} : undefined})),
                capturedPieces: m.capturedPieces.map(p => ({...p}))
            }));
            this.state.humanPlayerColor = prevState.humanPlayerColor;
            this.state.aiPlayerColor = prevState.aiPlayerColor;
            this.state.gameMode = prevState.gameMode;
            this.state.aiDifficulty = prevState.aiDifficulty;
            this.state.isOnlineGame = false; // Undo is only for non-online modes

            // Clear existing DOM pieces and re-render from saved state
            this.dom.boardContainer.querySelectorAll('.piece').forEach(p => p.remove());
            this.state.pieces = [];
            this.state.board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)); // Clear board array
            this.state.pieceCounter = 0; // Reset for piece ID uniqueness for new pieces

            // Re-create piece objects and render them based on saved data
            prevState.piecesData.forEach(pData => {
                const piece = new this.Piece(pData.id, pData.player, pData.row, pData.col);
                piece.isKing = pData.isKing;
                piece.render(this.dom.boardContainer, this.handlePieceClick.bind(this)); // Recreates DOM elements
                
                // Re-map the Piece object in the board state
                this.state.board[piece.row][piece.col] = piece;
                this.state.pieces.push(piece);

                this.state.pieceCounter = Math.max(this.state.pieceCounter, pData.id + 1); // Keep counter high enough
            });

            // Re-select piece if it was selected in previous state
            if (prevState.selectedPieceData) {
                const restoredSelectedPiece = this.state.pieces.find(p => p.id === prevState.selectedPieceData.id);
                if (restoredSelectedPiece) {
                    // Set the state visually but don't call selectPiece to avoid re-calculating moves unnecessarily
                    this.state.selectedPiece = restoredSelectedPiece;
                    restoredSelectedPiece.element.classList.add('selected');
                }
            }
            
            this.updateTurnIndicator();
            this.clearHighlights();
            this.config.onMessage('Last move undone.', 'blue');
        } else {
            // If no more history, just reset to initial game state
            this.resetGame({
                mode: prevState.gameMode,
                difficulty: prevState.aiDifficulty,
                playerColor: prevState.humanPlayerColor,
                onTurnChange: this.config.onTurnChange,
                onGameEnd: this.config.onGameEnd,
                onMessage: this.config.onMessage,
                onUndoVisibility: this.config.onUndoVisibility
            });
        }
    }
}