// game.js - Main game file  
// Version: Updated 2025-08-02 09:15 - Fixed ship replication bugs

import * as THREE from 'https://cdn.skypack.dev/three@0.134.0';
import { createPlayerPawn } from './playerPawn.js';
import { createShipPawn } from './shipPawn.js';
import { SpectatorPawn } from './spectatorPawn.js'; // Import SpectatorPawn
import { OceanChunkSystem } from './oceanChunkSystem.js'; // Import new ocean system

// --- GLOBAL OCEAN SYSTEM ---
let oceanChunkSystem = null; // New chunk-based ocean system
let globalOceanStartTime = Date.now(); // Absolute timestamp when ocean simulation began
let globalOceanTime = 0; // Current ocean time (calculated from start time)
let globalOceanWaveState = {
    amp: 1.0, // Simple wave amplitude
    speed: 1.0 // Simple wave speed
};

// Make ocean variables globally accessible for ship synchronization
window.globalOceanTime = globalOceanTime;
window.globalOceanStartTime = globalOceanStartTime;
window.globalOceanWaveState = globalOceanWaveState;
import { createAIPlayer } from './ai.js';
import { TerrainPlane } from './terrainPlane.js';
import { TerrainGenerator } from './terrainGenerator.js'; // Import the new class
import { NetworkedPlayerManager } from './networkedPlayer.js'; // Import networked player system

const canvas = document.getElementById('gameCanvas');
const startButton = document.getElementById('startButton');
const menu = document.getElementById('menu');
const pauseMenu = document.getElementById('pauseMenu');
const closeMenuButton = document.getElementById('closeMenu');
const instructions = document.getElementById('instructions');
const thetaSensitivityInput = document.getElementById('thetaSensitivity');
const phiSensitivityInput = document.getElementById('phiSensitivity');
const loadingScreen = document.getElementById('loadingScreen');

// Global state
let isInstructionsVisible = true;
let isGamePaused = false;
let isSettingsOpen = false;
let isSpectatorMode = false; // Add spectator mode state

// Global functions for menu controls
window.resumeGame = function() {
    isGamePaused = false;
    pauseMenu.style.display = 'none';
    if (!document.pointerLockElement) {
        canvas.requestPointerLock();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Update button and loading screen colors to pirate gold
    startButton.style.color = '#FFD700';
    startButton.style.borderColor = '#FFD700';
    startButton.style.textShadow = '0 0 8px #FFD700';
    startButton.style.boxShadow = '0 0 20px #FFD700';
    startButton.addEventListener('click', () => {
        startButton.style.display = 'none';
        canvas.style.display = 'block';
        loadingScreen.style.display = 'flex';
        // If loading text exists, update it to pirate gold
        const loadingText = loadingScreen.querySelector('div');
        if (loadingText) {
            loadingText.textContent = 'Loading Open Waters...';
            loadingText.style.color = '#FFD700';
            loadingText.style.textShadow = '0 0 16px #FFD700';
        }
        initGame();
    });
});

// Load saved settings on page load
function loadSettings() {
    const savedTheta = localStorage.getItem('thetaSensitivity');
    const savedPhi = localStorage.getItem('phiSensitivity');
    if (savedTheta) thetaSensitivityInput.value = savedTheta;
    if (savedPhi) phiSensitivityInput.value = savedPhi;
}

let spectatorPawn = null; // Declare spectatorPawn variable
        
function initGame() {
    const scene = new THREE.Scene();
    
    // Set a simple sky color background
    scene.background = new THREE.Color(0x87ceeb); // Sky blue background
    
    // === SIMPLE LOW-COST LIGHTING SETUP ===
    
    // Ambient light - provides soft overall illumination
    const ambientLight = new THREE.AmbientLight(0x404080, 0.4); // Soft blue ambient light
    scene.add(ambientLight);
    
    // Directional light - simulates sunlight
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 200, 50); // High in the sky
    directionalLight.castShadow = false; // Keep shadows off for performance
    scene.add(directionalLight);
    
    // Optional: Add a subtle second light for fill lighting
    const fillLight = new THREE.DirectionalLight(0x87ceeb, 0.3); // Sky blue fill light
    fillLight.position.set(-50, 100, -100); // From opposite direction
    fillLight.castShadow = false;
    scene.add(fillLight);
    
    // Add global animated ocean mesh (wireframe, ripple effect)
    oceanChunkSystem = new OceanChunkSystem(scene);
    window.oceanChunkSystem = oceanChunkSystem; // Make globally accessible for ship physics
    // ...existing code...
    // Increase far plane to 5000 and near plane to 1.0 for large world and high ocean
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1.0, 5000);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Create ship pawn and star
    let hostedClientAIPlayers = [];
    createShipPawn(false, null, false, (playerPawn) => {
        scene.add(playerPawn);
        // Remove loading screen when player pawn is created
        if (loadingScreen) loadingScreen.style.display = 'none';

        // Initialize networked player manager for multiplayer replication
        const networkedPlayerManager = new NetworkedPlayerManager(scene);
        
        // === NETWORKING SETUP - Refactored for clean architecture ===
        
        // Create a unified networking handler class to manage all network operations
        class GameNetworkingHandler {
            constructor(playerManager, networkInstance) {
                this.playerManager = playerManager;
                this.network = networkInstance;
                this.isMultiplayerMode = this.playerManager.shouldCreateNetworkedPlayers();
                this.hasSentAIToHost = false; // Track if we've sent AI info already
                // Initialize networking if available
                if (this.isMultiplayerMode && this.network) {
                    this.setupNetworkCallbacks();
                }
            }
            
            // Set up all network-related callbacks in one place
            setupNetworkCallbacks() {
                // --- Networked AI Replicants ---
                // Store networked AI replicants on the client
                let networkedAIReplicants = [];
                let pendingReplicantCreations = 0;

                // Handle incoming player state updates from other clients
                this.network.callbacks.handlePlayerState = (peerId, state) => {
                    this.playerManager.updatePlayer(peerId, state);

                    // --- AI Replication: Only on client, only if host sends aiStates ---
                    if (!this.network.isBase && state.aiStates && Array.isArray(state.aiStates)) {
                        // Remove extra replicants if needed
                        while (networkedAIReplicants.length > state.aiStates.length) {
                            const aiReplicant = networkedAIReplicants.pop();
                            scene.remove(aiReplicant);
                        }
                        // Create missing replicants (but don't loop if waiting for callback)
                        while ((networkedAIReplicants.length + pendingReplicantCreations) < state.aiStates.length) {
                            pendingReplicantCreations++;
                            createShipPawn(true, 0x888888, false, (aiReplicant) => {
                                scene.add(aiReplicant);
                                networkedAIReplicants.push(aiReplicant);
                                pendingReplicantCreations--;
                            });
                        }
                        // Update each replicant's state (only if exists)
                        state.aiStates.forEach((aiState, idx) => {
                            const aiReplicant = networkedAIReplicants[idx];
                            if (aiReplicant) {
                                aiReplicant.position.set(
                                    aiState.position.x,
                                    aiState.position.y,
                                    aiState.position.z
                                );
                                aiReplicant.rotationY = aiState.rotationY || 0;
                                if (aiReplicant.shipModel && aiState.shipModelRotation) {
                                    aiReplicant.shipModel.rotation.x = aiState.shipModelRotation.x;
                                    aiReplicant.shipModel.rotation.y = aiState.shipModelRotation.y;
                                    aiReplicant.shipModel.rotation.z = aiState.shipModelRotation.z;
                                }
                                if (aiReplicant.shipModel && aiState.shipModelPosition) {
                                    aiReplicant.shipModel.position.x = aiState.shipModelPosition.x;
                                    aiReplicant.shipModel.position.y = aiState.shipModelPosition.y;
                                    aiReplicant.shipModel.position.z = aiState.shipModelPosition.z;
                                }
                                // --- Ensure replicant AI visuals update immediately ---
                                if (typeof aiReplicant.updateAI === 'function') {
                                    aiReplicant.updateAI(0.016, animationTime);
                                }
                            }
                        });
                    }

                    // Handle ocean synchronization from host
                    if (state.oceanSync && !this.network.isBase) {
                        // Client receives ocean timing from host
                        globalOceanStartTime = state.oceanSync.startTime;
                        window.globalOceanStartTime = globalOceanStartTime;
                        // Optional: Log sync events for debugging (remove in production)
                        // ...existing code...
                    }
                };
                
                // Track when players join/leave the lobby to create/remove networked players
                const originalUpdateUI = this.network.callbacks.updateUI;
                this.network.callbacks.updateUI = (peers) => {
                    // Call original updateUI if it exists
                    if (originalUpdateUI) {
                        originalUpdateUI(peers);
                    }
                    
                    // Trigger networked player creation/cleanup
                    this.updateNetworkedPlayers();
                };
                
                // Initialize networked players after a delay to ensure network is ready
                setTimeout(() => {
                    this.updateNetworkedPlayers();
                }, 1000);
            }
            
            // Handle networked player creation and cleanup - now properly scoped
            updateNetworkedPlayers() {
                if (!this.isMultiplayerMode) {
                    return; // Do nothing in single player mode
                }
                
                // Only create networked players if we're in a complete multiplayer lobby
                if (this.network.isInCompleteLobby && this.network.isInCompleteLobby()) {
                    const currentPeerIds = this.network.getLobbyPeerIds();
                    const existingPeerIds = Array.from(this.playerManager.networkedPlayers.keys());
                    
                    // Add networked players for all other peers in the lobby
                    for (const peerId of currentPeerIds) {
                        if (peerId !== this.network.myPeerId && !this.playerManager.networkedPlayers.has(peerId)) {
                            const isHostPlayer = this.network.isBase && peerId !== this.network.myPeerId;
                            this.playerManager.addPlayer(peerId, isHostPlayer);
                        }
                    }
                    
                    // Remove networked players that are no longer in the lobby
                    for (const peerId of existingPeerIds) {
                        if (!currentPeerIds.includes(peerId)) {
                            this.playerManager.removePlayer(peerId);
                        }
                    }
                    // --- CLIENT: Send AI info to host when joining lobby ---
                    if (!this.network.isBase && !this.hasSentAIToHost) {
                        sendLocalAIToHost();
                        this.hasSentAIToHost = true;
                    }
                }
            }
            
            // Check if we should broadcast player state
            shouldBroadcastState() {
                if (!this.isMultiplayerMode || !this.network || !this.network.isInitialized) {
                    return false;
                }
                
                // ...existing code...
                const hasAnyPeers = this.network.getLobbyPeerIds && this.network.getLobbyPeerIds().length > 0;
                const hasHostConnections = this.network.isBase && 
                    this.network.lobbyPeerConnections && 
                    Object.keys(this.network.lobbyPeerConnections).length > 0;
                const hasClientConnection = !this.network.isBase && 
                    this.network.hostConn && 
                    this.network.hostConn.open;
                    
                return hasAnyPeers || hasHostConnections || hasClientConnection;
            }
            
            // Broadcast player state with proper error handling
            broadcastPlayerState(playerState) {
                if (!this.shouldBroadcastState()) {
                    return false;
                }
                
                try {
                    this.network.broadcastPlayerState(playerState);
                    return true;
                } catch (error) {
                    // ...existing code...
                    return false;
                }
            }
            
            // Get network info for debugging
            getNetworkInfo() {
                if (!this.isMultiplayerMode) {
                    return { mode: 'single-player' };
                }
                
                return {
                    mode: 'multiplayer',
                    isHost: this.network.isBase,
                    peerId: this.network.myPeerId,
                    connectedPeers: this.network.getLobbyPeerIds ? this.network.getLobbyPeerIds().length : 0,
                    isInitialized: this.network.isInitialized
                };
            }
        }
        
        // Initialize the networking handler
        const gameNetworking = new GameNetworkingHandler(networkedPlayerManager, window.Network);

        const aiPlayers = [];
        window.aiPlayers = aiPlayers;
        const numAI = 3; // Example: create 3 AI players

        for (let i = 0; i < numAI; i++) {
            createAIPlayer((aiPawn) => {
                scene.add(aiPawn);
                aiPlayers.push(aiPawn);
                // ...existing code...
            });
        }

        // Terrain system - restored with local generation (no networking)
        const planeSize = 256; // Size of each terrain section
        const planeGeometry = new THREE.PlaneGeometry(planeSize, planeSize, 16, 16);
        const planeMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
        const terrainGenerator = new TerrainGenerator(scene, planeSize, planeGeometry, planeMaterial);
        // Expose terrainGenerator globally for networking callbacks
        window.terrainGenerator = terrainGenerator;


        // === TERRAIN SEED NETWORKING ===
        // Handler for receiving the host's terrain seed on the client
        function receiveHostTerrainSeed(hostSeed) {
            // Print a clear debug message with peer ID and seed
            if (window.Network && window.Network.myPeerId) {
                // ...existing code...
            } else {
                // ...existing code...
            }
            if (window.terrainGenerator && window.terrainGenerator.unifiedTerrain) {
                window.terrainGenerator.unifiedTerrain.onHostSeedReceived(hostSeed, 0);
            } else {
                // ...existing code...
            }
        }
        // Register this handler globally so the network layer can call it
        window.receiveHostTerrainSeed = receiveHostTerrainSeed;

        // Initial camera position - pulled back further for better ocean view
        camera.position.set(0, 8, -18);
        camera.lookAt(playerPawn.position);

        // Calculate initial theta and phi
        const initialOffset = new THREE.Vector3().subVectors(camera.position, playerPawn.position);
        const r = initialOffset.length();
        let theta = Math.atan2(initialOffset.x, initialOffset.z);
        let phi = Math.atan2(initialOffset.y, Math.sqrt(initialOffset.x ** 2 + initialOffset.z ** 2));

        // Mouse controls with Pointer Lock
        let isPointerLocked = false;
        let mouseX = 0;
        let mouseY = 0;
        let thetaSensitivity = parseFloat(thetaSensitivityInput.value);
        let phiSensitivity = parseFloat(phiSensitivityInput.value);

        canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock;

        canvas.addEventListener('click', () => {
            if (!isPointerLocked && !menu.style.display) {
                canvas.requestPointerLock();
            }
        });

        document.addEventListener('pointerlockchange', () => {
            isPointerLocked = document.pointerLockElement === canvas;
        });

        document.addEventListener('mousemove', (e) => {
            if (isPointerLocked) {
                const movementX = e.movementX || e.mozMovementX || 0;
                const movementY = e.movementY || e.mozMovementY || 0;
                
                if (isSpectatorMode) {
                    // Pass mouse movement to spectator pawn
                    spectatorPawn.handleMouseMovement(movementX, movementY);
                } else {
                    // Regular camera mouse input
                    mouseX = movementX;
                    mouseY = movementY;
                }
            }
        });

        // Update and save sensitivity from sliders
        thetaSensitivityInput.addEventListener('input', (e) => {
            thetaSensitivity = parseFloat(e.target.value);
            localStorage.setItem('thetaSensitivity', thetaSensitivity);
        });
        phiSensitivityInput.addEventListener('input', (e) => {
            phiSensitivity = parseFloat(e.target.value);
            localStorage.setItem('phiSensitivity', phiSensitivity);
        });

        // Load settings when the page loads
        loadSettings();

        // Movement controls
        const moveState = { forward: false, backward: false, left: false, right: false };
        const playerSpeed = 5.0;
        let lastTime = performance.now();
        let isMenuOpen = false;
        let animationTime = 0;

        document.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();

            // Global hotkeys
            if (key === 'escape' || key === 'n') {
                isGamePaused = !isGamePaused;
                pauseMenu.style.display = isGamePaused ? 'block' : 'none';
                if (isGamePaused && isPointerLocked) {
                    document.exitPointerLock();
                } else if (!isGamePaused && !isPointerLocked) {
                    canvas.requestPointerLock();
                }
            }

            if (key === 'f1') {
                isInstructionsVisible = !isInstructionsVisible;
                instructions.classList.toggle('hidden', !isInstructionsVisible);
            }

            if (key === 'f2') {
                isSettingsOpen = !isSettingsOpen;
                menu.style.display = isSettingsOpen ? 'block' : 'none';
            }

            // Movement controls only when not paused, not in settings, and not in spectator mode
            if (!isGamePaused && !isSettingsOpen && !isSpectatorMode) {
                if (key === 'w') {
                    // W key increases sail mode
                    toggleSailMode('w');
                }
                if (key === 's') {
                    // S key can decrease sail mode OR provide manual reverse
                    if (currentSailMode === 'noSail') {
                        moveState.backward = true; // Manual reverse when no sail
                    } else {
                        toggleSailMode('s'); // Decrease sail mode
                    }
                }
                if (key === 'a') {
                    moveState.left = true;
                }
                if (key === 'd') {
                    moveState.right = true;
                }
            }

            // --- Spectator mode controls: handle spacebar locally for spectatorPawn only ---
            if (isSpectatorMode && key === ' ') {
                // Only affect local spectator pawn, do not change global state or network
                if (spectatorPawn && typeof spectatorPawn.handleSpacebar === 'function') {
                    spectatorPawn.handleSpacebar();
                }
                // Prevent default browser behavior
                e.preventDefault();
                e.stopPropagation();
            }
        });

        document.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            // Only process movement key releases if not in spectator mode
            if (!isSpectatorMode) {
                if (key === 's') {
                    moveState.backward = false; // Stop manual reverse
                }
                if (key === 'a') {
                    moveState.left = false;
                }
                if (key === 'd') {
                    moveState.right = false;
                }
            }
        });

        closeMenuButton.addEventListener('click', () => {
            isSettingsOpen = false;
            menu.style.display = 'none';
            if (!isPointerLocked) {
                canvas.requestPointerLock();
            }
        });

        // Initialize SpectatorPawn
        spectatorPawn = new SpectatorPawn(scene, camera);

        // Add keybinding for F8 with capture phase
        window.addEventListener('keydown', (event) => {
            if (event.code === 'F8') {
                event.preventDefault();
                event.stopPropagation();
                toggleSpectatorMode();
            }
        }, true); // Use capture phase

        function toggleSpectatorMode() {
            const spectatorIndicator = document.getElementById('spectatorIndicator');
            
            if (isSpectatorMode) {
                // Deactivate spectator mode
                spectatorPawn.deactivate();
                isSpectatorMode = false;
                spectatorIndicator.style.display = 'none';
                // Removed spectator mode logging for performance
            } else {
                // Activate spectator mode
                // Clear all movement states to stop the ship
                moveState.forward = false;
                moveState.backward = false;
                moveState.left = false;
                moveState.right = false;
                
                spectatorPawn.activate();
                isSpectatorMode = true;
                spectatorIndicator.style.display = 'block';
                // Removed spectator mode logging for performance
            }
        }

        // Add sailing speeds logic
        const sailModes = {
            noSail: 0,
            partSail: 2,
            halfSail: 4,
            fullSail: 6
        };
        let currentSailMode = 'noSail';

        // Add UI element to display current sail mode
        const sailModeDisplay = document.createElement('div');
        sailModeDisplay.id = 'sailModeDisplay';
        sailModeDisplay.style.position = 'absolute';
        sailModeDisplay.style.bottom = '10px';
        sailModeDisplay.style.left = '10px';
        sailModeDisplay.style.padding = '10px';
        sailModeDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        sailModeDisplay.style.color = 'white';
        sailModeDisplay.style.fontSize = '16px';
        sailModeDisplay.style.borderRadius = '5px';
        sailModeDisplay.style.zIndex = '1000';
        sailModeDisplay.textContent = `Sail Mode: ${currentSailMode}`;
        document.body.appendChild(sailModeDisplay);

        // Update toggleSailMode to handle 'w' for increase and 's' for decrease
        // Ship now moves independently based on sail mode, not tied to key states
        function toggleSailMode(key) {
            const sailModeKeys = Object.keys(sailModes);
            const currentIndex = sailModeKeys.indexOf(currentSailMode);

            if (key === 'w') {
                currentSailMode = sailModeKeys[(currentIndex + 1) % sailModeKeys.length];
            } else if (key === 's') {
                currentSailMode = sailModeKeys[(currentIndex - 1 + sailModeKeys.length) % sailModeKeys.length];
            }

            const sailSpeed = sailModes[currentSailMode];
            // Removed sail mode logging for performance
            sailModeDisplay.textContent = `Sail Mode: ${currentSailMode} (Speed: ${sailSpeed})`;
        }

        // Animation loop
        // --- Background update loop for AI/network when tab is hidden ---
        let backgroundInterval = null;
        function runGameFrame(deltaTime) {
            // ...existing code from animate body...
            const sailSpeed = sailModes[currentSailMode];
            if (!isGamePaused && !isSettingsOpen) {
                if (!isSpectatorMode) {
                    playerPawn.update(deltaTime, animationTime, sailSpeed, moveState, camera);
                } else {
                    const autoMoveState = { left: false, right: false, backward: false };
                    playerPawn.update(deltaTime, animationTime, sailSpeed, autoMoveState, camera);
                }
            } else {
                playerPawn.update(deltaTime, animationTime);
            }

            if (aiPlayers && aiPlayers.length > 0) {
                aiPlayers.forEach((aiPawn, idx) => {
                    if (typeof aiPawn.updateAI === 'function') {
                        aiPawn.updateAI(deltaTime, animationTime, oceanChunkSystem, playerPawn.position);
                    }
                });
            }
            if (window.Network && window.Network.isBase && hostedClientAIPlayers.length > 0) {
                hostedClientAIPlayers.forEach(aiPawn => {
                    if (typeof aiPawn.updateAI === 'function') {
                        aiPawn.updateAI(deltaTime, animationTime, oceanChunkSystem, playerPawn.position);
                    }
                });
            }

            if (oceanChunkSystem && playerPawn) {
                const currentRealTime = Date.now();
                globalOceanTime = (currentRealTime - globalOceanStartTime) / 1000.0 * 2.0;
                window.globalOceanTime = globalOceanTime;
                window.globalOceanStartTime = globalOceanStartTime;
                window.globalOceanWaveState = globalOceanWaveState;
                oceanChunkSystem.update(deltaTime, playerPawn.position);
            }

            const playerState = {
                position: {
                    x: playerPawn.position.x,
                    y: playerPawn.position.y,
                    z: playerPawn.position.z
                },
                rotation: {
                    x: playerPawn.rotation.x,
                    y: playerPawn.rotation.y,
                    z: playerPawn.rotation.z
                },
                shipModelRotation: playerPawn.shipModel ? {
                    x: playerPawn.shipModel.rotation.x,
                    y: playerPawn.shipModel.rotation.y,
                    z: playerPawn.shipModel.rotation.z
                } : null,
                shipModelPosition: playerPawn.shipModel ? {
                    x: playerPawn.shipModel.position.x,
                    y: playerPawn.shipModel.position.y,
                    z: playerPawn.shipModel.position.z
                } : null,
                surgeActive: playerPawn.surgeActive || false,
                oceanSync: gameNetworking.getNetworkInfo().isHost ? {
                    startTime: globalOceanStartTime,
                    currentTime: globalOceanTime
                } : null,
                aiStates: (gameNetworking.getNetworkInfo().isHost && (aiPlayers.length > 0 || hostedClientAIPlayers.length > 0))
                    ? [
                        ...aiPlayers.map(aiPawn => ({
                            position: {
                                x: aiPawn.position.x,
                                y: aiPawn.position.y,
                                z: aiPawn.position.z
                            },
                            rotationY: aiPawn.rotationY || 0,
                            shipModelRotation: aiPawn.shipModel ? {
                                x: aiPawn.shipModel.rotation.x,
                                y: aiPawn.shipModel.rotation.y,
                                z: aiPawn.shipModel.rotation.z
                            } : null,
                            shipModelPosition: aiPawn.shipModel ? {
                                x: aiPawn.shipModel.position.x,
                                y: aiPawn.shipModel.position.y,
                                z: aiPawn.shipModel.position.z
                            } : null
                        })),
                        ...hostedClientAIPlayers.map(aiPawn => ({
                            position: {
                                x: aiPawn.position.x,
                                y: aiPawn.position.y,
                                z: aiPawn.position.z
                            },
                            rotationY: aiPawn.rotationY || 0,
                            shipModelRotation: aiPawn.shipModel ? {
                                x: aiPawn.shipModel.rotation.x,
                                y: aiPawn.shipModel.rotation.y,
                                z: aiPawn.shipModel.rotation.z
                            } : null,
                            shipModelPosition: aiPawn.shipModel ? {
                                x: aiPawn.shipModel.position.x,
                                y: aiPawn.shipModel.position.y,
                                z: aiPawn.shipModel.position.z
                            } : null
                        }))
                    ]
                    : null
            };

            const now = Date.now();
            if (!window.lastNetworkUpdate || now - window.lastNetworkUpdate > 100) {
                if (gameNetworking.broadcastPlayerState(playerState)) {
                    window.lastNetworkUpdate = now;
                }
            }

            networkedPlayerManager.update(deltaTime, animationTime);
            window.playerPosition = playerPawn.position.clone();

            if (terrainGenerator && typeof terrainGenerator.updateStormSystem === 'function') {
                terrainGenerator.updateStormSystem(deltaTime, playerPawn.position);
            }

            if (terrainGenerator && terrainGenerator.planes && typeof window.updateExclusionZoneEveryFrame === 'function') {
                window.updateExclusionZoneEveryFrame(Array.from(terrainGenerator.planes.values()), terrainGenerator);
            }

            if (terrainGenerator && typeof terrainGenerator.generateNeighboringPlanes === 'function') {
                terrainGenerator.generateNeighboringPlanes(playerPawn.position);
                if (typeof terrainGenerator.removeDistantPlanes === 'function') {
                    terrainGenerator.removeDistantPlanes(playerPawn.position, aiPlayers);
                }
            }

            if (isPointerLocked && (mouseX !== 0 || mouseY !== 0) && !isSpectatorMode) {
                theta -= mouseX * thetaSensitivity;
                phi -= mouseY * phiSensitivity;
                phi = Math.max(0.1, Math.min(1.2, phi));
                theta = ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
                mouseX = 0;
                mouseY = 0;
            }

            if (!isSpectatorMode) {
                const horizontalDistance = r * Math.cos(phi);
                camera.position.x = playerPawn.position.x + horizontalDistance * Math.sin(theta);
                camera.position.z = playerPawn.position.z + horizontalDistance * Math.cos(theta);
                camera.position.y = playerPawn.position.y + r * Math.sin(phi);
                camera.lookAt(playerPawn.position);
            }

            if (isSpectatorMode) {
                spectatorPawn.update(deltaTime);
            }

            renderer.render(scene, camera);
            if (window.Network && window.Network.isBase && hostedClientAIPlayers.length > 0) {
                hostedClientAIPlayers.forEach(aiPawn => {
                    if (typeof aiPawn.updateAI === 'function') {
                        aiPawn.updateAI(deltaTime, animationTime, oceanChunkSystem, playerPawn.position);
                    }
                });
            }
        }

        function animate(currentTime) {
        requestAnimationFrame(animate);
        const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.1);
        lastTime = currentTime;
        animationTime += deltaTime;
        runGameFrame(deltaTime);
        }
        animate(performance.now());

        // --- Network broadcast timer for host ---
        let networkBroadcastInterval = null;
        if (window.Network && window.Network.isBase) {
            // Broadcast playerState every 100ms, independent of game loop
            networkBroadcastInterval = setInterval(() => {
                // Only broadcast if not paused and not in settings
                if (!isGamePaused && !isSettingsOpen) {
                    const playerState = {
                        position: {
                            x: playerPawn.position.x,
                            y: playerPawn.position.y,
                            z: playerPawn.position.z
                        },
                        rotation: {
                            x: playerPawn.rotation.x,
                            y: playerPawn.rotation.y,
                            z: playerPawn.rotation.z
                        },
                        shipModelRotation: playerPawn.shipModel ? {
                            x: playerPawn.shipModel.rotation.x,
                            y: playerPawn.shipModel.rotation.y,
                            z: playerPawn.shipModel.rotation.z
                        } : null,
                        shipModelPosition: playerPawn.shipModel ? {
                            x: playerPawn.shipModel.position.x,
                            y: playerPawn.shipModel.position.y,
                            z: playerPawn.shipModel.position.z
                        } : null,
                        surgeActive: playerPawn.surgeActive || false,
                        oceanSync: gameNetworking.getNetworkInfo().isHost ? {
                            startTime: globalOceanStartTime,
                            currentTime: globalOceanTime
                        } : null,
                        aiStates: (gameNetworking.getNetworkInfo().isHost && (aiPlayers.length > 0 || hostedClientAIPlayers.length > 0))
                            ? [
                                ...aiPlayers.map(aiPawn => ({
                                    position: {
                                        x: aiPawn.position.x,
                                        y: aiPawn.position.y,
                                        z: aiPawn.position.z
                                    },
                                    rotationY: aiPawn.rotationY || 0,
                                    shipModelRotation: aiPawn.shipModel ? {
                                        x: aiPawn.shipModel.rotation.x,
                                        y: aiPawn.shipModel.rotation.y,
                                        z: aiPawn.shipModel.rotation.z
                                    } : null,
                                    shipModelPosition: aiPawn.shipModel ? {
                                        x: aiPawn.shipModel.position.x,
                                        y: aiPawn.shipModel.position.y,
                                        z: aiPawn.shipModel.position.z
                                    } : null
                                })),
                                ...hostedClientAIPlayers.map(aiPawn => ({
                                    position: {
                                        x: aiPawn.position.x,
                                        y: aiPawn.position.y,
                                        z: aiPawn.position.z
                                    },
                                    rotationY: aiPawn.rotationY || 0,
                                    shipModelRotation: aiPawn.shipModel ? {
                                        x: aiPawn.shipModel.rotation.x,
                                        y: aiPawn.shipModel.rotation.y,
                                        z: aiPawn.shipModel.rotation.z
                                    } : null,
                                    shipModelPosition: aiPawn.shipModel ? {
                                        x: aiPawn.shipModel.position.x,
                                        y: aiPawn.shipModel.position.y,
                                        z: aiPawn.shipModel.position.z
                                    } : null
                                }))
                            ]
                            : null
                    };
                    gameNetworking.broadcastPlayerState(playerState);
                }
            }, 100);
            // Clean up interval on unload
            window.addEventListener('beforeunload', () => {
                if (networkBroadcastInterval) clearInterval(networkBroadcastInterval);
            });
        }

        // --- Visibility change handler ---
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (!backgroundInterval) {
                    let lastNetworkUpdateHidden = Date.now();
                    backgroundInterval = setInterval(() => {
                        const deltaTime = 0.1;
                        animationTime += deltaTime;
                        const now = Date.now();
                        // Throttle network updates to every 2000ms
                        const originalLastNetworkUpdate = window.lastNetworkUpdate;
                        if (!originalLastNetworkUpdate || now - originalLastNetworkUpdate > 2000) {
                            // Minimal network state update only
                            try {
                                runGameFrame(deltaTime);
                                window.lastNetworkUpdate = now;
                            } catch (err) {
                                console.error('[NETWORK] Error during background network update:', err);
                            }
                        } else {
                            // Only run minimal AI/physics update, skip network broadcast
                            try {
                                // You may want to refactor runGameFrame to support a 'minimal' mode if needed
                                runGameFrame(deltaTime);
                            } catch (err) {
                                console.error('[NETWORK] Error during background AI update:', err);
                            }
                        }
                    }, 100);
                }
            } else {
                if (backgroundInterval) {
                    clearInterval(backgroundInterval);
                    backgroundInterval = null;
                }
            }
        });

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // --- Step 2: Host receives client AI info and spawns pawns ---
        let clientContributedAIByPeer = {};
        if (window.Network && window.Network.isBase) {
            console.log('[HOST] window.Network.peer:', window.Network.peer);
            window.Network.peer.on('connection', (conn) => {
                console.log('[HOST] New peer connection:', conn.peer);
                conn.on('data', (data) => {
                    console.log('[HOST] Received data from peer', conn.peer, data);
                    if (data && data.type === 'client_ai_info' && Array.isArray(data.aiInfo)) {
                        try {
                            // Remove previous client AI pawns for this connection
                            if (clientContributedAIByPeer[conn.peer]) {
                                clientContributedAIByPeer[conn.peer].forEach(aiPawn => {
                                    scene.remove(aiPawn);
                                    const idx = hostedClientAIPlayers.indexOf(aiPawn);
                                    if (idx !== -1) hostedClientAIPlayers.splice(idx, 1);
                                });
                            }
                            clientContributedAIByPeer[conn.peer] = [];
                            // --- NEW LOGIC: Just spawn 3 new host AI at the client-provided positions ---
                            data.aiInfo.forEach(aiState => {
                                createAIPlayer((aiPawn) => {
                                    let oceanY = (window.oceanChunkSystem && typeof window.oceanChunkSystem.getOceanHeightAt === 'function')
                                        ? window.oceanChunkSystem.getOceanHeightAt(aiState.position.x, aiState.position.z)
                                        : aiState.position.y;
                                    const shipFloatHeight = 0.625;
                                    aiPawn.position.set(
                                        aiState.position.x,
                                        oceanY + shipFloatHeight,
                                        aiState.position.z
                                    );
                                    aiPawn.rotationY = aiState.rotationY || 0;
                                    scene.add(aiPawn);
                                    aiPlayers.push(aiPawn);
                                });
                            });
                            conn.send({ type: 'client_ai_spawned' });
                        } catch (err) {
                            console.error('[HOST] Error handling client_ai_info:', err);
                        }
                    }
                });
                conn.on('close', () => {
                    console.log('[HOST] Connection closed for peer', conn.peer);
                });
                conn.on('error', (err) => {
                    console.error('[HOST] Connection error for peer', conn.peer, err);
                });
                // Add more detailed error logging for PeerJS/WebRTC
                conn.on('iceStateChanged', (state) => {
                    console.warn(`[HOST] ICE state changed for peer ${conn.peer}:`, state);
                });
                conn.on('disconnected', () => {
                    console.warn(`[HOST] Peer ${conn.peer} disconnected.`);
                });
                conn.on('close', () => {
                    console.warn(`[HOST] Peer ${conn.peer} connection closed.`);
                });
            });
        }
    });
    // --- Step 1: Send local AI info to host when joining, with retry/confirmation ---
    function sendLocalAIToHost() {
        window.sendLocalAIToHost = sendLocalAIToHost;
        console.log('[CLIENT] sendLocalAIToHost called');
        if (!window.Network || window.Network.isBase) {
            console.log('[CLIENT] Network not available or is host, aborting AI send');
            return;
        }
        if (!window.aiPlayers || window.aiPlayers.length === 0) {
            console.log('[CLIENT] No AI players to send');
            return;
        }
        // Collect AI info
        const aiInfo = window.aiPlayers.map(aiPawn => ({
            position: {
                x: aiPawn.position.x,
                y: aiPawn.position.y,
                z: aiPawn.position.z
            },
            rotationY: aiPawn.rotationY || 0
        }));
        let aiConfirmed = false;
        let aiSendAttempts = 0;
        const maxAttempts = 5;
        let aiSendTimeout = null;
        function trySendAIInfo() {
            if (aiConfirmed || aiSendAttempts >= maxAttempts) {
                if (!aiConfirmed) {
                    console.warn('[CLIENT] AI info not confirmed after max attempts');
                }
                return;
            }
            aiSendAttempts++;
            if (window.Network.hostConn && window.Network.hostConn.open) {
                window.Network.hostConn.send({ type: 'client_ai_info', aiInfo });
                console.log(`[CLIENT] Sent client_ai_info to host (attempt ${aiSendAttempts})`);
            } else {
                console.log('[CLIENT] hostConn not open, cannot send AI info');
                return;
            }
            // Set up confirmation listener (only once)
            if (aiSendAttempts === 1) {
                window.Network.hostConn.on('data', (data) => {
                    if (data && data.type === 'client_ai_spawned') {
                        if (!aiConfirmed) {
                            aiConfirmed = true;
                            console.log('[CLIENT] Host confirmed AI spawn, destroying local AI pawns');
                            window.aiPlayers.forEach(aiPawn => scene.remove(aiPawn));
                            window.aiPlayers.length = 0;
                            if (aiSendTimeout) clearTimeout(aiSendTimeout);
                            // --- HANDSHAKE: Send 'client_ready' to host after AI sync ---
                            setTimeout(() => {
                                if (window.Network.hostConn && window.Network.hostConn.open) {
                                    window.Network.hostConn.send({ type: 'client_ready', peerId: window.Network.myPeerId });
                                    console.log('[CLIENT] Sent client_ready to host after AI sync');
                                }
                            }, 500); // Short delay after AI sync
                        }
                    }
                });
                window.Network.hostConn.on('close', () => {
                    console.log('[CLIENT] Connection to host closed');
                });
                window.Network.hostConn.on('error', (err) => {
                    console.error('[CLIENT] Connection to host error:', err);
                });
            }
            // Retry after 2 seconds if not confirmed
            aiSendTimeout = setTimeout(() => {
                if (!aiConfirmed) {
                    trySendAIInfo();
                }
            }, 2000);
        }
        trySendAIInfo();
    }
}