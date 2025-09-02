// FILE: dama/main.js
import * as Utils from './utils.js';
import { DamaGame } from './game.js'; // Your main game logic class/object

// Corrected import: 'leaveOnlineLobbyConnection' is now the exported function
import { initLobbyUI, updateConnectionStatus, leaveOnlineLobbyConnection } from './client/lobby/lobby.js';
import { getSocket, isSocketConnected, disconnectSocket } from './client/net/socket.js';

// --- Global UI Elements ---
const gameContainer = document.getElementById('game-container');
const screens = document.querySelectorAll('.screen'); // All screens with the 'screen' class

const mainMenu = document.getElementById('main-menu');
const btnSinglePlayer = document.getElementById('btn-single-player');
const btnTwoPlayer = document.getElementById('btn-two-player');
const btnChallengeFriend = document.getElementById('btn-challenge-friend');

const singlePlayerMenu = document.getElementById('single-player-menu');
const btnPlayAsRed = document.getElementById('btn-play-as-red');
const btnPlayAsBlue = document.getElementById('btn-play-as-blue');
const difficultySelection = singlePlayerMenu.querySelector('.difficulty-selection');
const difficultyHeader = document.getElementById('difficulty-header');
const chosenAiColorSpan = document.getElementById('chosen-ai-color'); // Span to show chosen color
const difficultyButtons = difficultySelection.querySelectorAll('button');

const onlineMenu = document.getElementById('online-menu');
const btnShowCreateLobby = document.getElementById('btn-show-create-lobby'); // Button to open Create Lobby modal

const gameScreen = document.getElementById('game-screen');
const turnIndicator = document.getElementById('turn-indicator');
const messageArea = document.getElementById('message-area');
const btnUndo = document.getElementById('btn-undo');
const btnBackToMenuGame = document.getElementById('btn-back-to-menu');

const resultScreen = document.getElementById('result-screen');
const winnerMessage = document.getElementById('winner-message');
const scoreMessage = document.getElementById('score-message');
const btnRematch = document.getElementById('btn-rematch');
const btnNewGame = document.getElementById('btn-new-game');

// --- MODAL UI Elements (NEW) ---
const modalBackdrop = document.getElementById('modal-backdrop');

// Create Lobby Modal
const createLobbyModal = document.getElementById('create-lobby-modal');
const btnCloseCreateLobby = createLobbyModal.querySelector('.close-btn'); // Close button inside modal
const btnCancelCreateLobby = createLobbyModal.querySelector('.btn-cancel-create-lobby'); // Cancel button inside modal
// Note: btn-create-lobby-submit-modal is inside the modal but handles form submission, not just closing.

// Share Game Code Modal
const shareGameCodeModal = document.getElementById('share-game-code-modal');
const btnCloseShareCode = shareGameCodeModal.querySelector('.close-btn'); // Close button inside modal
const cancelOnlineGameModal = document.getElementById('cancel-online-game-modal'); // Cancel button inside modal


// --- Game State Variables ---
let currentGameMode = null; // 'ai', 'local', 'online'
let currentPlayerColor = null; // For AI or online (this client's color)
let currentAIDifficulty = null;
let onlineGameSocket = null; // Reference to the connected socket for online games
let onlineGameLobbyId = null; // Reference to the lobby ID for online games

// DamaGame instance
let damaGame;

// --- Helper Functions (Callbacks for DamaGame to update UI) ---

/**
 * Shows a specific screen and hides others.
 * @param {string} id - The ID of the screen to show (e.g., 'main-menu').
 */
export function showScreen(id) {
    screens.forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(id).classList.add('active');
    messageArea.textContent = ''; // Clear messages on screen change
    turnIndicator.textContent = ''; // Clear turn indicator
    turnIndicator.className = '';
    btnUndo.style.display = 'none'; // Undo is specific to local games for now
}

/**
 * Displays a message to the user.
 * @param {string} message - The message to display.
 * @param {'green'|'red'|'blue'} type - Type of message for styling/color.
 */
export function showMessage(message, type = 'blue') {
    messageArea.textContent = message;
    messageArea.style.color = type;
}

/**
 * Updates the turn indicator display. This is called by DamaGame.
 * @param {'red'|'blue'|'none'} color - The color whose turn it is, or 'none'.
 * @param {boolean} isOnline - Whether it's an online game.
 * @param {'red'|'blue'|null} myOnlineColor - The client's assigned color in online mode.
 */
function updateTurnIndicator(color, isOnline = false, myOnlineColor = null) {
    turnIndicator.className = color;
    if (color === 'none') {
        turnIndicator.textContent = '';
        return;
    }

    if (isOnline) {
        if (color === myOnlineColor) {
            turnIndicator.textContent = `Your Turn (${Utils.capitalize(color)})`;
        } else {
            turnIndicator.textContent = `Opponent's Turn (${Utils.capitalize(color)})`;
        }
    } else {
        turnIndicator.textContent = `${Utils.capitalize(color)}'s Turn`;
    }
}

/**
 * Handles game end, displaying winner and options. This is called by DamaGame.
 * @param {'red'|'blue'|null} winner - The color of the winning player, or null for draw/forfeit.
 * @param {number} redPieces - Count of red pieces remaining.
 * @param {number} bluePieces - Count of blue pieces remaining.
 * @param {boolean} isOnline - If it was an online game.
 */
function handleGameEnd(winner, redPieces, bluePieces, isOnline) {
    showScreen('result-screen');
    if (winner) {
        winnerMessage.textContent = `${Utils.capitalize(winner)} Wins!`;
        winnerMessage.style.color = winner;
    } else {
        winnerMessage.textContent = "Game Over (No Winner / Forfeit)";
        winnerMessage.style.color = '#ccc';
    }
    scoreMessage.textContent = `Red: ${redPieces} | Blue: ${bluePieces}`;

    // Rematch only for local/AI for now
    btnRematch.style.display = isOnline ? 'none' : 'block';
}

/**
 * Controls visibility of the Undo button. Called by DamaGame.
 * @param {boolean} visible
 */
function onUndoVisibility(visible) {
    btnUndo.style.display = visible ? 'block' : 'none';
}


/**
 * Sets up and starts a new Dama game. This is called by main.js.
 * @param {'ai'|'local'|'online'} mode - Game mode.
 * @param {'red'|'blue'|null} playerColor - Player's chosen color (for AI/online).
 * @param {SocketIO.Socket|null} socket - Socket.IO instance for online games.
 * @param {string|null} lobbyId - Lobby ID for online games.
 * @param {Array<Array<string>>|null} initialBoardState - Board state for online game from server.
 * @param {'red'|'blue'|null} initialTurn - Initial turn for online game from server.
 */
export function setupGame(mode, playerColor = null, socket = null, lobbyId = null, initialBoardState = null, initialTurn = null) {
    currentGameMode = mode;
    currentPlayerColor = playerColor;
    onlineGameSocket = socket;
    onlineGameLobbyId = lobbyId;

    showScreen('game-screen');
    messageArea.textContent = '';

    const config = {
        mode: mode,
        playerColor: playerColor, // 'red' or 'blue' for AI/online, null for local 2-player
        aiDifficulty: currentAIDifficulty,
        socket: onlineGameSocket,
        lobbyId: onlineGameLobbyId,
        initialBoard: initialBoardState,
        initialTurn: initialTurn,
        onTurnChange: updateTurnIndicator,
        onGameEnd: handleGameEnd,
        onMessage: showMessage,
        onUndoVisibility: onUndoVisibility,
    };

    if (!damaGame) {
        damaGame = new DamaGame('board-container', config);
    } else {
        damaGame.resetGame(config);
    }

    if (mode === 'online') {
        // Listen for game:move from server
        onlineGameSocket.off('game:move'); // Remove previous listener to avoid duplicates
        onlineGameSocket.on('game:move', (payload) => {
            if (payload.lobbyId === onlineGameLobbyId) {
                console.log('Received game:move from server:', payload);
                // DamaGame instance applies the server move
                damaGame.applyServerMove(payload.board, payload.currentTurn, payload.redPiecesCount, payload.bluePiecesCount);
            }
        });
    }
}

// --- MODAL Control Functions (NEW) ---

/**
 * Shows a generic modal and the backdrop.
 * @param {HTMLElement} modalElement - The specific modal element to show.
 */
function showModal(modalElement) {
    if (modalBackdrop && modalElement) {
        modalBackdrop.classList.add('show');
        modalElement.classList.add('show');
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }
}

/**
 * Hides a generic modal and the backdrop.
 * @param {HTMLElement} modalElement - The specific modal element to hide.
 */
function hideModal(modalElement) {
    if (modalBackdrop && modalElement) {
        modalBackdrop.classList.remove('show');
        modalElement.classList.remove('show');
        // Only re-enable scrolling if no other modal is open
        if (!document.querySelector('.modal.show')) {
            document.body.style.overflow = '';
        }
    }
}

// Specific functions for your 'Create Lobby' modal
export function showCreateLobbyModal() {
    showModal(createLobbyModal);
    // Any specific setup for create lobby modal (e.g., clearing inputs) can go here
}

export function hideCreateLobbyModal() {
    hideModal(createLobbyModal);
    // Any specific cleanup for create lobby modal can go here
}

// Specific functions for your 'Share Game Code' modal
export function showShareGameCodeModal() {
    showModal(shareGameCodeModal);
    // Any specific setup for share game code modal (e.g., displaying the code) can go here
}

export function hideShareGameCodeModal() {
    hideModal(shareGameCodeModal);
    // Any specific cleanup for share game code modal can go here
}


// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // Initializing DamaGame here, but calling resetGame() when modes are selected
    // This ensures the board container and event listeners are set up once
    damaGame = new DamaGame('board-container', {
        mode: null, // No active mode initially
        playerColor: null,
        aiDifficulty: null,
        socket: null,
        lobbyId: null,
        onTurnChange: updateTurnIndicator,
        onGameEnd: handleGameEnd,
        onMessage: showMessage,
        onUndoVisibility: onUndoVisibility
    });

    showScreen('main-menu'); // Start on main menu

    // Main Menu Buttons
    btnSinglePlayer.addEventListener('click', () => {
        showScreen('single-player-menu');
        difficultySelection.style.display = 'none'; // Hide difficulty until color chosen
        chosenAiColorSpan.textContent = ''; // Clear AI color display
    });

    btnTwoPlayer.addEventListener('click', () => {
        // For local 2-player, humanPlayerColor is not strictly needed but can default to Blue (bottom)
        setupGame('local', Utils.PLAYER_BLUE);
    });

    btnChallengeFriend.addEventListener('click', () => {
        showScreen('online-menu');
        initLobbyUI(updateConnectionStatus); // Initialize lobby UI logic
        if (isSocketConnected()) {
            // Already connected, show lobby section
            onlineMenu.querySelector('.online-setup-section').style.display = 'none';
            document.getElementById('lobby-section').style.display = 'block';
            getSocket().emit('lobby:list:fetch');
        } else {
            // Not connected, show connection form
            onlineMenu.querySelector('.online-setup-section').style.display = 'flex';
            document.getElementById('lobby-section').style.display = 'none';
        }
    });

    // Single Player Menu
    btnPlayAsRed.addEventListener('click', () => {
        currentPlayerColor = Utils.PLAYER_RED;
        chosenAiColorSpan.textContent = Utils.capitalize(Utils.PLAYER_BLUE); // AI is opponent
        difficultySelection.style.display = 'flex';
    });

    btnPlayAsBlue.addEventListener('click', () => {
        currentPlayerColor = Utils.PLAYER_BLUE;
        chosenAiColorSpan.textContent = Utils.capitalize(Utils.PLAYER_RED); // AI is opponent
        difficultySelection.style.display = 'flex';
    });

    difficultyButtons.forEach(button => {
        button.addEventListener('click', () => {
            currentAIDifficulty = button.dataset.difficulty;
            if (!currentPlayerColor) {
                showMessage("Please choose your color first!", 'red');
                return;
            }
            setupGame('ai', currentPlayerColor);
        });
    });

    // Back to Menu Buttons
    document.querySelectorAll('.back-button').forEach(button => {
        button.addEventListener('click', () => {
            // If leaving online menu (by clicking a back button from within online-menu)
            if (onlineMenu.classList.contains('active')) {
                leaveOnlineLobbyConnection(); // Correctly calls the exported function to handle leaving lobby
            }
            showScreen('main-menu'); // Transition to main menu
            currentGameMode = null; // Clear game mode
            currentPlayerColor = null; // Clear player color
        });
    });

    btnBackToMenuGame.addEventListener('click', () => {
        if (confirm('Are you sure you want to abandon the current game?')) {
            if (currentGameMode === 'online' && isSocketConnected()) {
                getSocket().emit('lobby:leave'); // Leave online lobby
                disconnectSocket(); // Disconnect from server
            }
            showScreen('main-menu');
            currentGameMode = null;
            currentPlayerColor = null;
        }
    });


    // Result Screen Buttons
    btnRematch.addEventListener('click', () => {
        // Rematch logic based on current game mode
        if (currentGameMode === 'ai') {
            setupGame('ai', currentPlayerColor);
        } else if (currentGameMode === 'local') {
            setupGame('local', Utils.PLAYER_BLUE); // Local 2-player restarts with Blue as bottom player
        }
    });

    btnNewGame.addEventListener('click', () => {
        if (currentGameMode === 'online' && isSocketConnected()) {
            getSocket().emit('lobby:leave'); // Ensure to leave any online lobby
            disconnectSocket();
        }
        showScreen('main-menu');
        currentGameMode = null;
        currentPlayerColor = null;
    });

    // Undo button
    btnUndo.addEventListener('click', () => {
        damaGame.undoLastMove();
    });

    // --- MODAL Event Listeners (NEW) ---

    // Event listener for opening the 'Create Lobby' modal
    if (btnShowCreateLobby) {
        btnShowCreateLobby.addEventListener('click', showCreateLobbyModal);
    }

    // Event listeners for closing the 'Create Lobby' modal
    if (btnCloseCreateLobby) {
        btnCloseCreateLobby.addEventListener('click', hideCreateLobbyModal);
    }
    if (btnCancelCreateLobby) {
        btnCancelCreateLobby.addEventListener('click', hideCreateLobbyModal);
    }

    // Event listeners for closing the 'Share Game Code' modal
    if (btnCloseShareCode) {
        btnCloseShareCode.addEventListener('click', hideShareGameCodeModal);
    }
    if (cancelOnlineGameModal) {
        cancelOnlineGameModal.addEventListener('click', hideShareGameCodeModal);
    }

    // Event listener for clicking on the backdrop to close any open modal
    if (modalBackdrop) {
        modalBackdrop.addEventListener('click', (event) => { // Corrected: modalBackrop -> modalBackdrop
            // Only close if the click is directly on the backdrop, not on a modal itself
            if (event.target === modalBackdrop) {
                if (createLobbyModal && createLobbyModal.classList.contains('show')) {
                    hideCreateLobbyModal();
                } else if (shareGameCodeModal && shareGameCodeModal.classList.contains('show')) {
                    hideShareGameCodeModal();
                }
                // Add more conditions here for any other modals you might add
            }
        });
    }
});