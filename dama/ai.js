// ai.js
// Implements the AI using the Minimax algorithm with Alpha-Beta Pruning.

import { BOARD_SIZE, PLAYER_RED, PLAYER_BLUE, getOpponent, deepCopyBoard, AI_DIFFICULTY, getEffectivePlayerDirection, getEffectivePromotionRow } from './utils.js';

class AI {
    constructor(difficulty, humanPlayerColor) { // Constructor now accepts humanPlayerColor
        this.difficulty = difficulty;
        this.maxDepth = this._getDepthByDifficulty(difficulty);
        this.humanPlayerColor = humanPlayerColor; // Store for internal use
        this.aiPlayerColor = getOpponent(humanPlayerColor); // Store AI's color
    }

    _getDepthByDifficulty(difficulty) {
        switch (difficulty) {
            case AI_DIFFICULTY.EASY: return 2;
            case AI_DIFFICULTY.MEDIUM: return 4;
            case AI_DIFFICULTY.HARD: return 6;
            default: return 2;
        }
    }

    // Main AI function to determine the best move
    getBestMove(board, aiPlayer, humanPlayer) {
        let bestScore = -Infinity;
        let bestMove = null;
        let allMoves = this._getAllPossibleMoves(board, aiPlayer);

        if (allMoves.length === 0) {
            return null; // AI has no moves, indicates loss
        }

        // Prioritize mandatory captures
        const mandatoryCaptures = allMoves.filter(move => move.capturedPieces && move.capturedPieces.length > 0);
        if (mandatoryCaptures.length > 0) {
            allMoves = mandatoryCaptures;
        }

        // Shuffle moves to add some randomness for equal scores, especially for Easy/Medium
        if (this.difficulty === AI_DIFFICULTY.EASY || this.difficulty === AI_DIFFICULTY.MEDIUM) {
            allMoves.sort(() => Math.random() - 0.5);
        }

        for (const move of allMoves) {
            const newBoard = this._applyMoveToBoard(board, move);
            const score = this._minimax(newBoard, this.maxDepth, -Infinity, Infinity, false, aiPlayer, humanPlayer);

            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }
        return bestMove;
    }

    // Minimax algorithm with Alpha-Beta Pruning
    _minimax(board, depth, alpha, beta, isMaximizingPlayer, aiPlayer, humanPlayer) {
        // --- Added Game Over Check before getting moves for robustness ---
        const gameStatusAI = this._isGameOver(board, aiPlayer);
        const gameStatusHuman = this._isGameOver(board, humanPlayer);

        if (depth === 0 || gameStatusAI || gameStatusHuman) {
            return this._evaluateBoard(board, aiPlayer, humanPlayer);
        }

        const currentPlayer = isMaximizingPlayer ? aiPlayer : humanPlayer;
        let allMoves = this._getAllPossibleMoves(board, currentPlayer);
        
        // If a player has no moves, it's a loss for that player in this branch
        if (allMoves.length === 0) {
             return this._evaluateBoard(board, aiPlayer, humanPlayer); // Opponent wins or loses based on context
        }

        if (isMaximizingPlayer) {
            let maxEval = -Infinity;
            for (const move of allMoves) {
                const newBoard = this._applyMoveToBoard(board, move);
                const evaluation = this._minimax(newBoard, depth - 1, alpha, beta, false, aiPlayer, humanPlayer);
                maxEval = Math.max(maxEval, evaluation);
                alpha = Math.max(alpha, evaluation);
                if (beta <= alpha) {
                    break; // Beta Cut-off
                }
            }
            return maxEval;
        } else {
            let minEval = Infinity;
            for (const move of allMoves) {
                const newBoard = this._applyMoveToBoard(board, move);
                const evaluation = this._minimax(newBoard, depth - 1, alpha, beta, true, aiPlayer, humanPlayer);
                minEval = Math.min(minEval, evaluation);
                beta = Math.min(beta, evaluation);
                if (beta <= alpha) {
                    break; // Alpha Cut-off
                }
            }
            return minEval;
        }
    }

    // Evaluate the board state
    _evaluateBoard(board, aiPlayer, humanPlayer) {
        let score = 0;
        let aiPieces = 0;
        let aiKings = 0;
        let humanPieces = 0;
        let humanKings = 0;

        // Get effective promotion row for AI and Human to evaluate positional advantage
        const aiPromotionRow = getEffectivePromotionRow(aiPlayer, this.humanPlayerColor);
        const humanPromotionRow = getEffectivePromotionRow(humanPlayer, this.humanPlayerColor);

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const piece = board[r][c];
                if (piece) {
                    if (piece.player === aiPlayer) {
                        aiPieces++;
                        score += 10; // Base score for each piece
                        if (piece.isKing) {
                            aiKings++;
                            score += 15; // Bonus for kings
                        }
                        // Positional advantage: pieces moving forward get more value
                        // If AI moves upwards (towards row 0), higher value for lower row numbers
                        if (getEffectivePlayerDirection(aiPlayer, this.humanPlayerColor) === -1) {
                            score += (BOARD_SIZE - 1 - r); // Closer to row 0 is better
                        } else { // If AI moves downwards (towards row BOARD_SIZE - 1), higher value for higher row numbers
                            score += r; // Closer to row BOARD_SIZE - 1 is better
                        }
                    } else if (piece.player === humanPlayer) {
                        humanPieces++;
                        score -= 10;
                        if (piece.isKing) {
                            humanKings++;
                            score -= 15;
                        }
                        // Positional disadvantage for opponent pieces
                        if (getEffectivePlayerDirection(humanPlayer, this.humanPlayerColor) === -1) {
                            score -= (BOARD_SIZE - 1 - r);
                        } else {
                            score -= r;
                        }
                    }
                }
            }
        }

        // Win/Loss condition - give high preference
        if (humanPieces === 0) {
            return Infinity; // AI wins
        }
        if (aiPieces === 0) {
            return -Infinity; // AI loses
        }
        
        // If current player (simulating for AI) has no moves, it's a loss
        const aiHasMoves = this._getAllPossibleMoves(board, aiPlayer).length > 0;
        const humanHasMoves = this._getAllPossibleMoves(board, humanPlayer).length > 0;

        if (!aiHasMoves && aiPieces > 0) { // AI has pieces but no moves
            return -Infinity; // AI loses
        }
        if (!humanHasMoves && humanPieces > 0) { // Human has pieces but no moves
            return Infinity; // AI wins
        }


        // Add a small bonus for having more kings or pieces
        score += (aiKings - humanKings) * 5;
        score += (aiPieces - humanPieces) * 2;

        return score;
    }

    // Get all possible moves for a given player on a given board state
    _getAllPossibleMoves(board, player) {
        let allCaptures = [];
        let allRegularMoves = [];

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const piece = board[r][c];
                if (piece && piece.player === player) {
                    // Explore full capture chains for this piece
                    const chains = this._getPieceCaptureChains(board, piece, [], []);
                    if (chains.length > 0) {
                        allCaptures.push(...chains);
                    }
                    // Get regular moves for this piece (only if no captures are mandatory for the piece)
                    const pieceMoves = this._getPieceMoves(board, piece);
                    const regularMovesForPiece = pieceMoves.filter(m => m.capturedPieces.length === 0);
                    allRegularMoves.push(...regularMovesForPiece);
                }
            }
        }

        if (allCaptures.length > 0) {
            // Find the maximum number of captured pieces in any chain
            const maxCaptures = Math.max(...allCaptures.map(chain => chain.capturedPieces.length));
            // Return only those chains that achieve the maximum number of captures
            return allCaptures.filter(chain => chain.capturedPieces.length === maxCaptures);
        }
        return allRegularMoves; // If no captures possible, return regular moves
    }

    // Recursive helper to find all possible capture chains for a piece
    _getPieceCaptureChains(board, piece, currentPath, capturedPieces) {
        const chains = [];
        const isKing = piece.isKing;
        
        let foundCaptureInThisStep = false;
        
        // Use all four diagonal directions for exploring captures (forward/backward)
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
                    const captured = board[capturedRow][capturedCol]; // Check if there's a piece here
                    const target = board[targetRow][targetCol];       // Check if target is empty

                    // Check if there's an opponent piece to capture and target square is empty
                    // IMPORTANT FIX: Use captured.id to prevent re-capturing the same piece in a chain
                    if (captured && captured.player !== piece.player && !target &&
                        !capturedPieces.some(p => p.id === captured.id)) { 
                        
                        foundCaptureInThisStep = true;
                        // Store only the ID of the captured piece for comparison
                        const newCapturedPieces = [...capturedPieces, { id: captured.id }];
                        
                        const nextPieceState = { // Simulate piece state for next recursion
                            id: piece.id, // Keep original ID for consistency
                            player: piece.player,
                            row: targetRow,
                            col: targetCol,
                            isKing: piece.isKing || this._checkKingPromotionInSim(piece.player, targetRow)
                        };

                        const newPath = [...currentPath, {
                            from: { row: piece.row, col: piece.col },
                            to: { row: targetRow, col: targetCol },
                            captured: { row: capturedRow, col: capturedCol, id: captured.id }
                        }];

                        // Simulate the move on a temporary board for recursion
                        const nextBoardState = deepCopyBoard(board);
                        nextBoardState[capturedRow][capturedCol] = null; // Remove captured piece
                        nextBoardState[piece.row][piece.col] = null; // Remove the moving piece from its *current* simulated position
                        nextBoardState[targetRow][targetCol] = nextPieceState; // Place at new position

                        // Recursively find further captures FROM THE NEW POSITION (nextPieceState)
                        const furtherChains = this._getPieceCaptureChains(nextBoardState, nextPieceState, newPath, newCapturedPieces);

                        if (furtherChains.length > 0) {
                            chains.push(...furtherChains);
                        } else {
                            chains.push({
                                piece: { ...piece }, // Original piece info
                                path: newPath,
                                to: { row: nextPieceState.row, col: nextPieceState.col }, // Final destination
                                capturedPieces: newCapturedPieces,
                                isKingPromotion: nextPieceState.isKing && !piece.isKing // Only if promoted during this capture
                            });
                        }
                    }
                }
                
                // King flying capture logic (only for kings)
                if (isKing) {
                    for (let i = 1; i < BOARD_SIZE; i++) {
                        const checkRow = piece.row + i * dr;
                        const checkCol = piece.col + i * dc;

                        if (!this._isValidPosition(checkRow, checkCol)) break;

                        const currentPiece = board[checkRow][checkCol]; // Check if there's a piece here

                        if (currentPiece && currentPiece.player !== piece.player) {
                            for (let j = i + 1; j < BOARD_SIZE; j++) {
                                const landRow = piece.row + j * dr;
                                const landCol = piece.col + j * dc;

                                if (!this._isValidPosition(landRow, landCol)) break;

                                if (!board[landRow][landCol]) { // Check if landing square is empty
                                    // IMPORTANT FIX: Use currentPiece.id
                                    if (!capturedPieces.some(p => p.id === currentPiece.id)) { 
                                        foundCaptureInThisStep = true;
                                        // Store only the ID of the captured piece
                                        const newCapturedPieces = [...capturedPieces, { id: currentPiece.id }];

                                        const nextPieceState = {
                                            id: piece.id,
                                            player: piece.player,
                                            row: landRow,
                                            col: landCol,
                                            isKing: true, // King stays king
                                        };

                                        const newPath = [...currentPath, {
                                            from: { row: piece.row, col: piece.col },
                                            to: { row: landRow, col: landCol },
                                            captured: { row: checkRow, col: checkCol, id: currentPiece.id }
                                        }];

                                        const nextBoardState = deepCopyBoard(board);
                                        nextBoardState[checkRow][checkCol] = null; // Remove captured piece
                                        nextBoardState[piece.row][piece.col] = null; // Remove moving piece
                                        nextBoardState[landRow][landCol] = nextPieceState; // Place at new position

                                        // Recursively find further captures FROM THE NEW POSITION (nextPieceState)
                                        const furtherChains = this._getPieceCaptureChains(nextBoardState, nextPieceState, newPath, newCapturedPieces);

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
                                    // Blocked by another piece after the potential capture, cannot land here
                                    break;
                                }
                            }
                            // Found the first opponent piece, then break this loop to find landing spots after it
                            break; 
                        } else if (currentPiece) {
                            // Blocked by own piece before finding an opponent piece
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
                piece: { ...piece }, // Original piece info that started the chain
                path: currentPath,
                to: { row: piece.row, col: piece.col }, // Final destination
                capturedPieces: capturedPieces,
                // Check promotion by seeing if final position promotes and initial piece wasn't king
                // Fix: This condition should check the *final* row of the chain for promotion, not the piece's initial row.
                // And ensure 'piece' itself is not already a king.
                isKingPromotion: !piece.isKing && this._checkKingPromotionInSim(piece.player, piece.row) 
            });
        }

        return chains;
    }


    // Get all valid moves (regular or capture) for a single piece
    _getPieceMoves(board, piece) {
        const moves = [];
        const isKing = piece.isKing;
        // Use the new helper to get the piece's logical forward direction
        const pieceLogicalDirection = getEffectivePlayerDirection(piece.player, this.humanPlayerColor);

        // Directions for regular non-capturing moves (forward only for regular pieces)
        const regularMoveRowDirections = [pieceLogicalDirection];
        // Directions for all diagonal checks (captures and king moves)
        const allRowDirections = [-1, 1];
        const colDirections = [-1, 1];

        // 1. Check for Regular Moves (non-capturing)
        if (!isKing) { // Only regular pieces make non-king moves
            for (const dr of regularMoveRowDirections) { // Forward only
                for (const dc of colDirections) {
                    const newRow = piece.row + dr;
                    const newCol = piece.col + dc;

                    if (this._isValidPosition(newRow, newCol) && !board[newRow][newCol]) {
                        moves.push({
                            piece: { ...piece },
                            path: [{ from: { row: piece.row, col: piece.col }, to: { row: newRow, col: newCol } }],
                            to: { row: newRow, col: newCol },
                            capturedPieces: [],
                            isKingPromotion: this._checkKingPromotionInSim(piece.player, newRow)
                        });
                    }
                }
            }
        } else { // King piece - can move multiple squares (any diagonal)
            for (const dr of allRowDirections) { // Forward or backward
                for (const dc of colDirections) {
                    for (let i = 1; i < BOARD_SIZE; i++) {
                        const kingRow = piece.row + i * dr;
                        const kingCol = piece.col + i * dc;
                        if (this._isValidPosition(kingRow, kingCol) && !board[kingRow][kingCol]) {
                            moves.push({
                                piece: { ...piece },
                                path: [{ from: { row: piece.row, col: piece.col }, to: { row: kingRow, col: kingCol } }],
                                to: { row: kingRow, col: kingCol },
                                capturedPieces: [],
                                isKingPromotion: false // Kings are already kings, no further promotion
                            });
                        } else {
                            break; // Blocked by another piece or board edge
                        }
                    }
                }
            }
        }

        // 2. Check for Captures (Regular and King)
        // Use allRowDirections here for 'dr' to allow regular pieces to capture backward
        for (const dr of allRowDirections) {
            for (const dc of colDirections) {
                // Standard single-jump capture
                const capturedRow = piece.row + dr;
                const capturedCol = piece.col + dc;
                const targetRow = piece.row + 2 * dr;
                const targetCol = piece.col + 2 * dc;

                if (this._isValidPosition(targetRow, targetCol) &&
                    this._isValidPosition(capturedRow, capturedCol)) {

                    const capturedPiece = board[capturedRow][capturedCol];
                    const targetSquare = board[targetRow][targetCol];

                    if (capturedPiece && capturedPiece.player !== piece.player && !targetSquare) {
                        moves.push({
                            piece: { ...piece },
                            path: [{ from: { row: piece.row, col: piece.col }, to: { row: targetRow, col: targetCol }, captured: { row: capturedRow, col: capturedCol } }],
                            to: { row: targetRow, col: targetCol },
                            capturedPieces: [{ ...capturedPiece }],
                            isKingPromotion: this._checkKingPromotionInSim(piece.player, targetRow)
                        });
                    }
                }
                
                // King flying capture logic (only for kings)
                if (isKing) {
                    for (let i = 1; i < BOARD_SIZE; i++) {
                        const checkRow = piece.row + i * dr;
                        const checkCol = piece.col + i * dc;

                        if (!this._isValidPosition(checkRow, checkCol)) break;

                        const currentPiece = board[checkRow][checkCol];

                        if (currentPiece && currentPiece.player !== piece.player) {
                            for (let j = i + 1; j < BOARD_SIZE; j++) {
                                const landRow = piece.row + j * dr;
                                const landCol = piece.col + j * dc;

                                if (!this._isValidPosition(landRow, landCol)) break;

                                if (!board[landRow][landCol]) {
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

    // Apply a move to a simulated board
    _applyMoveToBoard(board, move) {
        const newBoard = deepCopyBoard(board);
        
        // Find the actual piece object on the board using its ID, to handle cases where row/col might have shifted
        // This is important because 'move.piece' is a copy of the piece at the start of the *entire move*,
        // not its current location in a chain simulation.
        let pieceOnBoard = null;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (newBoard[r][c] && newBoard[r][c].id === move.piece.id) {
                    pieceOnBoard = newBoard[r][c];
                    break;
                }
            }
            if (pieceOnBoard) break;
        }

        if (!pieceOnBoard) {
            // This is a critical error and indicates a desynchronization or logical flaw.
            // It might mean the piece was already removed or never existed at the expected location.
            // For now, log a warning and return original board to prevent further errors.
            console.error("AI._applyMoveToBoard: Piece with ID", move.piece.id, "not found on board at any location. Cannot apply move.", move);
            return board; // Return original board to avoid null reference issues
        }

        // --- Important: Remove the piece from its current location on the board BEFORE simulating its path ---
        newBoard[pieceOnBoard.row][pieceOnBoard.col] = null;

        // --- Simulate the piece's state as it moves through the path ---
        let currentPieceState = { ...pieceOnBoard }; // Start with the piece's state *from the board*

        for (const step of move.path) {
            if (step.captured) {
                // Remove captured piece from its spot on the board
                if (newBoard[step.captured.row][step.captured.col]) {
                     newBoard[step.captured.row][step.captured.col] = null; 
                }
            }
            
            // Update piece's simulated position
            currentPieceState.row = step.to.row;
            currentPieceState.col = step.to.col;

            // Check for promotion during the move
            if (!currentPieceState.isKing && this._checkKingPromotionInSim(currentPieceState.player, currentPieceState.row)) {
                currentPieceState.isKing = true;
            }
        }
        // Place piece at its final position
        newBoard[currentPieceState.row][currentPieceState.col] = currentPieceState;

        return newBoard;
    }

    // Check if game is over on a simulated board
    _isGameOver(board, player) {
        let piecesCount = 0;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c] && board[r][c].player === player) {
                    piecesCount++;
                }
            }
        }
        if (piecesCount === 0) return true; // Player has no pieces

        // Check if player has any valid moves
        return this._getAllPossibleMoves(board, player).length === 0;
    }

    _isValidPosition(row, col) {
        return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
    }

    // Uses the new helper for dynamic promotion row
    _checkKingPromotionInSim(player, row) {
        const promotionRow = getEffectivePromotionRow(player, this.humanPlayerColor);
        return row === promotionRow;
    }
}

// Export a factory function that returns an instance of your AI class
export function initializeAI(difficulty, humanPlayerColor) {
    return new AI(difficulty, humanPlayerColor);
}