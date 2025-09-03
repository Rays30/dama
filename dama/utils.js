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

// REMOVED: animateMove function is no longer here.
/*
export const animateMove = (pieceElement, startRow, startCol, endRow, endCol, squareSize, resolve) => {
    // ... animation logic ...
};
*/

/**
 * Capitalizes the first letter of a string.
 * @param {string} str
 * @returns {string}
 */
export const capitalize = (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
};