import { nanoid } from 'nanoid';

/**
 * Generates a collision-resistant unique ID.
 * @param {number} length - The desired length of the ID.
 * @returns {string}
 */
export const generateId = (length = 7) => nanoid(length);