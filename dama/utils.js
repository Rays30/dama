// dama/client/utils.js

// CRITICAL FIX: Import nanoid from a CDN for browser compatibility
import { nanoid } from 'https://cdn.jsdelivr.net/npm/nanoid/nanoid.js';

// Board constants (ensure these match server-side logic if applicable)
export const BOARD_SIZE = 8;
export const PLAYER_RED = 'red';
export const PLAYER_BLUE = 'blue';

// AI Difficulties (can be expanded)
export const AI_DIFFICULTY = {
    EASY: 2,
    MEDIUM: 4,
    HARD: 6
};

/**
 * Generates a collision-resistant unique ID.
 * @param {number} length - The desired length of the ID.
 * @returns {string}
 */
export const generateId = (length = 7) => nanoid(length);


/**
 * Returns the opponent's color.
 * @param {'red'|'blue'} player
 * @returns {'red'|'blue'}
 */
export const getOpponent = (player) => {
    return player === PLAYER_RED ? PLAYER_BLUE : PLAYER_RED;
};


/**
 * Determines the logical forward direction for a piece based on the *display perspective*.
 * In a standard Dama game, pieces move "up" the board towards the opponent.
 * If the perspective is 'red' (red at bottom), red moves up (-1), blue moves down (+1).
 * If the perspective is 'blue' (blue at bottom), blue moves up (-1), red moves +1 (down).
 *
 * @param {'red'|'blue'} piecePlayer - The actual color of the piece.
 * @param {'red'|'blue'} displayPerspectiveColor - The color that is displayed at the bottom of the board (this client's perspective).
 * @returns {number} -1 (up) or 1 (down).
 */
export const getEffectivePlayerDirection = (piecePlayer, displayPerspectiveColor) => {
    if (displayPerspectiveColor === PLAYER_RED) {
        return piecePlayer === PLAYER_RED ? -1 : 1;
    } else { // displayPerspectiveColor === PLAYER_BLUE
        return piecePlayer === PLAYER_BLUE ? -1 : 1;
    }
};

/**
 * Determines the promotion row for a piece based on the *display perspective*.
 *
 * @param {'red'|'blue'} piecePlayer - The actual color of the piece.
 * @param {'red'|'blue'} displayPerspectiveColor - The color that is displayed at the bottom of the board (this client's perspective).
 * @returns {number} The row index (0 or 7) where a piece promotes.
 */
export const getEffectivePromotionRow = (piecePlayer, displayPerspectiveColor) => {
    if (displayPerspectiveColor === PLAYER_RED) {
        return piecePlayer === PLAYER_RED ? 0 : 7;
    } else { // displayPerspectiveColor === PLAYER_BLUE
        return piecePlayer === PLAYER_BLUE ? 0 : 7;
    }
};

/**
 * Creates a deep copy of the board array to avoid mutation during AI searches.
 * @param {Array<Array<object|null>>} board - The 2D board array.
 * @returns {Array<Array<object|null>>} A deep copy.
 */
export const deepCopyBoard = (board) => {
    return board.map(row => row.map(piece => piece ? { ...piece } : null));
};

/**
 * Animates a piece moving from one square to another using CSS transforms.
 * @param {HTMLElement} pieceElement - The DOM element of the piece.
 * @param {number} startRow - The starting row.
 * @param {number} startCol - The starting column.
 * @param {number} endRow - The ending row.
 * @param {number} endCol - The ending column.
 * @param {number} squareSize - The calculated size of a board square in pixels.
 * @param {Function} resolve - Callback to execute when animation is complete.
 */
export const animateMove = (pieceElement, startRow, startCol, endRow, endCol, squareSize, resolve) => {
    // Current position in pixels relative to boardContainer
    const startX = startCol * squareSize + (squareSize / 2); // Center of square
    const startY = startRow * squareSize + (squareSize / 2);

    // Target position in pixels relative to boardContainer
    const endX = endCol * squareSize + (squareSize / 2); // Center of square
    const endY = endRow * squareSize + (squareSize / 2);

    // Set initial position for animation, centered *within* the starting square
    // This transform is relative to the piece's natural position (top:50%, left:50% from its square)
    // We need to calculate the *offset* from its own square's center.
    // The piece's CSS already centers it within its square.
    // We want to translate it relative to the board grid.

    // A simpler approach for this animateMove is to let it manipulate the piece directly
    // and then reset its transform when done.

    // Ensure initial transform is based on its current square's top:50%/left:50%
    pieceElement.style.transition = `none`; // Temporarily remove transition for immediate snap to start
    pieceElement.style.transform = `translate(-50%, -50%)`; // Reset to be centered in its square
    void pieceElement.offsetWidth; // Force reflow

    // Now apply the animation transform to move it relative to its starting point
    // This transform calculates the delta needed to move it to the *new* square's center
    const deltaX = (endCol - startCol) * squareSize;
    const deltaY = (endRow - startRow) * squareSize;

    pieceElement.style.transition = `transform 0.2s ease-out`; // Add transition for smooth animation
    pieceElement.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;


    const onTransitionEnd = () => {
        pieceElement.removeEventListener('transitionend', onTransitionEnd);
        pieceElement.style.transition = ''; // Remove transition style
        // IMPORTANT: The caller (executeMove) must handle re-parenting and resetting transform to default
        resolve();
    };

    pieceElement.addEventListener('transitionend', onTransitionEnd);
};


/**
 * Capitalizes the first letter of a string.
 * @param {string} str
 * @returns {string}
 */
export const capitalize = (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
};