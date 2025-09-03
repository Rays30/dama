// dama/server/utils/id.js
// CRITICAL FIX: Import nanoid as a Node.js module
import { nanoid } from 'nanoid'; 

// Function to generate a short, URL-friendly ID
export function generateId(length = 10) {
    return nanoid(length);
}