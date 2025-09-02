// utils.js
export const BOARD_SIZE = 8;
export const PIECES_PER_PLAYER = 12;

export const PLAYER_RED = 'red';
export const PLAYER_BLUE = 'blue';

export const AI_DIFFICULTY = {
    EASY: 'easy',
    MEDIUM: 'medium',
    HARD: 'hard'
};

export function getOpponent(player) {
    return player === PLAYER_RED ? PLAYER_BLUE : PLAYER_RED;
}

/**
 * Determines the effective "forward" movement direction for a piece.
 * This depends on whether the piece's color is at the bottom or top of the board.
 * Assumes the 'humanPlayerColor' is always at the bottom (moves up).
 * @param {string} piecePlayerColor - The color of the piece in question.
 * @param {string} humanPlayerColor - The color chosen by the human player (at the bottom).
 * @returns {number} -1 for upwards movement (towards row 0), 1 for downwards movement (towards row BOARD_SIZE - 1).
 */
export function getEffectivePlayerDirection(piecePlayerColor, humanPlayerColor) {
    // If humanPlayerColor is null (e.g., local 2-player or server hasn't assigned in online)
    // Red traditionally moves up (towards 0), Blue moves down (towards 7)
    if (!humanPlayerColor) {
        return piecePlayerColor === PLAYER_RED ? -1 : 1;
    }

    if (piecePlayerColor === humanPlayerColor) { // If it's the player at the bottom
        return -1; // Move upwards towards row 0
    } else { // If it's the player at the top
        return 1; // Move downwards towards row BOARD_SIZE - 1
    }
}

/**
 * Determines the effective promotion row for a piece.
 * This depends on whether the piece's color is at the bottom or top of the board.
 * Assumes the 'humanPlayerColor' is always at the bottom.
 * @param {string} piecePlayerColor - The color of the piece in question.
 * @param {string} humanPlayerColor - The color chosen by the human player (at the bottom).
 * @returns {number} The row index (0 or BOARD_SIZE - 1) where the piece promotes.
 */
export function getEffectivePromotionRow(piecePlayerColor, humanPlayerColor) {
    if (!humanPlayerColor) {
        return piecePlayerColor === PLAYER_RED ? 0 : BOARD_SIZE - 1;
    }

    if (piecePlayerColor === humanPlayerColor) { // If it's the player at the bottom
        return 0; // Promote at row 0
    } else { // If it's the player at the top
        return BOARD_SIZE - 1; // Promote at row BOARD_SIZE - 1
    }
}


// Function to deep copy a board state for AI simulation
export function deepCopyBoard(board) {
    const newBoard = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const piece = board[r][c];
            if (piece) {
                newBoard[r][c] = {
                    id: piece.id,
                    player: piece.player,
                    row: piece.row,
                    col: piece.col,
                    isKing: piece.isKing
                };
            }
        }
    }
    return newBoard;
}

// Helper for animations (e.g., waiting for piece movement to complete)
export function animateMove(element, fromRow, fromCol, toRow, toCol, onComplete) {
    const squareSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--square-size'));

    const endX = toCol * squareSize;
    const endY = toRow * squareSize;
    
    element.style.transition = 'transform 0.3s ease-in-out';
    element.style.transform = `translate(${endX}px, ${endY}px)`;

    element.addEventListener('transitionend', function handler() {
        element.removeEventListener('transitionend', handler);
        element.style.transition = ''; // Remove transition to allow instant repositioning later
        onComplete();
    });
}

/**
 * Capitalizes the first letter of a string.
 * @param {string} str
 * @returns {string}
 */
export function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}