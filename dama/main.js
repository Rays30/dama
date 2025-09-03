// FILE: dama/main.js
import * as Utils from './utils.js';
import { DamaGame } from './game.js'; // Your main game logic class/object

// IMPORT initLobbyUI, updateConnectionStatus, leaveOnlineLobbyConnection from lobby.js
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
const difficultySelection = singlePlayerMenu ? singlePlayerMenu.querySelector('.difficulty-selection') : null;
const difficultyHeader = document.getElementById('difficulty-header');
const chosenAiColorSpan = document.getElementById('chosen-ai-color'); // Span to show chosen color
const difficultyButtons = difficultySelection ? difficultySelection.querySelectorAll('button') : [];

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

// --- MODAL UI Elements ---
const modalBackdrop = document.getElementById('modal-backdrop');

// Create Lobby Modal
const createLobbyModal = document.getElementById('create-lobby-modal');
const btnCloseCreateLobby = createLobbyModal ? createLobbyModal.querySelector('.close-btn') : null;
const btnCancelCreateLobby = createLobbyModal ? createLobbyModal.querySelector('.btn-cancel-create-lobby') : null;

// Removed: Share Game Code Modal elements, as they are no longer in HTML
// const shareGameCodeModal = document.getElementById('share-game-code-modal');
// const btnCloseShareCode = shareGameCodeModal ? shareGameCodeModal.querySelector('.close-btn') : null;
// const cancelOnlineGameModal = document.getElementById('cancel-online-game-modal');

// Confirm Back to Menu Modal elements
const confirmBackModal = document.getElementById('confirm-back-modal');
const btnCloseConfirmBack = confirmBackModal ? confirmBackModal.querySelector('.close-btn') : null;
const btnConfirmYes = document.getElementById('btn-confirm-yes');
const btnConfirmNo = document.getElementById('btn-confirm-no');


// --- Game State Variables ---
let currentGameMode = null;
let currentPlayerColor = null;
let currentAIDifficulty = null;
let onlineGameSocket = null;
let onlineGameLobbyId = null;

// DamaGame instance
let damaGame;

// --- Helper Functions (Callbacks for DamaGame to update UI) ---

export function showScreen(id) {
    console.log(`[showScreen] Attempting to show screen: ${id}`);
    screens.forEach(screen => {
        if (screen.id === id) {
            if (!screen.classList.contains('active')) {
                console.log(`[showScreen] Activating screen: ${screen.id}`);
            }
        } else {
            if (screen.classList.contains('active')) {
                console.log(`[showScreen] Deactivating screen: ${screen.id}`);
            }
        }
        screen.classList.remove('active');
    });
    const targetScreen = document.getElementById(id);
    if (targetScreen) {
        targetScreen.classList.add('active');
        console.log(`[showScreen] Screen ${id} is now active and should be visible.`);
    } else {
        console.error(`[showScreen] ERROR: Target screen with ID '${id}' not found.`);
    }
    // Clear messages and turn indicator, but check if elements exist
    if (messageArea) messageArea.textContent = '';
    if (turnIndicator) {
        turnIndicator.textContent = '';
        turnIndicator.className = '';
    }
    if (btnUndo) btnUndo.style.display = 'none';
}

export function showMessage(message, type = 'blue') {
    if (messageArea) {
        messageArea.textContent = message;
        messageArea.style.color = type;
    }
}

function updateTurnIndicator(color, isOnline = false, myOnlineColor = null) {
    if (turnIndicator) {
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
}

function handleGameEnd(winner, redPieces, bluePieces, isOnline) {
    showScreen('result-screen');
    if (winnerMessage) {
        if (winner) {
            winnerMessage.textContent = `${Utils.capitalize(winner)} Wins!`;
            winnerMessage.style.color = winner;
        } else {
            winnerMessage.textContent = "Game Over (No Winner / Forfeit)";
            winnerMessage.style.color = '#ccc';
        }
    }
    if (scoreMessage) scoreMessage.textContent = `Red: ${redPieces} | Blue: ${bluePieces}`;

    if (btnRematch) btnRematch.style.display = isOnline ? 'none' : 'block';
}

function onUndoVisibility(visible) {
    if (btnUndo) btnUndo.style.display = visible ? 'block' : 'none';
}


export function setupGame(mode, playerColor = null, socket = null, lobbyId = null, initialBoardState = null, initialTurn = null) {
    console.log(`[setupGame] Starting game in mode: ${mode}, playerColor: ${playerColor}`);
    currentGameMode = mode;
    currentPlayerColor = playerColor;
    onlineGameSocket = socket;
    onlineGameLobbyId = lobbyId;

    showScreen('game-screen');
    if (messageArea) messageArea.textContent = '';

    const config = {
        mode: mode,
        playerColor: playerColor,
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
        console.log('[setupGame] Initialized new DamaGame instance.');
    } else {
        damaGame.resetGame(config);
        console.log('[setupGame] Reset existing DamaGame instance.');
    }

    if (mode === 'online' && onlineGameSocket) {
        onlineGameSocket.off('game:move');
        onlineGameSocket.on('game:move', (payload) => {
            if (payload.lobbyId === onlineGameLobbyId) {
                console.log('[Online] Received game:move from server:', payload);
                if (damaGame) damaGame.applyServerMove(payload.board, payload.currentTurn, payload.redPiecesCount, payload.bluePiecesCount);
            }
        });
    }
}

// EXPORTED showModal/hideModal functions (now authoritative and robust)
export function showModal(modalElement) {
    console.log(`[main.js][showModal] Attempting to show modal: ${modalElement ? modalElement.id : 'null'}`);
    if (modalBackdrop && modalElement) {
        modalBackdrop.classList.add('show');
        modalBackdrop.style.display = 'block'; // Ensure backdrop is displayed
        modalBackdrop.style.pointerEvents = 'auto'; // Enable interactions for backdrop

        modalElement.classList.add('show');
        modalElement.style.display = 'flex'; // Ensure modal is displayed
        modalElement.style.pointerEvents = 'auto'; // Enable interactions

        document.body.style.overflow = 'hidden';
        console.log(`[main.js][showModal] Modal ${modalElement.id} and backdrop shown.`);
    } else {
        console.warn("[main.js][showModal] Missing modalBackdrop or modalElement. Cannot show modal.");
    }
}

export function hideModal(modalElement) {
    console.log(`[main.js][hideModal] Attempting to hide modal: ${modalElement ? modalElement.id : 'null'}`);
    if (modalElement) {
        modalElement.classList.remove('show');
        // Add a small timeout to allow CSS transitions (opacity) to complete
        // CRITICAL: Use !important to override any lingering inline/specific styles
        setTimeout(() => {
            modalElement.style.setProperty('display', 'none', 'important');
            modalElement.style.setProperty('pointer-events', 'none', 'important');
            console.log(`[main.js][hideModal] Modal ${modalElement.id} display set to: ${modalElement.style.display}`);
        }, 300); // Match this duration with your CSS transition duration
    }

    // Check if ANY other modals are still open before hiding the backdrop and re-enabling scroll
    // This timeout ensures that the classList.remove takes effect before recounting.
    setTimeout(() => {
        const remainingActiveModals = document.querySelectorAll('.modal.show');
        if (remainingActiveModals.length === 0) {
            if (modalBackdrop) {
                modalBackdrop.classList.remove('show');
                // CRITICAL: Use !important for backdrop as well
                modalBackdrop.style.setProperty('display', 'none', 'important');
                modalBackdrop.style.setProperty('pointer-events', 'none', 'important');
                console.log(`[main.js][hideModal] Backdrop display set to: ${modalBackdrop.style.display}`);
            }
            document.body.style.overflow = ''; // Re-enable body scrolling
            console.log(`[main.js][hideModal] Backdrop hidden, body scroll re-enabled.`);
        } else {
            console.log(`[main.js][hideModal] Other modals still active (${remainingActiveModals.length}). Keeping backdrop.`);
        }
    }, 300); // Same delay as above
    console.log(`[main.js][hideModal] Modal ${modalElement ? modalElement.id : 'null'} hidden signal sent.`);
}


// Removed showCreateLobbyModal, hideCreateLobbyModal, showShareGameCodeModal, hideShareGameCodeModal
// as lobby.js now uses the exported showModal/hideModal from main.js directly, or handles its own specifics.


// NEW: Helper functions for the confirm back modal
export function showConfirmBackModal() {
    console.log("[showConfirmBackModal] Called.");
    showModal(confirmBackModal);
}

export function hideConfirmBackModal() {
    console.log("[hideConfirmBackModal] Called.");
    // FIX: Corrected typo from confirmBackBackModal to confirmBackModal
    hideModal(confirmBackModal);
}


// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('--- [main.js] DOMContentLoaded fired, starting initialization ---');

    // **IMPORTANT ADDITION: Reset all modals at startup**
    if (modalBackdrop) {
        modalBackdrop.classList.remove('show');
        modalBackdrop.style.setProperty('display', 'none', 'important'); // Force hide with !important
        modalBackdrop.style.setProperty('pointer-events', 'none', 'important');
    }
    if (createLobbyModal) {
        createLobbyModal.classList.remove('show');
        createLobbyModal.style.setProperty('display', 'none', 'important'); // Force hide with !important
        createLobbyModal.style.setProperty('pointer-events', 'none', 'important');
    }
    if (confirmBackModal) {
        confirmBackModal.classList.remove('show');
        confirmBackModal.style.setProperty('display', 'none', 'important'); // Force hide with !important
        confirmBackModal.style.setProperty('pointer-events', 'none', 'important');
    }
    document.body.style.overflow = ''; // Ensure body scrolling is re-enabled
    console.log('[DOMContentLoaded] All modals reset to hidden state.');


    console.log('Elements found status:');
    console.log('  mainMenu:', !!mainMenu);
    console.log('  btnSinglePlayer:', !!btnSinglePlayer);
    console.log('  btnTwoPlayer:', !!btnTwoPlayer);
    console.log('  btnChallengeFriend:', !!btnChallengeFriend);
    console.log('  singlePlayerMenu:', !!singlePlayerMenu);
    console.log('  onlineMenu:', !!onlineMenu);
    console.log('  gameScreen:', !!gameScreen);
    console.log('  resultScreen:', !!resultScreen);
    console.log('  modalBackdrop:', !!modalBackdrop);
    console.log('  createLobbyModal:', !!createLobbyModal);
    console.log('  shareGameCodeModal (expected false):', !!document.getElementById('share-game-code-modal')); // CHECK STATUS
    console.log('  confirmBackModal:', !!confirmBackModal);
    console.log('  btnConfirmYes:', !!btnConfirmYes);
    console.log('  btnConfirmNo:', !!btnConfirmNo);
    console.log('  btnCloseConfirmBack:', !!btnCloseConfirmBack);


    damaGame = new DamaGame('board-container', {
        mode: null,
        playerColor: null,
        aiDifficulty: null,
        socket: null,
        lobbyId: null,
        onTurnChange: updateTurnIndicator,
        onGameEnd: handleGameEnd,
        onMessage: showMessage,
        onUndoVisibility: onUndoVisibility
    });
    console.log('[DOMContentLoaded] DamaGame initialized (initial state).');

    showScreen('main-menu');
    console.log('[DOMContentLoaded] Displaying main-menu.');

    // Main Menu Buttons
    if (btnSinglePlayer) {
        btnSinglePlayer.addEventListener('click', () => {
            console.log('[Click] "Single Player (AI)" button clicked. Showing single-player-menu.');
            showScreen('single-player-menu');
            hideModal(createLobbyModal);
            hideConfirmBackModal();
            if (difficultySelection) difficultySelection.style.display = 'none';
            if (chosenAiColorSpan) chosenAiColorSpan.textContent = '';
        });
    } else { console.error("ERROR: btnSinglePlayer not found! Cannot attach click listener."); }

    if (btnTwoPlayer) {
        btnTwoPlayer.addEventListener('click', () => {
            console.log('[Click] "2 Players (Local)" button clicked. Setting up local game.');
            hideModal(createLobbyModal);
            hideConfirmBackModal();
            setupGame('local', Utils.PLAYER_BLUE);
        });
    } else { console.error("ERROR: btnTwoPlayer not found! Cannot attach click listener."); }

    if (btnChallengeFriend) {
        btnChallengeFriend.addEventListener('click', () => {
            console.log('[Click] "Challenge a Friend (Online)" button clicked. Showing online-menu.');
            hideModal(createLobbyModal);
            hideConfirmBackModal();
            showScreen('online-menu');
            initLobbyUI(updateConnectionStatus);
            if (isSocketConnected()) {
                if (onlineMenu) onlineMenu.querySelector('.online-setup-section').style.display = 'none';
                const lobbySection = document.getElementById('lobby-section');
                if (lobbySection) lobbySection.style.display = 'block';
                getSocket().emit('lobby:list:fetch');
            } else {
                if (onlineMenu) onlineMenu.querySelector('.online-setup-section').style.display = 'flex';
                const lobbySection = document.getElementById('lobby-section');
                if (lobbySection) lobbySection.style.display = 'none';
            }
        });
    } else { console.error("ERROR: btnChallengeFriend not found! Cannot attach click listener."); }

    // Single Player Menu
    if (btnPlayAsRed) {
        btnPlayAsRed.addEventListener('click', () => {
            console.log('[Click] "Play as Red" button clicked.');
            currentPlayerColor = Utils.PLAYER_RED;
            if (chosenAiColorSpan) chosenAiColorSpan.textContent = Utils.capitalize(Utils.PLAYER_BLUE);
            if (difficultySelection) difficultySelection.style.display = 'flex';
        });
    } else { console.warn("WARN: btnPlayAsRed not found."); }

    if (btnPlayAsBlue) {
        btnPlayAsBlue.addEventListener('click', () => {
            console.log('[Click] "Play as Blue" button clicked.');
            currentPlayerColor = Utils.PLAYER_BLUE;
            if (chosenAiColorSpan) chosenAiColorSpan.textContent = Utils.capitalize(Utils.PLAYER_RED);
            if (difficultySelection) difficultySelection.style.display = 'flex';
        });
    } else { console.warn("WARN: btnPlayAsBlue not found."); }

    if (difficultyButtons && difficultyButtons.length > 0) {
        difficultyButtons.forEach(button => {
            button.addEventListener('click', () => {
                console.log(`[Click] Difficulty button (${button.dataset.difficulty}) clicked.`);
                currentAIDifficulty = button.dataset.difficulty;
                if (!currentPlayerColor) {
                    showMessage("Please choose your color first!", 'red');
                    return;
                }
                setupGame('ai', currentPlayerColor);
            });
        });
    } else { console.warn("WARN: Difficulty buttons not found or empty."); }

    // Back to Menu Buttons
    document.querySelectorAll('.back-button').forEach(button => {
        button.addEventListener('click', () => {
            console.log('[Click] Generic "Back to Menu" button clicked.');
            if (onlineMenu && onlineMenu.classList.contains('active')) {
                leaveOnlineLobbyConnection();
            }
            showScreen('main-menu');
            currentGameMode = null;
            currentPlayerColor = null;
            hideModal(createLobbyModal);
            hideConfirmBackModal();
        });
    });

    if (btnBackToMenuGame) {
        btnBackToMenuGame.addEventListener('click', () => {
            console.log('[Click] "Back to Menu" (from game) button clicked. Showing confirm modal.');
            showConfirmBackModal();
        });
    } else { console.warn("WARN: btnBackToMenuGame not found."); }

    // Event listeners for the Confirm Back to Menu modal
    if (btnConfirmYes) {
        btnConfirmYes.addEventListener('click', () => {
            console.log('[Click] "Yes, Abandon" button clicked.');
            if (currentGameMode === 'online' && isSocketConnected()) {
                getSocket().emit('lobby:leave');
                disconnectSocket();
            }
            hideConfirmBackModal();
            showScreen('main-menu');
            currentGameMode = null;
            currentPlayerColor = null;
            hideModal(createLobbyModal);
        });
    } else { console.warn("WARN: btnConfirmYes not found!"); }

    if (btnConfirmNo) {
        btnConfirmNo.addEventListener('click', () => {
            console.log('[Click] "No, Stay" button clicked.');
            hideConfirmBackModal();
        });
    } else { console.warn("WARN: btnConfirmNo not found!"); }

    if (btnCloseConfirmBack) {
        btnCloseConfirmBack.addEventListener('click', hideConfirmBackModal);
    } else { console.warn("WARN: btnCloseConfirmBack not found!"); }


    // Result Screen Buttons
    if (btnRematch) {
        btnRematch.addEventListener('click', () => {
            console.log('[Click] "Rematch" button clicked.');
            if (currentGameMode === 'ai') {
                setupGame('ai', currentPlayerColor);
            } else if (currentGameMode === 'local') {
                setupGame('local', Utils.PLAYER_BLUE);
            }
        });
    } else { console.warn("WARN: btnRematch not found."); }

    if (btnNewGame) {
        btnNewGame.addEventListener('click', () => {
            console.log('[Click] "New Game" button clicked.');
            if (currentGameMode === 'online' && isSocketConnected()) {
                getSocket().emit('lobby:leave');
                disconnectSocket();
            }
            showScreen('main-menu');
            currentGameMode = null;
            currentPlayerColor = null;
            hideModal(createLobbyModal);
            hideConfirmBackModal();
        });
    } else { console.warn("WARN: btnNewGame not found."); }

    // Undo button
    if (btnUndo) {
        btnUndo.addEventListener('click', () => {
            console.log('[Click] "Undo" button clicked.');
            if (damaGame) damaGame.undoLastMove();
        });
    } else { console.warn("WARN: btnUndo not found."); }

    // --- MODAL Event Listeners ---
    if (modalBackdrop) {
        modalBackdrop.addEventListener('click', (event) => {
            if (event.target === modalBackdrop) {
                console.log('[Click] Modal backdrop clicked directly.');
                const visibleModals = document.querySelectorAll('.modal.show');
                if (visibleModals.length > 0) {
                    const topModal = visibleModals[visibleModals.length - 1];
                    hideModal(topModal);
                }
            }
        });
    } else { console.warn("WARN: modalBackdrop not found!"); }
});