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

// --- MODAL UI Elements (NEW) ---
const modalBackdrop = document.getElementById('modal-backdrop');

// Create Lobby Modal
const createLobbyModal = document.getElementById('create-lobby-modal');
const btnCloseCreateLobby = createLobbyModal ? createLobbyModal.querySelector('.close-btn') : null;
const btnCancelCreateLobby = createLobbyModal ? createLobbyModal.querySelector('.btn-cancel-create-lobby') : null;

// Share Game Code Modal
const shareGameCodeModal = document.getElementById('share-game-code-modal');
const btnCloseShareCode = shareGameCodeModal ? shareGameCodeModal.querySelector('.close-btn') : null;
const cancelOnlineGameModal = document.getElementById('cancel-online-game-modal');


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

function showModal(modalElement) {
    console.log(`[showModal] Attempting to show modal: ${modalElement ? modalElement.id : 'null'}`);
    if (modalBackdrop && modalElement) {
        modalBackdrop.classList.add('show');
        modalElement.classList.add('show');
        document.body.style.overflow = 'hidden';
        console.log(`[showModal] Modal ${modalElement.id} and backdrop shown.`);
    } else {
        console.warn("[showModal] Missing modalBackdrop or modalElement. Cannot show modal.");
    }
}

function hideModal(modalElement) {
    console.log(`[hideModal] Attempting to hide modal: ${modalElement ? modalElement.id : 'null'}`);
    if (modalBackdrop && modalElement) {
        modalBackdrop.classList.remove('show');
        modalElement.classList.remove('show');
        if (!document.querySelector('.modal.show')) {
            document.body.style.overflow = '';
        }
        console.log(`[hideModal] Modal ${modalElement.id} and backdrop hidden.`);
    }
}

export function showCreateLobbyModal() {
    console.log("[showCreateLobbyModal] Called.");
    hideShareGameCodeModal(); // Ensure other modals are closed
    showModal(createLobbyModal);
}

export function hideCreateLobbyModal() {
    console.log("[hideCreateLobbyModal] Called.");
    hideModal(createLobbyModal);
}

export function showShareGameCodeModal() {
    console.log("[showShareGameCodeModal] Called.");
    hideCreateLobbyModal(); // Ensure other modals are closed
    showModal(shareGameCodeModal);
}

export function hideShareGameCodeModal() {
    console.log("[hideShareGameCodeModal] Called.");
    hideModal(shareGameCodeModal);
}


// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('--- [main.js] DOMContentLoaded fired, starting initialization ---');

    // **IMPORTANT ADDITION: Reset all modals at startup**
    if (modalBackdrop) modalBackdrop.classList.remove('show');
    if (createLobbyModal) createLobbyModal.classList.remove('show');
    if (shareGameCodeModal) shareGameCodeModal.classList.remove('show');
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
    console.log('  shareGameCodeModal:', !!shareGameCodeModal);


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
            // Ensure any open modals are hidden when transitioning to a new screen
            hideCreateLobbyModal();
            hideShareGameCodeModal();
            if (difficultySelection) difficultySelection.style.display = 'none';
            if (chosenAiColorSpan) chosenAiColorSpan.textContent = '';
        });
    } else { console.error("ERROR: btnSinglePlayer not found! Cannot attach click listener."); }

    if (btnTwoPlayer) {
        btnTwoPlayer.addEventListener('click', () => {
            console.log('[Click] "2 Players (Local)" button clicked. Setting up local game.');
            // Ensure any open modals are hidden when transitioning to a new screen
            hideCreateLobbyModal();
            hideShareGameCodeModal();
            setupGame('local', Utils.PLAYER_BLUE);
        });
    } else { console.error("ERROR: btnTwoPlayer not found! Cannot attach click listener."); }

    if (btnChallengeFriend) {
        btnChallengeFriend.addEventListener('click', () => {
            console.log('[Click] "Challenge a Friend (Online)" button clicked. Showing online-menu.');
            // Ensure any open modals are hidden when transitioning to a new screen
            hideCreateLobbyModal();
            hideShareGameCodeModal();
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
            // Ensure any open modals are hidden when returning to main menu
            hideCreateLobbyModal();
            hideShareGameCodeModal();
        });
    });

    if (btnBackToMenuGame) {
        btnBackToMenuGame.addEventListener('click', () => {
            console.log('[Click] "Back to Menu" (from game) button clicked. Confirming abandon.');
            if (confirm('Are you sure you want to abandon the current game?')) {
                if (currentGameMode === 'online' && isSocketConnected()) {
                    getSocket().emit('lobby:leave');
                    disconnectSocket();
                }
                showScreen('main-menu');
                currentGameMode = null;
                currentPlayerColor = null;
                // Ensure any open modals are hidden
                hideCreateLobbyModal();
                hideShareGameCodeModal();
            }
        });
    } else { console.warn("WARN: btnBackToMenuGame not found."); }

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
            // Ensure any open modals are hidden
            hideCreateLobbyModal();
            hideShareGameCodeModal();
        });
    } else { console.warn("WARN: btnNewGame not found."); }

    // Undo button
    if (btnUndo) {
        btnUndo.addEventListener('click', () => {
            console.log('[Click] "Undo" button clicked.');
            if (damaGame) damaGame.undoLastMove();
        });
    } else { console.warn("WARN: btnUndo not found."); }

    // --- MODAL Event Listeners (NEW) ---

    if (btnShowCreateLobby) {
        btnShowCreateLobby.addEventListener('click', showCreateLobbyModal);
    } else { console.warn("WARN: btnShowCreateLobby not found!"); }

    if (btnCloseCreateLobby) {
        btnCloseCreateLobby.addEventListener('click', hideCreateLobbyModal);
    } else { console.warn("WARN: btnCloseCreateLobby not found!"); }

    if (btnCancelCreateLobby) {
        btnCancelCreateLobby.addEventListener('click', hideCreateLobbyModal);
    } else { console.warn("WARN: btnCancelCreateLobby not found!"); }

    if (btnCloseShareCode) {
        btnCloseShareCode.addEventListener('click', hideShareGameCodeModal);
    } else { console.warn("WARN: btnCloseShareCode not found!"); }

    if (cancelOnlineGameModal) {
        cancelOnlineGameModal.addEventListener('click', hideShareGameCodeModal);
    } else { console.warn("WARN: cancelOnlineGameModal not found!"); }

    if (modalBackdrop) {
        modalBackdrop.addEventListener('click', (event) => {
            if (event.target === modalBackdrop) {
                console.log('[Click] Modal backdrop clicked directly.');
                if (createLobbyModal && createLobbyModal.classList.contains('show')) {
                    hideCreateLobbyModal();
                } else if (shareGameCodeModal && shareGameCodeModal.classList.contains('show')) {
                    hideShareGameCodeModal();
                }
            }
        });
    } else { console.warn("WARN: modalBackdrop not found!"); }
});