// FILE: dama/client/lobby/lobby.js
import { getSocket, isSocketConnected, connectSocket } from '../net/socket.js';
import { showScreen, showMessage, setupGame } from '../../main.js'; // Import showScreen, showMessage, setupGame from main.js

const onlineMenu = document.getElementById('online-menu');
const usernameInput = document.getElementById('username-input');
const serverUrlInput = document.getElementById('server-url-input');
const btnConnectServer = document.getElementById('btn-connect-server');
const connectionStatus = document.getElementById('connection-status');

const lobbySection = document.getElementById('lobby-section');
const lobbyListContainer = document.getElementById('lobby-list');
const btnRefreshLobbies = document.getElementById('btn-refresh-lobbies');

const btnShowCreateLobby = document.getElementById('btn-show-create-lobby'); // Button to open create lobby modal

// --- Modal DOM Elements ---
const modalBackdrop = document.getElementById('modal-backdrop'); // FIX: Corrected ID to modal-backdrop

const createLobbyModal = document.getElementById('create-lobby-modal');
const createLobbyNameInputModal = document.getElementById('create-lobby-name-modal');
const createLobbyPrivacySelectModal = document.getElementById('create-lobby-privacy-modal');
const createLobbyPasswordInputModal = document.getElementById('create-lobby-password-modal');
const btnCreateLobbySubmitModal = document.getElementById('btn-create-lobby-submit-modal');
const btnCloseCreateLobby = document.querySelector('.btn-close-create-lobby'); // Close button for create modal
const btnCancelCreateLobby = document.querySelector('.btn-cancel-create-lobby'); // Cancel button for create modal

const shareGameCodeModal = document.getElementById('share-game-code-modal');
const gameCodeDisplayModal = document.getElementById('game-code-display-modal');
const copyGameCodeBtnModal = document.getElementById('copy-game-code-modal');
const cancelOnlineGameBtnModal = document.getElementById('cancel-online-game-modal'); // This is the 'Cancel' in share code modal
const btnCloseShareCode = document.querySelector('.btn-close-share-code'); // Close button for share code modal


const joinLobbyForm = document.getElementById('join-lobby-form'); // This remains an in-line sub-section
const joinLobbyCodeInput = document.getElementById('join-lobby-code');
const joinLobbyPasswordInput = document.getElementById('join-lobby-password');
const btnJoinPrivateLobbySubmit = document.getElementById('btn-join-private-lobby-submit');


const currentLobbyDetails = document.getElementById('current-lobby-details');
const lobbyDetailsName = document.getElementById('lobby-details-name');
const lobbyDetailsStatus = document.getElementById('lobby-details-status');
const lobbyDetailsHost = document.getElementById('lobby-details-host');
const lobbyDetailsCodeArea = document.getElementById('lobby-details-code-area');
const lobbyDetailsCode = document.getElementById('lobby-details-code');
const copyLobbyCodeBtn = document.getElementById('copy-lobby-code');
const lobbyDetailsPlayers = document.getElementById('lobby-details-players');
const btnReadyToggle = document.getElementById('btn-ready-toggle');
const btnStartGameHost = document.getElementById('btn-start-game-host');
const btnLeaveLobby = document.getElementById('btn-leave-lobby');

const hostControls = document.getElementById('host-controls');
const kickPlayerSelect = document.getElementById('kick-player-select');
const btnKickPlayer = document.getElementById('btn-kick-player');
const btnCloseLobby = document.getElementById('btn-close-lobby');

let currentLobby = null;
let myUserId = null;
let myUsername = 'Guest';

/**
 * Helper to show a modal.
 * @param {HTMLElement} modalElement - The modal div to show.
 */
function showModal(modalElement) {
    if (!modalBackdrop) {
        console.error("showModal: modalBackdrop element not found!");
        return;
    }
    modalBackdrop.classList.add('show'); // Use 'show' class as defined in main.js/style.css
    if (modalElement) modalElement.classList.add('show'); // Add null check for modalElement too
}

/**
 * Helper to hide a modal.
 * @param {HTMLElement} modalElement - The modal div to hide.
 */
function hideModal(modalElement) {
    if (modalElement) modalElement.classList.remove('show'); // Use 'show' class

    const isCreateLobbyActive = createLobbyModal && createLobbyModal.classList.contains('show');
    const isShareGameCodeActive = shareGameCodeModal && shareGameCodeModal.classList.contains('show');

    if (!isCreateLobbyActive && !isShareGameCodeActive) {
        if (modalBackdrop) {
            modalBackdrop.classList.remove('show'); // Use 'show' class
        } else {
            console.warn("hideModal: modalBackdrop element not found when trying to hide it.");
        }
    }
}

/**
 * Initiates leaving the current online lobby (sends to server)
 * and resets the lobby.js UI state to show the lobby list.
 * This function is exported for main.js to call.
 */
export function leaveOnlineLobbyConnection() {
    const socket = getSocket();
    if (isSocketConnected()) {
        console.log("Client emitting lobby:leave.");
        socket.emit('lobby:leave');
    }
    currentLobby = null; // Clear client's current lobby state

    // Ensure all modals are hidden (using the new correct 'show' class)
    if (createLobbyModal) hideModal(createLobbyModal);
    if (shareGameCodeModal) hideModal(shareGameCodeModal);

    // Reset UI state to show the main lobby list (within online-menu)
    hideAllSubSections(); // Hides current-lobby-details, join-lobby-form etc.
    if (lobbySection) lobbySection.style.display = 'block'; // Ensure parent lobby section is visible
    if (lobbyListContainer) lobbyListContainer.style.display = 'block'; // Show lobby list

    if (lobbyListContainer) lobbyListContainer.innerHTML = '<p>Loading lobbies...</p>'; // Display placeholder while refreshing
    if (isSocketConnected()) {
        socket.emit('lobby:list:fetch'); // Request an updated list
    }
    // Do NOT transition screens (e.g., to 'main-menu') here. main.js will handle that if needed.
}


/**
 * Initializes the online lobby UI and event listeners.
 * @param {Function} updateConnectionStatusCb - Callback to update UI connection status.
 */
export function initLobbyUI(updateConnectionStatusCb) {
    if (localStorage.getItem('damaUsername')) {
        usernameInput.value = localStorage.getItem('damaUsername');
        myUsername = usernameInput.value;
    }

    serverUrlInput.value = localStorage.getItem('damaServerUrl') || `${location.protocol}//${location.hostname}:4000`;

    btnConnectServer.addEventListener('click', () => {
        const username = usernameInput.value.trim();
        if (username.length < 3 || username.length > 20) {
            showMessage("Username must be 3-20 characters.", 'red');
            return;
        }
        localStorage.setItem('damaUsername', username);
        myUsername = username;

        const serverUrl = serverUrlInput.value.trim();
        if (!serverUrl) {
            showMessage("Please enter a server URL.", 'red');
            return;
        }
        localStorage.setItem('damaServerUrl', serverUrl);

        const socket = connectSocket(serverUrl, updateConnectionStatusCb);
        if (socket) {
            // Only emit user:hello once connected
            socket.off('connect'); // Remove previous 'connect' listener if exists
            socket.on('connect', () => {
                socket.emit('user:hello', { username: myUsername });
            });
            setupSocketListeners(socket);
        }
    });

    if (btnRefreshLobbies) {
        btnRefreshLobbies.addEventListener('click', () => {
            const socket = getSocket();
            if (isSocketConnected()) {
                socket.emit('lobby:list:fetch');
            } else {
                showMessage("Not connected to server.", 'red');
            }
        });
    }

    if (btnShowCreateLobby) {
        btnShowCreateLobby.addEventListener('click', () => {
            // Clear previous values in modal form
            if (createLobbyNameInputModal) createLobbyNameInputModal.value = `${myUsername}'s Game`;
            if (createLobbyPrivacySelectModal) createLobbyPrivacySelectModal.value = 'public';
            if (createLobbyPasswordInputModal) {
                createLobbyPasswordInputModal.value = '';
                createLobbyPasswordInputModal.style.display = 'none'; // Hide password by default
            }
            if (createLobbyModal) showModal(createLobbyModal); // Show the create lobby modal
        });
    }

    if (createLobbyPrivacySelectModal && createLobbyPasswordInputModal) {
        createLobbyPrivacySelectModal.addEventListener('change', () => {
            createLobbyPasswordInputModal.style.display = createLobbyPrivacySelectModal.value === 'private' ? 'block' : 'none';
        });
    }

    if (btnCreateLobbySubmitModal) {
        btnCreateLobbySubmitModal.addEventListener('click', () => {
            const socket = getSocket();
            if (!isSocketConnected()) {
                showMessage("Not connected to server.", 'red');
                return;
            }

            const name = createLobbyNameInputModal ? createLobbyNameInputModal.value.trim() : '';
            const privacy = createLobbyPrivacySelectModal ? createLobbyPrivacySelectModal.value : 'public';
            const password = createLobbyPasswordInputModal ? createLobbyPasswordInputModal.value.trim() : '';

            if (name.length < 3) {
                showMessage("Lobby name too short.", 'red');
                return;
            }

            socket.emit('lobby:create', { name, privacy, password }, (response) => {
                if (response.success) {
                    showMessage(`Lobby "${name}" created!`, 'green');
                    if (createLobbyModal) hideModal(createLobbyModal); // Hide create modal
                    if (gameCodeDisplayModal) gameCodeDisplayModal.value = response.joinCode || 'N/A (Public Lobby)';
                    if (shareGameCodeModal) showModal(shareGameCodeModal); // Show share code modal
                    currentLobby = { id: response.lobbyId, isHost: true, joinCode: response.joinCode, privacy };
                    // lobby:updated will follow from server to render full details in current-lobby-details
                } else {
                    showMessage(`Error creating lobby: ${response.message}`, 'red');
                }
            });
        });
    }

    if (copyGameCodeBtnModal && gameCodeDisplayModal) {
        copyGameCodeBtnModal.addEventListener('click', () => {
            gameCodeDisplayModal.select();
            document.execCommand('copy');
            showMessage('Game code copied!', 'green');
        });
    }

    if (copyLobbyCodeBtn && lobbyDetailsCode) {
        copyLobbyCodeBtn.addEventListener('click', () => {
            lobbyDetailsCode.select();
            document.execCommand('copy');
            showMessage('Lobby code copied!', 'green');
        });
    }

    // Cancel button in the Share Game Code Modal
    if (cancelOnlineGameBtnModal) {
        cancelOnlineGameBtnModal.addEventListener('click', () => {
            if (shareGameCodeModal) hideModal(shareGameCodeModal); // Hide share code modal
            leaveOnlineLobbyConnection(); // Leave the lobby and reset to lobby list
            showScreen('online-menu'); // Ensure we're on the online menu screen
        });
    }

    // Close button for Share Game Code Modal
    if (btnCloseShareCode) {
        btnCloseShareCode.addEventListener('click', () => {
            if (shareGameCodeModal) hideModal(shareGameCodeModal);
            leaveOnlineLobbyConnection(); // Leave the lobby if closed
            showScreen('online-menu');
        });
    }

    // Close button for Create Lobby Modal
    if (btnCloseCreateLobby) {
        btnCloseCreateLobby.addEventListener('click', () => {
            if (createLobbyModal) hideModal(createLobbyModal);
        });
    }

    // Cancel button for Create Lobby Modal
    if (btnCancelCreateLobby) {
        btnCancelCreateLobby.addEventListener('click', () => {
            if (createLobbyModal) hideModal(createLobbyModal);
        });
    }

    if (btnJoinPrivateLobbySubmit) {
        btnJoinPrivateLobbySubmit.addEventListener('click', () => {
            const socket = getSocket();
            if (!isSocketConnected()) {
                showMessage("Not connected to server.", 'red');
                return;
            }

            const code = joinLobbyCodeInput ? joinLobbyCodeInput.value.trim() : '';
            const password = joinLobbyPasswordInput ? joinLobbyPasswordInput.value.trim() : '';

            if (code.length === 0) {
                showMessage("Please enter a lobby code.", 'red');
                return;
            }

            socket.emit('lobby:join', { code, password }, (response) => {
                if (response.success) {
                    showMessage(`Joined lobby!`, 'green');
                    hideAllSubSections();
                    if (currentLobbyDetails) currentLobbyDetails.style.display = 'flex';
                    currentLobby = { id: response.lobbyId, isHost: false };
                    // Lobby:updated will be sent from server to render full details
                } else {
                    showMessage(`Error joining lobby: ${response.message}`, 'red');
                }
            });
        });
    }

    if (btnReadyToggle) {
        btnReadyToggle.addEventListener('click', () => {
            const socket = getSocket();
            if (!isSocketConnected() || !currentLobby || !currentLobby.id || !myUserId) return;

            const player = currentLobby.players[myUserId];
            if (player) {
                const newReadyState = !player.ready;
                socket.emit('lobby:ready:set', { ready: newReadyState });
            }
        });
    }

    if (btnStartGameHost) {
        btnStartGameHost.addEventListener('click', () => {
            const socket = getSocket();
            if (!isSocketConnected() || !currentLobby || !currentLobby.id) return;

            const myPlayer = currentLobby.players[myUserId];
            if (myPlayer && !myPlayer.ready) {
                socket.emit('lobby:ready:set', { ready: true }); // Host signals ready if not already
            }
            showMessage("Attempting to start game...", 'blue');
        });
    }


    if (btnLeaveLobby) {
        btnLeaveLobby.addEventListener('click', () => {
            leaveOnlineLobbyConnection();
            showScreen('online-menu');
        });
    }

    if (btnCloseLobby) {
        btnCloseLobby.addEventListener('click', () => {
            if (currentLobby && currentLobby.isHost) {
                leaveOnlineLobbyConnection();
            } else {
                leaveOnlineLobbyConnection();
            }
            showScreen('online-menu');
        });
    }

    if (btnKickPlayer) {
        btnKickPlayer.addEventListener('click', () => {
            const socket = getSocket();
            if (isSocketConnected() && currentLobby && currentLobby.isHost) {
                const playerIdToKick = kickPlayerSelect ? kickPlayerSelect.value : '';
                if (playerIdToKick && playerIdToKick !== myUserId) {
                    console.warn(`Host requested to kick player ${playerIdToKick}. Server-side 'lobby:kick' event not fully implemented.`);
                    showMessage("Kick functionality is a placeholder. Opponent must leave manually for now.", 'red');
                } else if (playerIdToKick === myUserId) {
                    showMessage("You cannot kick yourself.", 'red');
                }
            }
        });
    }

    // Back buttons
    document.querySelectorAll('.back-to-lobby-list').forEach(button => {
        button.addEventListener('click', () => {
            hideAllSubSections();
            if (lobbyListContainer) lobbyListContainer.style.display = 'block';
            if (isSocketConnected()) {
                getSocket().emit('lobby:list:fetch');
            }
        });
    });
}

function setupSocketListeners(socket) {
    socket.off('user:welcome');
    socket.on('user:welcome', (payload) => {
        myUserId = payload.userId;
        myUsername = payload.username;
        console.log(`Welcome, ${myUsername}! Your ID: ${myUserId}`);
        if (lobbySection) lobbySection.style.display = 'block';
        if (lobbyListContainer) lobbyListContainer.style.display = 'block';
        if (onlineMenu) onlineMenu.querySelector('.online-setup-section').style.display = 'none';
        socket.emit('lobby:list:fetch');
    });

    socket.off('lobby:list');
    socket.on('lobby:list', (payload) => {
        renderLobbyList(payload.lobbies);
    });

    socket.off('lobby:created');
    socket.on('lobby:created', (payload) => {
        console.log("Lobby created event received by client. Full details will follow with lobby:updated.");
    });

    socket.off('lobby:joined');
    socket.on('lobby:joined', (payload) => {
        console.log("Lobby joined event received by client. Full details will follow with lobby:updated.");
    });

    socket.off('lobby:updated');
    socket.on('lobby:updated', (payload) => {
        const lobby = payload.lobby;
        if (currentLobby && currentLobby.id === lobby.id) {
            currentLobby = { ...currentLobby, ...lobby }; // Merge new details
        } else if (lobby.players[myUserId]) {
            currentLobby = { ...lobby, isHost: lobby.hostId === myUserId };
            hideAllSubSections();
            if (currentLobbyDetails) currentLobbyDetails.style.display = 'flex';
            // FIX: Explicitly hide the shareGameCodeModal when lobby is updated and a player has joined
            if (shareGameCodeModal) {
                hideModal(shareGameCodeModal);
            }
        } else {
            return;
        }
        renderLobbyDetails(currentLobby);
    });

    socket.off('lobby:destroyed');
    socket.on('lobby:destroyed', (payload) => {
        if (currentLobby && currentLobby.id === payload.lobbyId) {
            showMessage(`Lobby "${currentLobby.name}" was closed by host.`, 'red');
            leaveOnlineLobbyConnection();
            showScreen('online-menu');
        }
    });

    socket.off('game:start');
    socket.on('game:start', (payload) => {
        console.log('Game starting payload:', payload);
        const myPlayer = payload.players[myUserId];
        if (myPlayer) {
            showMessage(`Game started! You are ${myPlayer.color}.`, 'green');
            if (shareGameCodeModal) hideModal(shareGameCodeModal);
            showScreen('game-screen');
            setupGame('online', myPlayer.color, getSocket(), payload.lobbyId, payload.initialBoard, payload.turn);
        } else {
            showMessage("Could not determine your player info for the game.", 'red');
        }
    });

    socket.off('game:end');
    socket.on('game:end', (payload) => {
        console.log('Game ended payload:', payload);
        showMessage(`Game Ended: ${payload.reason}. Winner: ${payload.winner || 'None'}`, 'blue');
        showScreen('result-screen');
    });

    socket.off('error');
    socket.on('error', (payload) => {
        showMessage(`Server Error: ${payload.message} (Code: ${payload.code})`, 'red');
        console.error('Server error:', payload);
    });

    socket.off('disconnect');
    socket.on('disconnect', (reason) => {
        console.log('Socket disconnected from server:', reason);
        updateConnectionStatus(`Disconnected: ${reason}`);
        leaveOnlineLobbyConnection();
        showScreen('online-menu');
    });
}

function renderLobbyList(lobbies) {
    if (!lobbyListContainer) {
        console.error("renderLobbyList: lobbyListContainer not found!");
        return;
    }
    lobbyListContainer.innerHTML = '';
    if (lobbies.length === 0) {
        lobbyListContainer.innerHTML = '<p>No public lobbies available. Create one!</p>';
        return;
    }

    lobbies.forEach(lobby => {
        const lobbyItem = document.createElement('div');
        lobbyItem.className = 'lobby-item';
        lobbyItem.dataset.lobbyId = lobby.id;
        lobbyItem.innerHTML = `
            <span>${lobby.name} (Host: ${lobby.hostUsername})</span>
            <span class="player-count">(${lobby.playerCount}/2)</span>
            <span class="lobby-status">${lobby.status === 'in-game' ? 'In Game' : 'Waiting'}</span>
        `;
        if (lobby.playerCount < 2 && lobby.status === 'waiting') {
            lobbyItem.addEventListener('click', () => {
                const socket = getSocket();
                if (isSocketConnected()) {
                    socket.emit('lobby:join', { lobbyId: lobby.id }, (response) => {
                        if (response.success) {
                            showMessage(`Joined lobby "${lobby.name}"!`, 'green');
                            hideAllSubSections();
                            if (currentLobbyDetails) currentLobbyDetails.style.display = 'flex';
                            currentLobby = { id: lobby.id, isHost: false };
                        } else {
                            showMessage(`Error joining lobby: ${response.message}`, 'red');
                        }
                    });
                } else {
                    showMessage("Not connected to server.", 'red');
                }
            });
        } else {
            lobbyItem.style.opacity = '0.7';
            lobbyItem.style.cursor = 'not-allowed';
        }
        lobbyListContainer.appendChild(lobbyItem);
    });
}

function renderLobbyDetails(lobby) {
    if (!lobby) {
        if (currentLobbyDetails) currentLobbyDetails.style.display = 'none';
        return;
    }

    hideAllSubSections();
    if (currentLobbyDetails) currentLobbyDetails.style.display = 'flex';

    if (lobbyDetailsName) lobbyDetailsName.textContent = lobby.name;
    if (lobbyDetailsStatus) lobbyDetailsStatus.textContent = lobby.status === 'in-game' ? 'In Game' : 'Waiting';
    if (lobbyDetailsHost) lobbyDetailsHost.textContent = lobby.hostUsername;

    if (lobbyDetailsCodeArea) lobbyDetailsCodeArea.style.display = lobby.privacy === 'private' ? 'flex' : 'none';
    if (lobbyDetailsCode) lobbyDetailsCode.value = lobby.joinCode || '';

    if (lobbyDetailsPlayers) lobbyDetailsPlayers.innerHTML = '';
    const playerArr = Object.values(lobby.players);
    playerArr.forEach(player => {
        const li = document.createElement('li');
        li.textContent = `${player.username} ${player.socketId === lobby.hostId ? '(Host)' : ''} - ${player.ready ? 'Ready' : 'Not Ready'}`;
        li.style.color = player.color || 'white';
        if (lobbyDetailsPlayers) lobbyDetailsPlayers.appendChild(li);
    });

    const isMyHost = lobby.hostId === myUserId;
    
    if (btnReadyToggle) btnReadyToggle.style.display = 'block';
    
    if (btnStartGameHost) btnStartGameHost.style.display = isMyHost ? 'block' : 'none';
    
    if (hostControls) hostControls.style.display = isMyHost ? 'block' : 'none';
    
    if (btnLeaveLobby) btnLeaveLobby.style.display = 'block';

    const myPlayer = lobby.players[myUserId];
    if (myPlayer) {
        if (btnReadyToggle) {
            btnReadyToggle.textContent = myPlayer.ready ? 'Unready' : 'Ready';
            btnReadyToggle.className = `ready-button ${myPlayer.ready ? 'ready' : 'not-ready'}`;
        }
    }

    if (isMyHost) {
        const allReady = playerArr.length === 2 && playerArr.every(p => p.ready);
        if (btnStartGameHost) {
            btnStartGameHost.disabled = !allReady || lobby.status === 'in-game';
            btnStartGameHost.style.backgroundColor = allReady ? '#27ae60' : '#7f8c8d';
        }

        if (kickPlayerSelect) kickPlayerSelect.innerHTML = '';
        playerArr.filter(p => p.socketId !== myUserId).forEach(p => {
            const option = document.createElement('option');
            option.value = p.socketId;
            option.textContent = p.username;
            if (kickPlayerSelect) kickPlayerSelect.appendChild(option);
        });
        if (btnKickPlayer) btnKickPlayer.disabled = playerArr.length <= 1;
    }
}

function hideAllSubSections() {
    if (joinLobbyForm) joinLobbyForm.style.display = 'none';
    if (currentLobbyDetails) currentLobbyDetails.style.display = 'none';
}

export function updateConnectionStatus(statusText) {
    if (connectionStatus) connectionStatus.textContent = `Status: ${statusText}`;
    if (statusText.includes('Connected')) {
        if (btnConnectServer) {
            btnConnectServer.textContent = 'Connected (Change Server)';
            btnConnectServer.style.backgroundColor = '#27ae60';
        }
        if (lobbySection) lobbySection.style.display = 'block';
        if (onlineMenu) onlineMenu.querySelector('.online-setup-section').style.display = 'none';
    } else {
        if (btnConnectServer) {
            btnConnectServer.textContent = 'Connect to Server';
            btnConnectServer.style.backgroundColor = '#2980b9';
        }
        if (lobbySection) lobbySection.style.display = 'none';
        if (onlineMenu) onlineMenu.querySelector('.online-setup-section').style.display = 'flex';
        
        // Ensure modals are hidden if connection is lost
        if (createLobbyModal) hideModal(createLobbyModal);
        if (shareGameCodeModal) hideModal(shareGameCodeModal);
    }
}