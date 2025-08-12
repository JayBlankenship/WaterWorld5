import * as THREE from 'https://cdn.skypack.dev/three@0.134.0';
import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.134.0/examples/jsm/loaders/GLTFLoader.js';

export class NetworkedPlayer {
    constructor(peerId, scene, isHost = false) {
        this.peerId = peerId;
        this.scene = scene;
        this.isHost = isHost; // Track if this is the host/server player
        
        // Removed player creation logging for performance
        
        // Create the player group that will hold the ship
        this.pawn = new THREE.Group();
        this.pawn.position.set(0, 20, 0); // Start at water level
        
        // Load Ship1.glb for networked players - same model as local player
        const loader = new GLTFLoader();
        loader.load(
            './Ship1.glb',
            (gltf) => {
                // Removed GLTF loading success logging for performance
                const shipModel = gltf.scene;
                
                // Configure the ship to match local player exactly
                shipModel.scale.setScalar(1.0);
                shipModel.position.y = -0.375; // Match local player waterline position
                
                // Apply different colors based on role
                this.applyShipStyling(shipModel, isHost);
                
                this.pawn.add(shipModel);
                this.pawn.shipModel = shipModel; // Store reference
                
                // Initialize interpolation values to current state
                this.initializeInterpolation();
                
                // Removed ship added logging for performance
            },
            (progress) => {
                // Removed GLTF loading progress logging for performance
            },
            (error) => {
                // Removed GLTF loading error logging for performance
                
                // Fallback: create a simple colored ship if GLTF fails
                this.createFallbackShip(isHost);
            }
        );
        
        this.scene.add(this.pawn);
        
        // Network state tracking
        this.lastKnownState = {
            position: { x: 0, y: 20, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            timestamp: Date.now()
        };
        
        // Interpolation state for smooth movement
        this.interpolation = {
            // Current interpolated values
            position: new THREE.Vector3(0, 20, 0),
            rotation: new THREE.Euler(0, 0, 0),
            shipModelPosition: new THREE.Vector3(0, 0, 0),
            shipModelRotation: new THREE.Euler(0, 0, 0),
            
            // Target values from network
            targetPosition: new THREE.Vector3(0, 20, 0),
            targetRotation: new THREE.Euler(0, 0, 0),
            targetShipModelPosition: new THREE.Vector3(0, 0, 0),
            targetShipModelRotation: new THREE.Euler(0, 0, 0),
            
            // Interpolation settings
            positionLerpSpeed: 8.0, // How fast to lerp position
            rotationLerpSpeed: 6.0, // How fast to lerp rotation
            shipModelLerpSpeed: 10.0 // Fast lerp for ship model details
        };
        
        // Network status
        this.lastUpdateTime = Date.now();
        this.isActive = true;
        this.hasReceivedFirstUpdate = false; // Track if we've received network data yet
        
        // Removed networked ship creation logging for performance
    }
    
    // Apply visual styling based on player role
    applyShipStyling(shipModel, isHost) {
        const color = isHost ? new THREE.Color(0x00FF00) : new THREE.Color(0xFF0000); // Green for host, red for clients
        const colorName = isHost ? 'GREEN (HOST)' : 'RED (CLIENT)';
        
        shipModel.traverse((child) => {
            if (child.isMesh && child.material) {
                // Clone material to avoid affecting other instances
                child.material = child.material.clone();
                
                // Apply color tint
                if (child.material.color) {
                    child.material.color.lerp(color, 0.3); // 30% color tint
                }
                
                // Add emissive glow for visibility
                if (child.material.emissive) {
                    child.material.emissive.copy(color);
                    child.material.emissiveIntensity = 0.15;
                }
            }
        });
        
        // Removed ship styling logging for performance
    }
    
    // Initialize interpolation values to match current state
    initializeInterpolation() {
        if (this.pawn) {
            // Set current interpolation values to match the pawn's current state
            this.interpolation.position.copy(this.pawn.position);
            this.interpolation.targetPosition.copy(this.pawn.position);
            this.interpolation.rotation.copy(this.pawn.rotation);
            this.interpolation.targetRotation.copy(this.pawn.rotation);
            
            // Initialize ship model interpolation if ship model exists
            if (this.pawn.shipModel) {
                this.interpolation.shipModelPosition.copy(this.pawn.shipModel.position);
                this.interpolation.targetShipModelPosition.copy(this.pawn.shipModel.position);
                this.interpolation.shipModelRotation.copy(this.pawn.shipModel.rotation);
                this.interpolation.targetShipModelRotation.copy(this.pawn.shipModel.rotation);
            }
        }
    }
    
    // Create fallback ship if GLTF loading fails
    createFallbackShip(isHost) {
        const color = isHost ? 0x00FF00 : 0xFF0000; // Green for host, red for clients
        const emissive = isHost ? 0x004400 : 0x440000;
        
        const fallbackGeometry = new THREE.BoxGeometry(3, 1, 6);
        const fallbackMaterial = new THREE.MeshLambertMaterial({ 
            color: color,
            emissive: emissive,
            emissiveIntensity: 0.2
        });
        const fallbackShip = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
        fallbackShip.position.y = -0.375; // Match local player waterline position
        this.pawn.add(fallbackShip);
        this.pawn.shipModel = fallbackShip;
        
        // Initialize interpolation values to current state
        this.initializeInterpolation();
        
        // Removed fallback ship creation logging for performance
    }
    
    // Update the player's state from network data
    updateFromNetwork(state) {
        if (!state || !state.position) {
            // Removed invalid state logging for performance
            return;
        }
        
        this.lastKnownState = { ...state };
        this.lastUpdateTime = Date.now();
        this.isActive = true;
        
        // For the first update, snap immediately to avoid interpolating from spawn position
        if (!this.hasReceivedFirstUpdate) {
            this.hasReceivedFirstUpdate = true;
            
            // Snap to the exact network position for first update
            this.interpolation.position.set(state.position.x, state.position.y, state.position.z);
            this.interpolation.targetPosition.set(state.position.x, state.position.y, state.position.z);
            this.pawn.position.copy(this.interpolation.position);
            
            if (state.rotation) {
                this.interpolation.rotation.set(state.rotation.x, state.rotation.y, state.rotation.z);
                this.interpolation.targetRotation.set(state.rotation.x, state.rotation.y, state.rotation.z);
                this.pawn.rotation.copy(this.interpolation.rotation);
            }
            
            // Snap ship model transforms for first update
            if (state.shipModelRotation && this.pawn.shipModel) {
                this.interpolation.shipModelRotation.set(
                    state.shipModelRotation.x, 
                    state.shipModelRotation.y, 
                    state.shipModelRotation.z
                );
                this.interpolation.targetShipModelRotation.copy(this.interpolation.shipModelRotation);
                this.pawn.shipModel.rotation.copy(this.interpolation.shipModelRotation);
            }
            
            if (state.shipModelPosition && this.pawn.shipModel) {
                this.interpolation.shipModelPosition.set(
                    state.shipModelPosition.x, 
                    state.shipModelPosition.y, 
                    state.shipModelPosition.z
                );
                this.interpolation.targetShipModelPosition.copy(this.interpolation.shipModelPosition);
                this.pawn.shipModel.position.copy(this.interpolation.shipModelPosition);
                // Force correct waterline position regardless of network data
                this.pawn.shipModel.position.y = -0.375;
            }
            
            // Removed first update logging for performance
            
        } else {
            // For subsequent updates, set new targets for smooth interpolation
            this.interpolation.targetPosition.set(state.position.x, state.position.y, state.position.z);
            
            if (state.rotation) {
                this.interpolation.targetRotation.set(state.rotation.x, state.rotation.y, state.rotation.z);
            }
            
            // Update ship model targets if available
            if (state.shipModelRotation) {
                this.interpolation.targetShipModelRotation.set(
                    state.shipModelRotation.x, 
                    state.shipModelRotation.y, 
                    state.shipModelRotation.z
                );
            }
            
            if (state.shipModelPosition) {
                this.interpolation.targetShipModelPosition.set(
                    state.shipModelPosition.x, 
                    state.shipModelPosition.y, 
                    state.shipModelPosition.z
                );
            }
        }
        
        // Update surge state if available
        if (typeof state.surgeActive !== 'undefined' && this.pawn.setSurge) {
            this.pawn.setSurge(state.surgeActive);
        }
    }
    
    // Update the networked player (called each frame)
    update(deltaTime, animationTime) {
        // Check for network timeout (if no updates received for too long)
        const timeSinceLastUpdate = Date.now() - this.lastUpdateTime;
        const NETWORK_TIMEOUT = 5000; // 5 seconds
        
        if (timeSinceLastUpdate > NETWORK_TIMEOUT && this.isActive) {
            // Removed network timeout logging for performance
            this.isActive = false;
            // Could add visual indicator here (fade out, different color, etc.)
        }
        
        // Smooth interpolation towards target values
        if (this.isActive) {
            // Interpolate main position and rotation
            this.interpolation.position.lerp(this.interpolation.targetPosition, this.interpolation.positionLerpSpeed * deltaTime);
            
            // For rotation, we need to handle the interpolation more carefully to avoid issues with angle wrapping
            this.interpolateEuler(this.interpolation.rotation, this.interpolation.targetRotation, this.interpolation.rotationLerpSpeed * deltaTime);
            
            // Apply interpolated values to the pawn
            this.pawn.position.copy(this.interpolation.position);
            this.pawn.rotation.copy(this.interpolation.rotation);
            
            // Interpolate ship model position and rotation if ship model exists
            if (this.pawn.shipModel) {
                this.interpolation.shipModelPosition.lerp(this.interpolation.targetShipModelPosition, this.interpolation.shipModelLerpSpeed * deltaTime);
                this.interpolateEuler(this.interpolation.shipModelRotation, this.interpolation.targetShipModelRotation, this.interpolation.shipModelLerpSpeed * deltaTime);
                
                this.pawn.shipModel.position.copy(this.interpolation.shipModelPosition);
                // Force correct waterline position regardless of network data
                this.pawn.shipModel.position.y = -0.375;
                this.pawn.shipModel.rotation.copy(this.interpolation.shipModelRotation);
            }
        }
    }
    
    // Helper function to interpolate Euler angles safely
    interpolateEuler(current, target, alpha) {
        // Convert to quaternions for smooth rotation interpolation
        const currentQuat = new THREE.Quaternion().setFromEuler(current);
        const targetQuat = new THREE.Quaternion().setFromEuler(target);
        
        // Spherical linear interpolation (slerp) for smooth rotation
        currentQuat.slerp(targetQuat, alpha);
        
        // Convert back to Euler and update the current rotation
        current.setFromQuaternion(currentQuat, current.order);
    }
    
    // Check if this networked player is currently active
    isPlayerActive() {
        return this.isActive;
    }
    
    // Get the role of this networked player
    getRole() {
        return this.isHost ? 'HOST' : 'CLIENT';
    }
    
    // Remove the networked player from the scene
    destroy() {
        if (this.pawn && this.scene) {
            this.scene.remove(this.pawn);
            // Removed networked ship removal logging for performance
        }
    }
    
    // Get the current position for distance calculations, etc.
    getPosition() {
        return this.pawn.position.clone();
    }
}

// NetworkedPlayerManager - manages all remote player ships
export class NetworkedPlayerManager {
    constructor(scene) {
        this.scene = scene;
        this.networkedPlayers = new Map(); // Map<peerId, NetworkedPlayer>
        this.isMultiplayerMode = false;
        this.localPeerId = null;
        
        // Removed NetworkedPlayerManager initialization logging for performance
        
        // Detect if we're in multiplayer mode
        this.detectMultiplayerMode();
    }
    
    // Detect if we're running in single player or multiplayer mode
    detectMultiplayerMode() {
        // Check if networking system is available and initialized
        if (window.Network && window.Network.isInitialized) {
            this.isMultiplayerMode = true;
            this.localPeerId = window.Network.myPeerId;
            // Removed multiplayer mode detection logging for performance
        } else {
            this.isMultiplayerMode = false;
            // Removed single player mode detection logging for performance
        }
    }
    
    // Check if we should create networked players (only in multiplayer)
    shouldCreateNetworkedPlayers() {
        return this.isMultiplayerMode;
    }
    
    // Add a new networked player ship
    addPlayer(peerId, isHost = false) {
        // Don't create networked players in single player mode
        if (!this.shouldCreateNetworkedPlayers()) {
            // Removed single player mode skip logging for performance
            return;
        }
        
        // Don't create a networked player for ourselves
        if (peerId === this.localPeerId) {
            // Removed self-player creation skip logging for performance
            return;
        }
        
        if (this.networkedPlayers.has(peerId)) {
            // Removed player already exists warning for performance
            return;
        }
        
        const networkedPlayer = new NetworkedPlayer(peerId, this.scene, isHost);
        this.networkedPlayers.set(peerId, networkedPlayer);
        
        // Removed player addition logging for performance
    }
    
    // Remove a networked player
    removePlayer(peerId) {
        const networkedPlayer = this.networkedPlayers.get(peerId);
        if (networkedPlayer) {
            networkedPlayer.destroy();
            this.networkedPlayers.delete(peerId);
            // Removed ship removal logging for performance
        }
    }
    
    // Update a player's state from network data
    updatePlayer(peerId, state) {
        // Only handle updates in multiplayer mode
        if (!this.shouldCreateNetworkedPlayers()) {
            return;
        }
        
        const networkedPlayer = this.networkedPlayers.get(peerId);
        if (networkedPlayer) {
            networkedPlayer.updateFromNetwork(state);
        } else {
            // Removed unknown ship warning for performance
            // Auto-create player if they don't exist (they might have joined mid-game)
            const isHost = window.Network && window.Network.isBase && peerId !== window.Network.myPeerId;
            this.addPlayer(peerId, isHost);
            
            // Try to update again after creation
            const newPlayer = this.networkedPlayers.get(peerId);
            if (newPlayer) {
                newPlayer.updateFromNetwork(state);
            }
        }
    }
    
    // Update all networked player ships (called each frame)
    update(deltaTime, animationTime) {
        // Only update in multiplayer mode
        if (!this.shouldCreateNetworkedPlayers()) {
            return;
        }
        
        for (const [peerId, networkedPlayer] of this.networkedPlayers) {
            networkedPlayer.update(deltaTime, animationTime);
        }
        
        // Clean up inactive players periodically
        this.cleanupInactivePlayers();
    }
    
    // Remove players that haven't been updated in a long time
    cleanupInactivePlayers() {
        const CLEANUP_INTERVAL = 10000; // Check every 10 seconds
        const now = Date.now();
        
        if (!this.lastCleanupTime || now - this.lastCleanupTime > CLEANUP_INTERVAL) {
            this.lastCleanupTime = now;
            
            for (const [peerId, networkedPlayer] of this.networkedPlayers) {
                if (!networkedPlayer.isPlayerActive()) {
                    // Removed inactive player cleanup logging for performance
                    this.removePlayer(peerId);
                }
            }
        }
    }
    
    // Get all networked player ship positions (for terrain generation, etc.)
    getAllPositions() {
        if (!this.shouldCreateNetworkedPlayers()) {
            return [];
        }
        
        const positions = [];
        for (const [peerId, networkedPlayer] of this.networkedPlayers) {
            if (networkedPlayer.isPlayerActive()) {
                positions.push(networkedPlayer.getPosition());
            }
        }
        return positions;
    }
    
    // Get count of active networked players
    getActivePlayerCount() {
        if (!this.shouldCreateNetworkedPlayers()) {
            return 0;
        }
        
        let count = 0;
        for (const [peerId, networkedPlayer] of this.networkedPlayers) {
            if (networkedPlayer.isPlayerActive()) {
                count++;
            }
        }
        return count;
    }
    
    // Get networking mode info
    getNetworkInfo() {
        return {
            isMultiplayer: this.isMultiplayerMode,
            localPeerId: this.localPeerId,
            activePlayerCount: this.getActivePlayerCount(),
            totalPlayerCount: this.networkedPlayers.size
        };
    }
    
    // Clear all networked players
    clear() {
        for (const [peerId, networkedPlayer] of this.networkedPlayers) {
            networkedPlayer.destroy();
        }
        this.networkedPlayers.clear();
        // Removed networked ships clearing logging for performance
    }
}
