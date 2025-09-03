// FILE: dama/client/lobby/lobby.js
import { getSocket, isSocketConnected, connectSocket, disconnectSocket } from '../net/socket.js';
// IMPORT showModal and hideModal from main.js (now authoritative)
import { showScreen, showMessage, setupGame, showModal, hideModal } from '../../main.js';

// REMOVED the local modalBackdrop constant here, as it's owned by main.js
// const modalBackdrop = document.getElementById('modal-backdrop');

const onlineMenu = document.getElementById('online-menu');
const usernameInput = document.getElementById('username-input');
const serverUrlInput = document.getElementById('server-url-input');
const btnConnectServer = document.getElementById('btn-connect-server');
const connectionStatus = document.getElementById('connection-status');

const lobbySection = document.getElementById('lobby-section');
const lobbyListContainer = document.getElementById('lobby-list');
const btnRefreshLobbies = document.getElementById('btn-refresh-lobbies');

const btnShowCreateLobby = document.getElementById('btn-show-create-lobby'); // Button to open create lobby modal

// --- Modal DOM Elements (still need to get refs here) ---
const createLobbyModal = document.getElementById('create-lobby-modal');
const createLobbyNameInputModal = document.getElementById('create-lobby-name-modal');
const createLobbyPrivacySelectModal = document.getElementById('create-lobby-privacy-modal');
const createLobbyPasswordInputModal = document.getElementById('create-lobby-password-modal');
const btnCreateLobbySubmitModal = document.getElementById('btn-create-lobby-submit-modal');
const btnCloseCreateLobby = document.querySelector('.btn-close-create-lobby');
const btnCancelCreateLobby = document.querySelector('.btn-cancel-create-lobby');

const lobbyDetailsModal = document.getElementById('lobby-details-modal');
const btnCloseLobbyDetailsModal = document.querySelector('.btn-close-lobby-details-modal');

const joinPrivateLobbyModal = document.getElementById('join-private-lobby-modal');
const joinPrivateLobbyPasswordInputModal = document.getElementById('join-private-lobby-password-modal');
const btnJoinPrivateLobbySubmitModal = document.getElementById('btn-join-private-lobby-submit-modal');
const btnCloseJoinPrivateLobbyModal = document.querySelector('.btn-close-join-private-lobby-modal');
const btnCancelJoinPrivateLobbyModal = document.querySelector('.btn-cancel-join-private-lobby-modal');

const joinLobbyForm = document.getElementById('join-lobby-form');
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

// REMOVED the local showModal/hideModal functions as they are now imported from main.js
/*
// Original local showModal
function showModal(modalElement) {
    if (!modalBackdrop) {
        console.error("showModal: modalBackdrop element not found!");
        return;
    }
    modalBackdrop.classList.add('show');
    if (modalElement) modalElement.classList.add('show');
}

// Original local hideModal
function hideModal(modalElement) {
    if (modalElement) modalElement.classList.remove('show');
    const isCreateLobbyActive = createLobbyModal && createLobbyModal.classList.contains('show');
    const isLobbyDetailsActive = lobbyDetailsModal && lobbyDetailsModal.classList.contains('show');
    const isJoinPrivateLobbyActive = joinPrivateLobbyModal && joinPrivateLobbyModal.classList.contains('show');
    if (!isCreateLobbyActive && !isLobbyDetailsActive && !isJoinPrivateLobbyActive) {
        if (modalBackdrop) {
            modalBackdrop.classList.remove('show');
        } else {
            console.warn("hideModal: modalBackdrop element not found when trying to hide it.");
        }
    }
}
*/

export function leaveOnlineLobbyConnection() {
    const socket = getSocket();
    if (isSocketConnected()) {
        console.log("Client emitting lobby:leave.");
        socket.emit('lobby:leave');
    }
    currentLobby = null;

    // Use imported hideModal
    if (createLobbyModal) hideModal(createLobbyModal);
    if (lobbyDetailsModal) hideModal(lobbyDetailsModal);
    if (joinPrivateLobbyModal) hideModal(joinPrivateLobbyModal);

    hideAllSubSections();
    if (lobbySection) lobbySection.style.display = 'block';
    if (lobbyListContainer) lobbyListContainer.style.display = 'block';

    if (lobbyListContainer) lobbyListContainer.innerHTML = '<p>Loading lobbies...</p>';
    if (isSocketConnected()) {
        socket.emit('lobby:list:fetch');
    }
}


export function initLobbyUI(updateConnectionStatusCb) {
    if (localStorage.getItem('damaUsername')) {
        usernameInput.value = localStorage.getItem('damaUsername');
        myUsername = usernameInput.value;
    }

    serverUrlInput.value = localStorage.getItem('damaServerUrl') || `${location.protocol}//${location.hostname}:8000`;

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
            socket.off('connect');
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
            if (!isSocketConnected()) {
                showMessage("Please connect to the server first.", 'red');
                return;
            }
            if (createLobbyNameInputModal) createLobbyNameInputModal.value = `${myUsername}'s Game`;
            if (createLobbyPrivacySelectModal) createLobbyPrivacySelectModal.value = 'public';
            if (createLobbyPasswordInputModal) {
                createLobbyPasswordInputModal.value = '';
                createLobbyPasswordInputModal.style.display = 'none';
            }
            if (createLobbyModal) showModal(createLobbyModal); // Use imported showModal
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
                    if (createLobbyModal) hideModal(createLobbyModal); // Use imported hideModal
                    
                    currentLobby = { 
                        id: response.lobbyId, 
                        isHost: true, 
                        joinCode: response.joinCode, 
                        privacy,
                        players: {}
                    };
                } else {
                    showMessage(`Error creating lobby: ${response.message}`, 'red');
                }
            });
        });
    }

    if (copyLobbyCodeBtn && lobbyDetailsCode) {
        copyLobbyCodeBtn.addEventListener('click', () => {
            lobbyDetailsCode.select();
            document.execCommand('copy');
            showMessage('Lobby code copied!', 'green');
        });
    }

    if (btnCloseCreateLobby) {
        btnCloseCreateLobby.addEventListener('click', () => {
            if (createLobbyModal) hideModal(createLobbyModal); // Use imported hideModal
        });
    }

    if (btnCancelCreateLobby) {
        btnCancelCreateLobby.addEventListener('click', () => {
            if (createLobbyModal) hideModal(createLobbyModal); // Use imported hideModal
        });
    }

    if (btnCloseLobbyDetailsModal) {
        btnCloseLobbyDetailsModal.addEventListener('click', () => {
            if (lobbyDetailsModal) hideModal(lobbyDetailsModal); // Use imported hideModal
            leaveOnlineLobbyConnection();
            showScreen('online-menu');
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
                    currentLobby = { 
                        id: response.lobbyId, 
                        isHost: false,
                        players: {}
                    };
                } else {
                    showMessage(`Error joining lobby: ${response.message}`, 'red');
                }
            });
        });
    }

    if (btnJoinPrivateLobbySubmitModal) {
        btnJoinPrivateLobbySubmitModal.addEventListener('click', () => {
            const socket = getSocket();
            if (!isSocketConnected()) {
                showMessage("Not connected to server.", 'red');
                return;
            }

            const lobbyIdToJoin = joinPrivateLobbyModal.dataset.lobbyId;
            const password = joinPrivateLobbyPasswordInputModal ? joinPrivateLobbyPasswordInputModal.value.trim() : '';

            if (!lobbyIdToJoin) {
                showMessage("Error: Lobby ID not found for joining.", 'red');
                return;
            }

            socket.emit('lobby:join', { lobbyId: lobbyIdToJoin, password: password }, (response) => {
                if (response.success) {
                    showMessage(`Joined lobby!`, 'green');
                    hideModal(joinPrivateLobbyModal); // Use imported hideModal
                    currentLobby = { 
                        id: response.lobbyId, 
                        isHost: false,
                        players: {}
                    };
                } else {
                    showMessage(`Error joining lobby: ${response.message}`, 'red');
                    if (joinPrivateLobbyPasswordInputModal) joinPrivateLobbyPasswordInputModal.value = '';
                }
            });
        });
    }

    if (btnCloseJoinPrivateLobbyModal) {
        btnCloseJoinPrivateLobbyModal.addEventListener('click', () => {
            if (joinPrivateLobbyModal) hideModal(joinPrivateLobbyModal); // Use imported hideModal
            hideAllSubSections();
            if (lobbyListContainer) lobbyListContainer.style.display = 'block';
            if (isSocketConnected()) {
                getSocket().emit('lobby:list:fetch');
            }
        });
    }
    if (btnCancelJoinPrivateLobbyModal) {
        btnCancelJoinPrivateLobbyModal.addEventListener('click', () => {
            if (joinPrivateLobbyModal) hideModal(joinPrivateLobbyModal); // Use imported hideModal
            hideAllSubSections();
            if (lobbyListContainer) lobbyListContainer.style.display = 'block';
            if (isSocketConnected()) {
                getSocket().emit('lobby:list:fetch');
            }
        });
    }


    if (btnReadyToggle) {
        btnReadyToggle.addEventListener('click', () => {
            const socket = getSocket();
            if (!isSocketConnected() || !currentLobby || !currentLobby.id || !myUserId) return;
            if (!currentLobby.players) {
                console.error("currentLobby.players is undefined when toggling ready state.");
                return;
            }
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
            if (!currentLobby.players) {
                console.error("currentLobby.players is undefined when starting game.");
                return;
            }
            const myPlayer = currentLobby.players[myUserId];
            // Host signals ready if not already, then requests game start
            if (myPlayer && !myPlayer.ready) {
                socket.emit('lobby:ready:set', { ready: true });
                setTimeout(() => {
                    socket.emit('lobby:start'); // Emit this event to the server to explicitly start
                    showMessage("Attempting to start game...", 'blue');
                }, 100); // Small delay to ensure ready status propagates
            } else {
                socket.emit('lobby:start'); // Emit this event to the server to explicitly start
                showMessage("Attempting to start game...", 'blue');
            }
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
                const socket = getSocket();
                if (isSocketConnected()) {
                    socket.emit('lobby:close', { lobbyId: currentLobby.id });
                }
            } else {
                leaveOnlineLobbyConnection();
            }
            showScreen('online-menu');
        });
    }

    if (btnKickPlayer) {
        btnKickPlayer.addEventListener('click', () => {
            const socket = getSocket();
            if (isSocketConnected() && currentLobby && currentLobby.isHost && currentLobby.players) {
                const playerIdToKick = kickPlayerSelect ? kickPlayerSelect.value : '';
                if (playerIdToKick && playerIdToKick !== myUserId) {
                    socket.emit('lobby:kick', { lobbyId: currentLobby.id, playerId: playerIdToKick });
                    showMessage(`Attempting to kick player ${currentLobby.players[playerIdToKick]?.username}...`, 'blue');
                } else if (playerIdToKick === myUserId) {
                    showMessage("You cannot kick yourself.", 'red');
                } else {
                    showMessage("Select a player to kick.", 'red');
                }
            }
        });
    }

    document.querySelectorAll('.back-to-lobby-list').forEach(button => {
        button.addEventListener('click', () => {
            if (lobbyDetailsModal) hideModal(lobbyDetailsModal); // Use imported hideModal
            if (joinPrivateLobbyModal) hideModal(joinPrivateLobbyModal); // Use imported hideModal

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
            currentLobby = { ...currentLobby, ...lobby };
        } else if (lobby.players[myUserId]) {
            currentLobby = { ...lobby, isHost: lobby.hostId === myUserId };
            hideAllSubSections();
            if (lobbyDetailsModal) showModal(lobbyDetailsModal); // Use imported showModal
            if (joinPrivateLobbyModal) hideModal(joinPrivateLobbyModal); // Use imported hideModal
        } else {
            if (!currentLobby) {
                const socket = getSocket();
                if (isSocketConnected()) {
                    socket.emit('lobby:list:fetch');
                }
            }
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
        } else {
            const socket = getSocket();
            if (isSocketConnected()) {
                socket.emit('lobby:list:fetch');
            }
        }
    });

    socket.off('game:start');
    socket.on('game:start', (payload) => {
        console.log('Game starting payload:', payload);
        const myPlayer = payload.players[myUserId];
        if (myPlayer) {
            showMessage(`Game started! You are ${myPlayer.color}.`, 'green');
            
            if (lobbyDetailsModal) {
                console.log("[game:start] Hiding lobbyDetailsModal.");
                hideModal(lobbyDetailsModal); // Use imported hideModal
            }
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
    // NEW: Listen for generic server messages
    socket.off('message');
    socket.on('message', (payload) => {
        showMessage(payload.text, payload.type || 'info');
        console.log(`[Server Message] Type: ${payload.type}, Text: ${payload.text}`);
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
        lobbyListContainer.innerHTML = '<p>No lobbies available. Create one!</p>';
        return;
    }

    lobbies.forEach(lobby => {
        const lobbyItem = document.createElement('div');
        lobbyItem.className = 'lobby-item';
        lobbyItem.dataset.lobbyId = lobby.id;
        const privacyIndicator = lobby.privacy === 'private' ? ' (Private)' : '';
        lobbyItem.innerHTML = `
            <span>${lobby.name}${privacyIndicator} (Host: ${lobby.hostUsername})</span>
            <span class="player-count">(${lobby.playerCount}/2)</span>
            <span class="lobby-status">${lobby.status === 'in-game' ? 'In Game' : 'Waiting'}</span>
        `;
        if (lobby.playerCount < 2 && lobby.status === 'waiting') {
            lobbyItem.addEventListener('click', () => {
                console.log(`[LobbyClick] Lobby item "${lobby.name}" (ID: ${lobby.id}, Privacy: ${lobby.privacy}) clicked.`);
                const socket = getSocket();
                if (!isSocketConnected()) {
                    showMessage("Not connected to server.", 'red');
                    console.log('[LobbyClick] Not connected to server, stopping.');
                    return;
                }
                console.log('[LobbyClick] Socket is connected.');

                if (lobby.privacy === 'private') {
                    console.log('[LobbyClick] Lobby is private. Attempting to show password modal.');
                    if (joinPrivateLobbyModal) {
                        joinPrivateLobbyModal.dataset.lobbyId = lobby.id;
                        joinPrivateLobbyPasswordInputModal.value = '';
                        showModal(joinPrivateLobbyModal); // Use imported showModal
                        console.log('[LobbyClick] joinPrivateLobbyModal should now be visible.');
                    } else {
                        console.error('[LobbyClick] ERROR: joinPrivateLobbyModal element not found!');
                    }
                } else {
                    console.log('[LobbyClick] Lobby is public. Attempting to join directly.');
                    socket.emit('lobby:join', { lobbyId: lobby.id }, (response) => {
                        console.log('[LobbyClick] Server response to lobby:join:', response);
                        if (response.success) {
                            showMessage(`Joined lobby "${lobby.name}"!`, 'green');
                            currentLobby = { 
                                id: response.lobbyId, 
                                isHost: false,
                                players: {} 
                            };
                        } else {
                            showMessage(`Error joining lobby: ${response.message}`, 'red');
                        }
                    });
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
        if (lobbyDetailsModal) hideModal(lobbyDetailsModal); // Use imported hideModal
        return;
    }

    if (lobbyDetailsModal) showModal(lobbyDetailsModal); // Use imported showModal

    if (lobbyDetailsName) lobbyDetailsName.textContent = lobby.name;
    if (lobbyDetailsStatus) lobbyDetailsStatus.textContent = lobby.status === 'in-game' ? 'In Game' : 'Waiting';
    if (lobbyDetailsHost) lobbyDetailsHost.textContent = lobby.hostUsername;

    if (lobbyDetailsCodeArea) lobbyDetailsCodeArea.style.display = lobby.privacy === 'private' ? 'flex' : 'none';
    if (lobbyDetailsCode) lobbyDetailsCode.value = lobby.joinCode || '';

    if (lobbyDetailsPlayers) lobbyDetailsPlayers.innerHTML = '';
    const playerArr = Object.values(lobby.players || {});
    playerArr.forEach(player => {
        const li = document.createElement('li');
        li.textContent = `${player.username} ${player.socketId === lobby.hostId ? '(Host)' : ''} - ${player.ready ? 'Ready' : 'Not Ready'}`;
        li.style.color = player.color || 'white';
        if (lobbyDetailsPlayers) lobbyDetailsPlayers.appendChild(li);
    });

    const isMyHost = lobby.hostId === myUserId;
    
    if (btnReadyToggle) btnReadyToggle.style.display = 'block';
    
    // This is the button that starts the game. Its visibility/disabled state is crucial.
    if (btnStartGameHost) btnStartGameHost.style.display = isMyHost ? 'block' : 'none';
    
    if (hostControls) hostControls.style.display = isMyHost ? 'block' : 'none';
    
    if (btnLeaveLobby) btnLeaveLobby.style.display = 'block';

    const myPlayer = lobby.players && lobby.players[myUserId];
    if (myPlayer) {
        if (btnReadyToggle) {
            btnReadyToggle.textContent = myPlayer.ready ? 'Unready' : 'Ready';
            btnReadyToggle.className = `ready-button ${myPlayer.ready ? 'ready' : 'not-ready'}`;
        }
    }

    if (isMyHost) {
        const allReady = playerArr.length === 2 && playerArr.every(p => p.ready);
        // CRITICAL FIX: Disable Start Game button if not all ready or not enough players
        if (btnStartGameHost) {
            btnStartGameHost.disabled = !allReady || lobby.status === 'in-game' || playerArr.length < 2;
            btnStartGameHost.style.backgroundColor = btnStartGameHost.disabled ? '#7f8c8d' : '#27ae60';
        }

        if (kickPlayerSelect) kickPlayerSelect.innerHTML = '';
        playerArr.filter(p => p.socketId !== myUserId).forEach(p => {
            const option = document.createElement('option');
            option.value = p.socketId;
            option.textContent = p.username;
            if (kickPlayerSelect) kickPlayerSelect.appendChild(option);
        });
        if (btnKickPlayer) btnKickPlayer.disabled = playerArr.length <= 1; // Kick disabled if only host in lobby
    }
}

function hideAllSubSections() {
    if (joinLobbyForm) joinLobbyForm.style.display = 'none';
    if (lobbyListContainer) lobbyListContainer.style.display = 'none';
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
        if (lobbyDetailsModal) hideModal(lobbyDetailsModal); // Use imported hideModal
        if (joinPrivateLobbyModal) hideModal(joinPrivateLobbyModal); // Use imported hideModal
    }
}