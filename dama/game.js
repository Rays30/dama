// dama-main/dama/game.js

// REMOVED 'animateMove' from imports as we are now fully CSS-based for movement.
import { BOARD_SIZE, PLAYER_RED, PLAYER_BLUE, AI_DIFFICULTY, getOpponent, getEffectivePlayerDirection, getEffectivePromotionRow, deepCopyBoard } from './utils.js';
import { initializeAI } from './ai.js'; // Import the AI factory function

const DRAW_MOVES_THRESHOLD = 40;

export class DamaGame {
    constructor(boardContainerId, config) {
        this.dom = {
            boardContainer: document.getElementById(boardContainerId),
        };
        if (!this.dom.boardContainer) {
            console.error(`DamaGame: Board container with ID '${boardContainerId}' not found.`);
            return;
        }

        this.config = config;

        this.state = {
            board: [],
            pieces: [],
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
            pieceCounter: 0,
            movesSinceLastCaptureOrPawnMove: 0
        };

        this._createBoardDOM();
        this._initEventListeners();
        this.resetGame(config);
    }

    Piece = class {
        constructor(id, player, row, col) {
            this.id = id;
            this.player = player;
            this.row = row;
            this.col = col;
            this.isKing = false;
            this.element = null;
        }

        render(squareElement, handlePieceClickMethod) {
            if (!squareElement) {
                console.error(`Piece.render: Target square element for piece (${this.row}, ${this.col}) not found.`);
                return;
            }
            const pieceEl = document.createElement('div');
            pieceEl.classList.add('piece', this.player);
            if (this.isKing) {
                pieceEl.classList.add('king');
            }
            pieceEl.dataset.id = this.id;
            // No need to set data-row/col here initially, updatePosition will handle it
            
            this.element = pieceEl;
            squareElement.appendChild(pieceEl);

            pieceEl.addEventListener('click', (e) => handlePieceClickMethod(e, this));
            this.updatePosition(); // Initial positioning via data attributes for CSS
        }

        updatePosition() {
            if (this.element) {
                // CRITICAL: Update data attributes. CSS will handle the visual positioning and transitions.
                this.element.dataset.row = this.row;
                this.element.dataset.col = this.col;
                // Clear any inline transform that might be lingering from previous JS animations
                this.element.style.transform = ''; 
                this.element.style.transition = ''; 
            }
        }

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

    _createBoardDOM() {
        this.dom.boardContainer.innerHTML = '';

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const squareEl = document.createElement('div');
                squareEl.classList.add('square');
                squareEl.classList.add((r + c) % 2 === 0 ? 'light' : 'dark');
                squareEl.dataset.row = r.toString();
                squareEl.dataset.col = c.toString();
                this.dom.boardContainer.appendChild(squareEl);
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

    resetGame(config) {
        this.config = config;

        this.state.board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
        this.state.pieces = [];
        this.state.selectedPiece = null;
        this.state.possibleMoves = [];
        this.state.mandatoryCaptures = [];
        this.state.winner = null;
        this.state.moveHistory = [];
        this.state.pieceCounter = 0;
        this.state.movesSinceLastCaptureOrPawnMove = 0;

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
            console.log("[resetGame] Online game, loading initial board and turn from config. Human Player Color:", this.state.humanPlayerColor);
            this._loadBoardFromSerialized(config.initialBoard);
            this.state.currentPlayer = config.initialTurn;
            this.state.isMyTurn = (this.state.currentPlayer === this.state.humanPlayerColor);
        } else {
            console.log("[resetGame] Initializing standard board content. Human Player Color:", this.state.humanPlayerColor);
            this._initializeStandardBoardContent();
            this.state.currentPlayer = PLAYER_RED; 
            
            if (this.state.gameMode === 'ai') {
                 this.state.isMyTurn = (this.state.currentPlayer === this.state.humanPlayerColor);
            } else if (this.state.gameMode === 'local') {
                 this.state.isMyTurn = true; 
            } else {
                 this.state.isMyTurn = (this.state.currentPlayer === this.state.humanPlayerColor); 
            }
        }
        
        this._renderPieces();
        this.updateTurnIndicator();
        this.config.onMessage('');
        this.saveMoveHistory();

        if (this.state.gameMode === 'ai' && this.state.currentPlayer === this.state.aiPlayerColor) {
            setTimeout(() => this.makeAIMove(), 700);
        }
        console.log("Game reset and initialized. Client's Human Player Color:", this.state.humanPlayerColor, "Current Player:", this.state.currentPlayer, "Is My Turn:", this.state.isMyTurn);
    }

    _initializeStandardBoardContent() {
        this.state.board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
        this.state.pieces = [];
        this.state.pieceCounter = 0;

        let player1Color, player2Color;

        if (this.state.humanPlayerColor === PLAYER_RED) {
            player1Color = PLAYER_BLUE; // Opponent at top
            player2Color = PLAYER_RED;  // Human at bottom
        } else if (this.state.humanPlayerColor === PLAYER_BLUE) {
            player1Color = PLAYER_RED;  // Opponent at top
            player2Color = PLAYER_BLUE; // Human at bottom
        } else { // Default for 2-player local mode
            player1Color = PLAYER_BLUE; // Blue at top
            player2Color = PLAYER_RED;  // Red at bottom
        }
        
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if ((r + c) % 2 !== 0) { // Pieces only on dark squares
                    if (r < 3) { // Top 3 rows for Player 1
                        const piece = new this.Piece(this.state.pieceCounter++, player1Color, r, c);
                        this.state.pieces.push(piece);
                        this.state.board[r][c] = piece;
                    } else if (r >= BOARD_SIZE - 3) { // Bottom 3 rows for Player 2
                        const piece = new this.Piece(this.state.pieceCounter++, player2Color, r, c);
                        this.state.pieces.push(piece);
                        this.state.board[r][c] = piece;
                    }
                }
            }
        }
        console.log("Standard board content initialized. Total pieces:", this.state.pieces.length, "Top:", player1Color, "Bottom:", player2Color);
    }

    _loadBoardFromSerialized(serializedBoard) {
        this.state.board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
        this.state.pieces = [];
        this.state.pieceCounter = 0;

        console.log("[_loadBoardFromSerialized] Received serializedBoard:", serializedBoard);

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const serializedPiece = serializedBoard[r][c];
                if (serializedPiece) {
                    const player = serializedPiece.startsWith('R') ? PLAYER_RED : PLAYER_BLUE;
                    const isKing = serializedPiece.includes('K');
                    
                    const pieceId = this.state.pieceCounter++; 
                    const piece = new this.Piece(pieceId, player, r, c);
                    piece.isKing = isKing;
                    this.state.pieces.push(piece);
                    this.state.board[r][c] = piece;
                }
            }
        }
        console.log("Board content loaded from serialized data. Total pieces in client state:", this.state.pieces.length);
        this.state.pieces.forEach(p => console.log(`  Piece: ID ${p.id}, Player: ${p.player}, Pos: (${p.row},${p.col}), King: ${p.isKing}`));
    }

    _renderPieces() {
        this.dom.boardContainer.querySelectorAll('.piece').forEach(p => p.remove());

        this.state.pieces.forEach(piece => {
            const targetSquareEl = this.dom.boardContainer.querySelector(`.square[data-row="${piece.row}"][data-col="${piece.col}"]`);
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

        const perspectiveColor = this.state.humanPlayerColor || PLAYER_RED; // Standardize perspective
        
        const moves = this._getValidMovesForPiece(piece, perspectiveColor);
        this.state.mandatoryCaptures = this._findAllMandatoryCaptures(this.state.currentPlayer, perspectiveColor);

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
        if (this.state.selectedPiece && this.state.selectedPiece.element) {
            this.state.selectedPiece.element.classList.remove('selected');
            this.state.selectedPiece = null;
        }
        this.clearHighlights();
        if (this.state.mandatoryCaptures.length === 0) {
             this.config.onMessage('');
        }
    }


    _getValidMovesForPiece(piece, perspectiveColor) { // Takes perspectiveColor
        const moves = [];
        const isKing = piece.isKing;
        
        const pieceLogicalDirection = getEffectivePlayerDirection(piece.player, perspectiveColor);

        const regularMoveRowDirections = [pieceLogicalDirection];
        const allRowDirections = [-1, 1];
        const colDirections = [-1, 1];

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
                            isKingPromotion: this._checkKingPromotion(piece.player, newRow, perspectiveColor) // Pass perspective
                        });
                    }
                }
            }
        } else { // King piece
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

        for (const dr of allRowDirections) {
            for (const dc of colDirections) {
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
                            isKingPromotion: this._checkKingPromotion(piece.player, targetRow, perspectiveColor) // Pass perspective
                        });
                    }
                }
                
                if (isKing) {
                    for (let i = 1; i < BOARD_SIZE; i++) {
                        const checkRow = piece.row + i * dr;
                        const checkCol = piece.col + i * dc;

                        if (!this._isValidPosition(checkRow, checkCol)) break;

                        const currentPiece = currentBoard[checkRow][checkCol];

                        if (currentPiece && currentPiece.player !== piece.player) {
                            for (let j = i + 1; j < BOARD_SIZE; j++) {
                                const landRow = piece.row + j * dr;
                                const landCol = piece.col + j * dc;

                                if (!this._isValidPosition(landRow, landCol)) break;

                                if (!currentBoard[landRow][landCol]) {
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

    _getAllPlayerMoves(player, perspectiveColor) { // Now takes perspectiveColor
        console.log(`[_getAllPlayerMoves] Calculating moves for player: ${player}. Total pieces in state: ${this.state.pieces.length}, Perspective: ${perspectiveColor}`);
        let allCaptures = [];
        let allRegularMoves = [];
        let playerPiecesFound = 0;

        for (const piece of this.state.pieces) {
            if (piece.player === player) {
                playerPiecesFound++;
                const chains = this._getPieceCaptureChains(deepCopyBoard(this.state.board), piece, [], [], perspectiveColor); // Pass perspective
                if (chains.length > 0) {
                    allCaptures.push(...chains);
                }
                const pieceMoves = this._getValidMovesForPiece(piece, perspectiveColor); // Pass perspective
                const regularMovesForPiece = pieceMoves.filter(m => m.capturedPieces.length === 0);
                allRegularMoves.push(...regularMovesForPiece);
            }
        }

        console.log(`[_getAllPlayerMoves] Found ${playerPiecesFound} pieces for ${player}.`);

        if (allCaptures.length > 0) {
            const maxCaptures = Math.max(...allCaptures.map(chain => chain.capturedPieces.length));
            const filteredCaptures = allCaptures.filter(chain => chain.capturedPieces.length === maxCaptures);
            console.log(`[_getAllPlayerMoves] Found ${filteredCaptures.length} mandatory capture chains for ${player}.`);
            return filteredCaptures;
        }
        console.log(`[_getAllPlayerMoves] Found ${allRegularMoves.length} regular moves for ${player}.`);
        return allRegularMoves;
    }

    _findAllMandatoryCaptures(player, perspectiveColor) { // Now takes perspectiveColor
        return this._getAllPlayerMoves(player, perspectiveColor).filter(move => move.capturedPieces.length > 0);
    }

    _getPieceCaptureChains(currentBoard, piece, currentPath, capturedPieces, perspectiveColor) { // Now takes perspectiveColor
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
                            isKing: piece.isKing || getEffectivePromotionRow(piece.player, perspectiveColor) === targetRow // Pass perspective
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

                        const furtherChains = this._getPieceCaptureChains(nextBoardState, nextPieceState, newPath, newCapturedPieces, perspectiveColor); // Pass perspective

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

                        const currentPiece = currentBoard[checkRow][checkCol];

                        if (currentPiece && currentPiece.player !== piece.player) {
                            for (let j = i + 1; j < BOARD_SIZE; j++) {
                                const landRow = piece.row + j * dr;
                                const landCol = piece.col + j * dc;

                                if (!this._isValidPosition(landRow, landCol)) break;

                                if (!currentBoard[landRow][landCol]) {
                                    if (!capturedPieces.some(p => p.id === currentPiece.id)) {
                                        foundCaptureInThisStep = true;
                                        const newCapturedPieces = [...capturedPieces, { id: currentPiece.id }];

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
                                            captured: { row: checkRow, col: checkCol, id: currentPiece.id }
                                        }];

                                        const nextBoardState = deepCopyBoard(currentBoard);
                                        nextBoardState[checkRow][checkCol] = null;
                                        nextBoardState[piece.row][piece.col] = null;
                                        nextBoardState[landRow][landCol] = nextPieceState;

                                        const furtherChains = this._getPieceCaptureChains(nextBoardState, nextPieceState, newPath, newCapturedPieces, perspectiveColor);

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
                        } else if (currentPiece) {
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
                isKingPromotion: !piece.isKing && getEffectivePromotionRow(piece.player, perspectiveColor) === piece.row
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

        const isCapture = move.capturedPieces.length > 0;
        const isPawnMove = !piece.isKing;

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
            
            // --- CSS-BASED MOVEMENT ---
            // Update piece's JS state (row/col)
            piece.row = step.to.row;
            piece.col = step.to.col;
            // Update data attributes, CSS will transition the piece
            piece.updatePosition(); 
            await new Promise(resolve => setTimeout(resolve, 200)); // Small delay for visual transition
            // --- END CSS-BASED MOVEMENT ---

            if (move.path.length > 1 && step !== move.path[move.path.length - 1]) {
                 await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        this.state.board[piece.row][piece.col] = piece;

        if (move.isKingPromotion && !piece.isKing) {
            piece.promoteToKing();
        }

        if (move.capturedPieces.length > 0) {
            const perspectiveColor = this.state.humanPlayerColor || PLAYER_RED;
            const longestFurtherCaptures = this._findAllMandatoryCapturesForPieceAtLocation(piece, perspectiveColor);

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

        if (isCapture || isPawnMove) {
            this.state.movesSinceLastCaptureOrPawnMove = 0;
        } else {
            this.state.movesSinceLastCaptureOrPawnMove++;
        }

        if (!hasFurtherCaptures) {
            this.switchTurn();
        }
    }


    applyServerMove(serializedBoard, serverCurrentTurn, serverRedPiecesCount, serverBluePiecesCount) {
        console.log("[applyServerMove] Received from server: turn=", serverCurrentTurn, "redP=", serverRedPiecesCount, "blueP=", serverBluePiecesCount);
        console.log(`[applyServerMove] Client's humanPlayerColor: ${this.state.humanPlayerColor}`);

        this._loadBoardFromSerialized(serializedBoard);
        this.deselectPiece();
        this._renderPieces();

        this.state.currentPlayer = serverCurrentTurn;
        const perspectiveColor = this.state.humanPlayerColor || PLAYER_RED; // Use human perspective
        this.state.mandatoryCaptures = this._findAllMandatoryCaptures(this.state.currentPlayer, perspectiveColor);

        this.updateTurnIndicator();
        this.state.isMyTurn = (this.state.currentPlayer === this.state.humanPlayerColor);

        if (this.state.isMyTurn) {
            this.config.onMessage("It's your turn!", 'blue');
        } else {
            this.config.onMessage("Waiting for opponent...", 'blue');
        }

        console.log("[applyServerMove] Calling checkGameEnd after server move applied.");
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


    _findAllMandatoryCapturesForPieceAtLocation(piece, perspectiveColor) {
        const allChains = this._getPieceCaptureChains(deepCopyBoard(this.state.board), piece, [], [], perspectiveColor);
        
        if (allChains.length === 0) return [];

        const maxCaptures = Math.max(...allChains.map(chain => chain.capturedPieces.length));
        return allChains.filter(chain => chain.capturedPieces.length === maxCaptures);
    }


    switchTurn() {
        this.deselectPiece();
        this.state.currentPlayer = getOpponent(this.state.currentPlayer);
        this.updateTurnIndicator();
        
        const perspectiveColor = this.state.humanPlayerColor || PLAYER_RED;
        this.state.mandatoryCaptures = this._findAllMandatoryCaptures(this.state.currentPlayer, perspectiveColor);

        console.log("[switchTurn] Calling checkGameEnd after turn switch and counter update.");
        this.checkGameEnd();
        
        if (!this.state.winner) {
            if (this.state.mandatoryCaptures.length > 0) {
                this.config.onMessage(`${this.state.currentPlayer.toUpperCase()}'s turn. Mandatory capture!`);
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
        console.log("[checkGameEnd] --- Starting Game End Check ---");
        console.log("[checkGameEnd] Current Player:", this.state.currentPlayer);
        console.log("[checkGameEnd] Current Winner State:", this.state.winner);

        const redPieces = this.state.pieces.filter(p => p.player === PLAYER_RED).length;
        const bluePieces = this.state.pieces.filter(p => p.player === PLAYER_BLUE).length;

        console.log(`[checkGameEnd] Red Pieces: ${redPieces}, Blue Pieces: ${bluePieces}`);

        const redKings = this.state.pieces.filter(p => p.player === PLAYER_RED && p.isKing).length;
        const blueKings = this.state.pieces.filter(p => p.player === PLAYER_BLUE && p.isKing).length;
        const redPawns = redPieces - redKings;
        const bluePawns = bluePieces - blueKings;

        // 1. Check for standard win/loss (no pieces left)
        if (redPieces === 0) {
            this.state.winner = PLAYER_BLUE;
            this.reason = 'no_pieces';
            console.log("[checkGameEnd] WIN CONDITION: Red has no pieces. Blue wins.");
        } else if (bluePieces === 0) {
            this.state.winner = PLAYER_RED;
            this.reason = 'no_pieces';
            console.log("[checkGameEnd] WIN CONDITION: Blue has no pieces. Red wins.");
        } else {
            // 2. Check for draw condition (only kings left, and no progress for X moves)
            if (redPieces > 0 && bluePieces > 0 && redPawns === 0 && bluePawns === 0) {
                if (this.state.movesSinceLastCaptureOrPawnMove >= DRAW_MOVES_THRESHOLD) {
                    this.state.winner = 'draw';
                    this.reason = 'repetition';
                    this.config.onMessage("Draw by repetition!", 'orange');
                    console.log("[checkGameEnd] DRAW CONDITION: Repetition.");
                }
            }

            if (!this.state.winner) {
                console.log(`[checkGameEnd] Checking for legal moves for current player: ${this.state.currentPlayer}`);
                const perspectiveColor = this.state.humanPlayerColor || PLAYER_RED; // Use human perspective
                const currentPlayerMoves = this._getAllPlayerMoves(this.state.currentPlayer, perspectiveColor);
                
                console.log(`[checkGameEnd] ${this.state.currentPlayer} has ${currentPlayerMoves.length} legal moves.`);

                if (currentPlayerMoves.length === 0) {
                    this.state.winner = getOpponent(this.state.currentPlayer);
                    this.reason = 'no_legal_moves';
                    console.log(`[checkGameEnd] WIN CONDITION: ${this.state.currentPlayer} has no legal moves. ${this.state.winner} wins.`);
                }
            }
        }

        if (this.state.winner) {
            console.log("[checkGameEnd] Game has a winner/draw:", this.state.winner, "Reason:", this.reason);
            this.showResultScreen();
        } else {
            console.log("[checkGameEnd] No winner/draw yet. Game continues.");
        }
        console.log("[checkGameEnd] --- Finished Game End Check ---");
    }

    showResultScreen() {
        this.config.onMessage('');
        const redCount = this.state.pieces.filter(p => p.player === PLAYER_RED).length;
        const blueCount = this.state.pieces.filter(p => p.player === PLAYER_BLUE).length;
        this.config.onGameEnd(this.state.winner, redCount, blueCount, this.state.isOnlineGame);
    }

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

    _isValidPosition(row, col) {
        return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
    }

    _checkKingPromotion(player, row, perspectiveColor) {
        return row === getEffectivePromotionRow(player, perspectiveColor);
    }

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
            aiDifficulty: this.state.aiDifficulty,
            movesSinceLastCaptureOrPawnMove: this.state.movesSinceLastCaptureOrPawnMove
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
            this.state.movesSinceLastCaptureOrPawnMove = prevState.movesSinceLastCaptureOrPawnMove;


            this.dom.boardContainer.querySelectorAll('.piece').forEach(p => p.remove());
            this.state.pieces = [];
            this.state.board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
            this.state.pieceCounter = 0;

            prevState.piecesData.forEach(pData => {
                const piece = new this.Piece(pData.id, pData.player, pData.row, pData.col);
                piece.isKing = pData.isKing;
                
                const targetSquareEl = this.dom.boardContainer.querySelector(`.square[data-row="${piece.row}"][data-col="${piece.col}"]`);
                if (targetSquareEl) {
                    piece.render(targetSquareEl, this.handlePieceClick.bind(this));
                } else {
                    console.error(`Undo: Could not find DOM square for piece at (${piece.row}, ${pData.col})`);
                }
                
                this.state.board[piece.row][piece.col] = piece;
                this.state.pieces.push(piece);

                this.state.pieceCounter = Math.max(this.state.pieceCounter, pData.id + 1);
            });

            if (prevState.selectedPieceData) {
                const restoredSelectedPiece = this.state.pieces.find(p => p.id === prevState.selectedPieceData.id);
                if (restoredSelectedPiece && restoredSelectedPiece.element) {
                    this.state.selectedPiece = restoredSelectedPiece;
                    restoredSelectedPiece.element.classList.add('selected');
                }
            }
            
            this.updateTurnIndicator();
            this.clearHighlights();
            this.config.onMessage('Last move undone.', 'blue');
        } else {
            console.warn("Undo failed: No previous state to restore. Resetting to initial game config.");
            this.resetGame({
                mode: 'local',
                playerColor: PLAYER_BLUE,
                onTurnChange: this.config.onTurnChange,
                onGameEnd: this.config.onGameEnd,
                onMessage: this.config.onMessage,
                onUndoVisibility: this.config.onUndoVisibility
            });
        }
    }
}