import { BOARD_SIZE, PLAYER_RED, PLAYER_BLUE, AI_DIFFICULTY, getOpponent, animateMove, getEffectivePlayerDirection, getEffectivePromotionRow, deepCopyBoard } from './utils.js';
import { initializeAI } from './ai.js'; // Import the AI factory function

// DamaGame Class
export class DamaGame {
    constructor(boardContainerId, config) {
        this.dom = {
            boardContainer: document.getElementById(boardContainerId),
            squares: Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)), // Store references to square DOM elements
        };
        if (!this.dom.boardContainer) {
            console.error(`DamaGame: Board container with ID '${boardContainerId}' not found.`);
            return;
        }

        this.config = config; // { mode, playerColor, aiDifficulty, socket, lobbyId, onTurnChange, onGameEnd, onMessage, onUndoVisibility }

        this.state = {
            board: [], // 2D array of Piece objects or null
            pieces: [], // Flat array of all Piece objects (references to actual Piece objects)
            currentPlayer: null,
            selectedPiece: null,
            possibleMoves: [],
            mandatoryCaptures: [],
            gameMode: null,
            aiDifficulty: null,
            winner: null,
            ai: null,
            humanPlayerColor: null,
            aiPlayerColor: null,
            onlineGameSocket: null,
            onlineLobbyId: null,
            isMyTurn: false,
            moveHistory: [],
            pieceCounter: 0
        };

        this._createBoardDOM(); // NEW: Create the static board squares once
        this._initEventListeners(); // Setup event listeners for the board (square clicks)
        this.resetGame(config); // Initial setup of the game
    }

    // --- Inner Piece Class (Now part of DamaGame's scope) ---
    Piece = class {
        constructor(id, player, row, col) {
            this.id = id;
            this.player = player; // 'red' or 'blue'
            this.row = row;
            this.col = col;
            this.isKing = false;
            this.element = null; // Reference to the DOM element
        }

        // MODIFIED: Takes the specific square DOM element as parent
        render(squareElement, handlePieceClickMethod) {
            if (!squareElement) {
                console.error(`Piece.render: Target square element for piece (${this.row}, ${this.col}) not found.`);
                return;
            }

            const pieceEl = document.createElement('div');
            pieceEl.classList.add('piece', this.player);
            if (this.isKing) { // Ensure king class is added if it's already a king
                pieceEl.classList.add('king');
            }
            pieceEl.dataset.id = this.id;
            pieceEl.dataset.row = this.row;
            pieceEl.dataset.col = this.col;
            
            this.element = pieceEl;
            squareElement.appendChild(pieceEl); // APPEND TO THE SQUARE!

            pieceEl.addEventListener('click', (e) => handlePieceClickMethod(e, this));
            // this.updatePosition(); // No longer needed for initial transform, CSS handles centering within square
        }

        // MODIFIED: Only updates data attributes, CSS handles visual positioning within the square
        updatePosition() {
            if (this.element) {
                this.element.dataset.row = this.row;
                this.element.dataset.col = this.col;
                // No need to set transform here, CSS 'top: 50%; left: 50%; transform: translate(-50%, -50%);'
                // on .piece within .square handles centering.
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
    _createBoardDOM() {
        this.dom.boardContainer.innerHTML = ''; // Clear any existing content in the board container

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const squareEl = document.createElement('div');
                squareEl.classList.add('square'); // Ensure 'square' class is always present
                squareEl.classList.add((r + c) % 2 === 0 ? 'light' : 'dark');
                squareEl.dataset.row = r.toString(); // Store as string for data attributes
                squareEl.dataset.col = c.toString(); // Store as string for data attributes
                this.dom.boardContainer.appendChild(squareEl);
                this.dom.squares[r][c] = squareEl; // Store reference to the DOM element
            }
        }
        console.log("Board DOM squares created.");
    }

    _initEventListeners() {
        this.dom.boardContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('square')) {
                const row = parseInt(e.target.dataset.row);
                const col = parseInt(e.target.dataset.col);
                this.handleSquareClick(e, row, col);
            }
        });
    }

    // Public method to reset the game, called by main.js
    resetGame(config) {
        this.config = config;

        // Reset game state to defaults
        this.state.board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
        this.state.pieces = [];
        this.state.selectedPiece = null;
        this.state.possibleMoves = [];
        this.state.mandatoryCaptures = [];
        this.state.winner = null;
        this.state.moveHistory = [];
        this.state.pieceCounter = 0;

        this.state.gameMode = config.mode;
        this.state.aiDifficulty = config.aiDifficulty;
        this.state.humanPlayerColor = config.playerColor;
        this.state.onlineGameSocket = config.socket;
        this.state.onlineLobbyId = config.lobbyId;

        if (config.mode === 'ai') {
            this.state.aiPlayerColor = getOpponent(this.state.humanPlayerColor);
            this.state.ai = initializeAI(config.aiDifficulty, this.state.humanPlayerColor);
            this.config.onUndoVisibility(true);
        } else {
            this.state.aiPlayerColor = null;
            this.state.ai = null;
            this.config.onUndoVisibility(false);
        }

        this.state.isOnlineGame = (config.mode === 'online');

        if (this.state.isOnlineGame && config.initialBoard && config.initialTurn) {
            this._loadBoardFromSerialized(config.initialBoard);
            this.state.currentPlayer = config.initialTurn;
            this.state.isMyTurn = (this.state.currentPlayer === this.state.humanPlayerColor);
        } else {
            this._initializeStandardBoardContent(); // NEW: initialize board content only
            this.state.currentPlayer = PLAYER_RED;
            this.state.isMyTurn = (this.state.gameMode !== 'online' || this.state.currentPlayer === this.state.humanPlayerColor);
        }
        
        this._renderPieces(); // NEW: Render pieces based on internal state
        this.updateTurnIndicator();
        this.config.onMessage('');
        this.saveMoveHistory();

        if (this.state.gameMode === 'ai' && this.state.currentPlayer === this.state.aiPlayerColor) {
            setTimeout(() => this.makeAIMove(), 700);
        }
        console.log("Game reset and initialized.");
    }

    // NEW: Initialize only the piece content for a standard board setup
    _initializeStandardBoardContent() {
        // Clear pieces arrays
        this.state.board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
        this.state.pieces = [];
        this.state.pieceCounter = 0;

        const topPlayerColor = this.state.humanPlayerColor === PLAYER_RED ? PLAYER_BLUE : PLAYER_RED;
        const bottomPlayerColor = this.state.humanPlayerColor || PLAYER_BLUE;

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if ((r + c) % 2 !== 0) { // Pieces only on dark squares
                    if (r < 3) { // Top 3 rows for topPlayerColor
                        const piece = new this.Piece(this.state.pieceCounter++, topPlayerColor, r, c);
                        this.state.pieces.push(piece);
                        this.state.board[r][c] = piece;
                    } else if (r >= BOARD_SIZE - 3) { // Bottom 3 rows for bottomPlayerColor
                        const piece = new this.Piece(this.state.pieceCounter++, bottomPlayerColor, r, c);
                        this.state.pieces.push(piece);
                        this.state.board[r][c] = piece;
                    }
                }
            }
        }
        console.log("Standard board content initialized.");
    }

    // Helper to load board from server's serialized format
    _loadBoardFromSerialized(serializedBoard) {
        this.state.board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
        this.state.pieces = [];
        this.state.pieceCounter = 0;

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const serializedPiece = serializedBoard[r][c];
                if (serializedPiece) {
                    const player = serializedPiece.startsWith('R') ? PLAYER_RED : PLAYER_BLUE;
                    const isKing = serializedPiece.includes('K');
                    
                    const piece = new this.Piece(this.state.pieceCounter++, player, r, c);
                    piece.isKing = isKing;
                    this.state.pieces.push(piece);
                    this.state.board[r][c] = piece;
                }
            }
        }
        console.log("Board content loaded from serialized data.");
    }

    // NEW: Renders pieces on the board based on the current state.pieces
    _renderPieces() {
        // Clear all existing pieces from the DOM
        this.dom.boardContainer.querySelectorAll('.piece').forEach(p => p.remove());

        // Render each piece onto its correct square
        this.state.pieces.forEach(piece => {
            const targetSquareEl = this.dom.squares[piece.row][piece.col];
            if (targetSquareEl) {
                piece.render(targetSquareEl, this.handlePieceClick.bind(this));
            } else {
                console.error(`_renderPieces: Could not find DOM square for piece at (${piece.row}, ${piece.col})`);
            }
        });
        this.clearHighlights();
        this.updateTurnIndicator();
        console.log("Pieces rendered on board.");
    }


    // --- Game Logic ---

    handlePieceClick(event, piece) {
        if (this.state.winner) return;
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
            this.deselectPiece();
        } else {
            this.selectPiece(piece);
        }
    }

    handleSquareClick(event, row, col) {
        if (this.state.winner) return;
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
        this.deselectPiece();

        this.state.selectedPiece = piece;
        piece.element.classList.add('selected');

        const moves = this._getValidMovesForPiece(piece);
        
        this.state.mandatoryCaptures = this._findAllMandatoryCaptures(this.state.currentPlayer);

        if (this.state.mandatoryCaptures.length > 0) {
            const pieceMandatoryCaptures = this.state.mandatoryCaptures.filter(
                chain => chain.piece.id === piece.id
            );
            if (pieceMandatoryCaptures.length > 0) {
                this.state.possibleMoves = pieceMandatoryCaptures;
                this.config.onMessage(`Mandatory capture!`);
            } else {
                this.deselectPiece();
                this.config.onMessage(`You must take a capture. Select a piece that can capture.`);
                return;
            }
        } else {
            this.state.possibleMoves = moves;
            this.config.onMessage('');
        }
        
        this._highlightMoves(this.state.possibleMoves);
    }

    deselectPiece() {
        if (this.state.selectedPiece && this.state.selectedPiece.element) { // Added element check
            this.state.selectedPiece.element.classList.remove('selected');
            this.state.selectedPiece = null;
        }
        this.clearHighlights();
        if (this.state.mandatoryCaptures.length === 0) {
             this.config.onMessage('');
        }
    }


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
                            piece: { ...piece },
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
                            capturedPieces: [{ ...capturedPiece }],
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
                            break;
                        } else if (currentPiece) {
                            break;
                        }
                    }
                }
            }
        }
        return moves;
    }

    _getAllPlayerMoves(player) {
        let allCaptures = [];
        let allRegularMoves = [];

        for (const piece of this.state.pieces) {
            if (piece.player === player) {
                const chains = this._getPieceCaptureChains(deepCopyBoard(this.state.board), piece, [], [], this.state.humanPlayerColor);
                if (chains.length > 0) {
                    allCaptures.push(...chains);
                }
                const pieceMoves = this._getValidMovesForPiece(piece);
                const regularMovesForPiece = pieceMoves.filter(m => m.capturedPieces.length === 0);
                allRegularMoves.push(...regularMovesForPiece);
            }
        }

        if (allCaptures.length > 0) {
            const maxCaptures = Math.max(...allCaptures.map(chain => chain.capturedPieces.length));
            return allCaptures.filter(chain => chain.capturedPieces.length === maxCaptures);
        }
        return allRegularMoves;
    }

    _findAllMandatoryCaptures(player) {
        return this._getAllPlayerMoves(player).filter(move => move.capturedPieces.length > 0);
    }

    _getPieceCaptureChains(currentBoard, piece, currentPath, capturedPieces, humanPlayerColor) {
        const chains = [];
        const isKing = piece.isKing;
        
        let foundCaptureInThisStep = false;
        
        const rowDirectionsForCaptures = [-1, 1];
        const colDirections = [-1, 1];

        for (const dr of rowDirectionsForCaptures) {
            for (const dc of colDirections) {
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

                        const nextBoardState = deepCopyBoard(currentBoard);
                        nextBoardState[capturedRow][capturedCol] = null;
                        nextBoardState[piece.row][piece.col] = null;
                        nextBoardState[targetRow][targetCol] = nextPieceState;

                        const furtherChains = this._getPieceCaptureChains(nextBoardState, nextPieceState, newPath, newCapturedPieces, humanPlayerColor);

                        if (furtherChains.length > 0) {
                            chains.push(...furtherChains);
                        } else {
                            chains.push({
                                piece: { ...piece },
                                path: newPath,
                                to: { row: nextPieceState.row, col: nextPieceState.col },
                                capturedPieces: newCapturedPieces,
                                isKingPromotion: nextPieceState.isKing && !piece.isKing
                            });
                        }
                    }
                }
                
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

                                if (!currentBoard[landRow][landCol]) {
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

                                        const nextBoardState = deepCopyBoard(currentBoard);
                                        nextBoardState[checkRow][checkCol] = null;
                                        nextBoardState[piece.row][piece.col] = null;
                                        nextBoardState[landRow][landCol] = nextPieceState;

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

        if (!foundCaptureInThisStep && currentPath.length > 0) {
            chains.push({
                piece: { ...piece },
                path: currentPath,
                to: { row: piece.row, col: piece.col },
                capturedPieces: capturedPieces,
                isKingPromotion: !piece.isKing && getEffectivePromotionRow(piece.player, humanPlayerColor) === piece.row
            });
        }

        return chains;
    }

    async executeMove(piece, move) {
        this.deselectPiece();
        this.saveMoveHistory();

        const originalRow = piece.row;
        const originalCol = piece.col;

        if (this.state.isOnlineGame && this.state.onlineGameSocket && this.state.isMyTurn) {
            const movePayload = {
                from: [originalRow, originalCol],
                to: [move.to.row, move.to.col],
                captures: move.path.filter(step => step.captured).map(step => [step.captured.row, step.captured.col]),
                lobbyId: this.state.onlineLobbyId
            };
            console.log('Emitting game:move to server:', movePayload);
            this.state.onlineGameSocket.emit('game:move', movePayload);
            this.state.isMyTurn = false;
            this.config.onMessage("Waiting for opponent...", 'blue');
            return;
        }

        this.state.board[originalRow][originalCol] = null;

        let hasFurtherCaptures = false;
        
        for (const step of move.path) {
            if (step.captured) {
                const capturedPiece = this.state.pieces.find(p => p.id === step.captured.id);
                if (capturedPiece && capturedPiece.element) {
                    capturedPiece.element.animate(
                        [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0)' }],
                        { duration: 200, easing: 'ease-out' }
                    );
                    await new Promise(resolve => setTimeout(resolve, 200));

                    this.state.board[capturedPiece.row][capturedPiece.col] = null;
                    capturedPiece.element.remove();
                    this.state.pieces = this.state.pieces.filter(p => p.id !== capturedPiece.id);
                }
            }
            // MODIFIED: Pass targetSquareEl to animateMove for correct positioning
            const targetSquareEl = this.dom.squares[step.to.row][step.to.col];
            await new Promise(resolve => {
                animateMove(piece.element, piece.row, piece.col, step.to.row, step.to.col, resolve, targetSquareEl);
            });

            piece.row = step.to.row;
            piece.col = step.to.col;
            // piece.updatePosition(); // No longer explicitly needed here for transform, just for data attributes
        }

        this.state.board[piece.row][piece.col] = piece;
        // MODIFIED: After move, re-append piece to its new square if it moved from its original parent
        const newSquareEl = this.dom.squares[piece.row][piece.col];
        if (newSquareEl && piece.element && piece.element.parentNode !== newSquareEl) {
            newSquareEl.appendChild(piece.element);
        }
        piece.updatePosition(); // Update data attributes

        if (move.isKingPromotion && !piece.isKing) {
            piece.promoteToKing();
        }

        if (move.capturedPieces.length > 0) {
            const longestFurtherCaptures = this._findAllMandatoryCapturesForPieceAtLocation(piece);

            if (longestFurtherCaptures.length > 0) {
                hasFurtherCaptures = true;
                this.state.selectedPiece = piece;
                this.state.possibleMoves = longestFurtherCaptures;
                this._highlightMoves(this.state.possibleMoves);
                this.config.onMessage('Chain capture! Make another move with this piece.');

                if (this.state.gameMode === 'ai' && this.state.currentPlayer === this.state.aiPlayerColor) {
                    setTimeout(() => this.makeAIChainMove(), 700);
                    return;
                }
            }
        }

        if (!hasFurtherCaptures) {
            this.switchTurn();
        }
    }


    applyServerMove(serializedBoard, serverCurrentTurn, serverRedPiecesCount, serverBluePiecesCount) {
        this._loadBoardFromSerialized(serializedBoard);
        this.deselectPiece(); // Clear any existing selection and highlights
        this._renderPieces(); // NEW: Re-render all pieces after loading from serialized board

        this.state.currentPlayer = serverCurrentTurn;
        this.state.mandatoryCaptures = this._findAllMandatoryCaptures(this.state.currentPlayer);

        this.updateTurnIndicator();
        this.state.isMyTurn = (this.state.currentPlayer === this.state.humanPlayerColor);

        if (this.state.isMyTurn) {
            this.config.onMessage("It's your turn!", 'blue');
        } else {
            this.config.onMessage("Waiting for opponent...", 'blue');
        }

        this.checkGameEnd();
    }


    async makeAIChainMove() {
        this.config.onMessage(`${this.state.currentPlayer.toUpperCase()}'s turn (AI continuing chain...)`);
        const currentBoardForAI = deepCopyBoard(this.state.board);
        const aiPlayer = this.state.currentPlayer;
        const humanPlayer = getOpponent(aiPlayer);
        
        let bestNextChainMove = null;
        let bestScore = -Infinity;

        const selectedPieceForAI = currentBoardForAI[this.state.selectedPiece.row][this.state.selectedPiece.col];
        if (!selectedPieceForAI) {
            console.error("makeAIChainMove: Selected piece not found on currentBoardForAI for evaluation.");
            this.switchTurn();
            return;
        }
        
        const aiPossibleMoves = this.state.ai._getAllPossibleMoves(currentBoardForAI, aiPlayer);

        const relevantChainMoves = aiPossibleMoves.filter(move =>
            move.piece.id === selectedPieceForAI.id && move.capturedPieces.length > 0
        );

        if (relevantChainMoves.length === 0) {
            console.warn("AI expected to chain capture but found no valid relevant moves. Ending turn.");
            this.switchTurn();
            return;
        }
        
        for (const move of relevantChainMoves) {
            const simulatedBoard = this.state.ai._applyMoveToBoard(currentBoardForAI, move);
            const score = this.state.ai._minimax(simulatedBoard, this.state.ai.maxDepth - 1, -Infinity, Infinity, false, aiPlayer, humanPlayer);

            if (score > bestScore) {
                bestScore = score;
                bestNextChainMove = move;
            }
        }

        if (bestNextChainMove) {
            await new Promise(resolve => setTimeout(resolve, 300));
            this.executeMove(this.state.selectedPiece, bestNextChainMove);
        } else {
            console.warn("AI expected to chain capture but failed to find optimal next step. Ending turn.");
            this.switchTurn();
        }
    }


    _findAllMandatoryCapturesForPieceAtLocation(piece) {
        const allChains = this._getPieceCaptureChains(deepCopyBoard(this.state.board), piece, [], [], this.state.humanPlayerColor);
        
        if (allChains.length === 0) return [];

        const maxCaptures = Math.max(...allChains.map(chain => chain.capturedPieces.length));
        return allChains.filter(chain => chain.capturedPieces.length === maxCaptures);
    }


    switchTurn() {
        this.deselectPiece();
        this.state.currentPlayer = getOpponent(this.state.currentPlayer);
        this.updateTurnIndicator();
        
        this.state.mandatoryCaptures = this._findAllMandatoryCaptures(this.state.currentPlayer);

        this.checkGameEnd();
        
        if (!this.state.winner) {
            if (this.state.mandatoryCaptures.length > 0) {
                this.config.onMessage(`${this.state.currentPlayer.toUpperCase()} must take a capture!`);
            } else {
                this.config.onMessage('');
            }

            if (this.state.gameMode === 'ai' && this.state.currentPlayer === this.state.aiPlayerColor) {
                setTimeout(() => this.makeAIMove(), 700);
            }
        }
        this.saveMoveHistory();
    }

    async makeAIMove() {
        this.config.onMessage(`${this.state.currentPlayer.toUpperCase()}'s turn (AI is thinking...)`);
        const currentBoardState = deepCopyBoard(this.state.board);
        const aiPlayer = this.state.currentPlayer;
        const humanPlayer = getOpponent(aiPlayer);

        const bestMove = this.state.ai.getBestMove(currentBoardState, aiPlayer, humanPlayer);

        if (bestMove) {
            const pieceToMove = this.state.pieces.find(p => p.id === bestMove.piece.id);
            if (pieceToMove) {
                this.selectPiece(pieceToMove);
                await new Promise(resolve => setTimeout(resolve, 300));
                this.executeMove(pieceToMove, bestMove);
            } else {
                console.error("AI tried to move a piece not found in current game state:", bestMove.piece);
                this.state.winner = humanPlayer;
                this.showResultScreen();
            }
        } else {
            this.state.winner = humanPlayer;
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
            const currentPlayerMoves = this._getAllPlayerMoves(this.state.currentPlayer);
            
            if (currentPlayerMoves.length === 0) {
                this.state.winner = getOpponent(this.state.currentPlayer);
            }
        }

        if (this.state.winner) {
            this.showResultScreen();
        }
    }

    showResultScreen() {
        this.config.onMessage('');
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
            const squareEl = this.dom.squares[move.to.row][move.to.col]; // Use stored square reference
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

    _checkKingPromotion(player, row) {
        return row === getEffectivePromotionRow(player, this.state.humanPlayerColor);
    }

    // --- Undo Functionality (for Single Player / Local) ---
    saveMoveHistory() {
        if (this.state.gameMode === 'online') return;

        const currentBoard = this.state.board.map(row => row.map(cell => cell ? { ...cell } : null));
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
            piecesData: currentPiecesData,
            selectedPieceData: this.state.selectedPiece ? {
                id: this.state.selectedPiece.id,
                row: this.state.selectedPiece.row,
                col: this.state.selectedPiece.col
            } : null,
            mandatoryCaptures: this.state.mandatoryCaptures.map(m => ({
                ...m,
                path: m.path.map(step => ({...step, captured: step.captured ? {...step.captured} : undefined})),
                capturedPieces: m.capturedPieces.map(p => ({...p}))
            })),
            winner: this.state.winner,
            humanPlayerColor: this.state.humanPlayerColor,
            aiPlayerColor: this.state.aiPlayerColor,
            gameMode: this.state.gameMode,
            aiDifficulty: this.state.aiDifficulty
        });

        if (this.state.moveHistory.length > 20) {
            this.state.moveHistory.shift();
        }
    }

    undoLastMove() {
        if (this.state.gameMode === 'online') {
            this.config.onMessage('Undo is not available in online mode.', 'red');
            return;
        }

        if (this.state.moveHistory.length <= 1) {
            this.config.onMessage('Cannot undo further.', 'red');
            return;
        }

        if (this.state.gameMode === 'ai' && this.state.moveHistory.length > 1) {
             this.state.moveHistory.pop();
             if (this.state.moveHistory.length <= 1) {
                this.config.onMessage('Cannot undo further.', 'red');
                return;
             }
        }
        
        const prevState = this.state.moveHistory.pop(); 
        
        if (prevState) {
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
            this.state.isOnlineGame = false;

            // Clear existing DOM pieces and re-render from saved state
            this.dom.boardContainer.querySelectorAll('.piece').forEach(p => p.remove()); // Clear all DOM pieces
            this.state.pieces = [];
            this.state.board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
            this.state.pieceCounter = 0;

            prevState.piecesData.forEach(pData => {
                const piece = new this.Piece(pData.id, pData.player, pData.row, pData.col);
                piece.isKing = pData.isKing;
                
                const targetSquareEl = this.dom.squares[piece.row][piece.col]; // Get the square DOM element
                if (targetSquareEl) {
                    piece.render(targetSquareEl, this.handlePieceClick.bind(this)); // Render to the specific square
                } else {
                    console.error(`Undo: Could not find DOM square for piece at (${piece.row}, ${piece.col})`);
                }
                
                this.state.board[piece.row][piece.col] = piece;
                this.state.pieces.push(piece);

                this.state.pieceCounter = Math.max(this.state.pieceCounter, pData.id + 1);
            });

            if (prevState.selectedPieceData) {
                const restoredSelectedPiece = this.state.pieces.find(p => p.id === prevState.selectedPieceData.id);
                if (restoredSelectedPiece && restoredSelectedPiece.element) { // Added element check
                    this.state.selectedPiece = restoredSelectedPiece;
                    restoredSelectedPiece.element.classList.add('selected');
                }
            }
            
            this.updateTurnIndicator();
            this.clearHighlights();
            this.config.onMessage('Last move undone.', 'blue');
        } else {
            // This 'else' block would be for if moveHistory becomes empty, which shouldn't happen with length <= 1 check.
            // But if it does, it tries to reset to a default from a non-existent prevState.
            // A more robust approach might be to just show the initial state if no more undos.
            console.warn("Undo failed: No previous state to restore. Resetting to initial game config.");
            this.resetGame(this.config); // Reset with current config
        }
    }
}