import * as THREE from 'https://cdn.skypack.dev/three@0.134.0';
import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.134.0/examples/jsm/loaders/GLTFLoader.js';
import { createStar } from './star.js';

function pseudoPerlinNoise(t, seed) {
    const a = Math.sin(t * 1.3 + seed) * 1.7;
    const b = Math.sin(t * 0.8 + seed * 1.2) * 1.2;
    const c = Math.sin(t * 2.1 + seed * 0.7) * 0.9;
    return (a + b + c) / 3;
}

// Calculate ocean surface height at given x,z coordinates (matches game.js exactly)
function calculateOceanHeight(x, z) {
    // Access the global ocean variables from game.js
    const globalOceanTime = window.globalOceanTime || 0;
    const globalOceanWaveState = window.globalOceanWaveState || { 
        amp: 1.0, 
        speed: 1.0
    };
    
    // Base ocean level (matches game.js)
    let height = 20.0;
    
    // Apply the exact same simple wave calculation as in game.js
    const t = globalOceanTime;
    
    // Simple waves - no storms, no complex multipliers
    height += Math.sin(0.08 * x + t * 0.6) * 1.0;
    height += Math.cos(0.07 * z + t * 0.4) * 0.8;
    height += Math.sin(0.06 * (x + z) + t * 0.2) * 0.5;
    
    return height;
}

// Calculate ocean surface normal at given x,z coordinates for ship tilting
function calculateOceanSurfaceNormal(x, z, sampleDistance = 0.1) {
    // Sample ocean height at nearby points to calculate surface normal
    const heightCenter = calculateOceanHeight(x, z);
    const heightRight = calculateOceanHeight(x + sampleDistance, z);
    const heightForward = calculateOceanHeight(x, z + sampleDistance);
    
    // Create vectors for the surface
    const vectorRight = new THREE.Vector3(sampleDistance, heightRight - heightCenter, 0);
    const vectorForward = new THREE.Vector3(0, heightForward - heightCenter, sampleDistance);
    
    // Calculate normal using cross product (corrected order for upward normal)
    const normal = new THREE.Vector3();
    normal.crossVectors(vectorForward, vectorRight); // Swapped order to get upward normal
    normal.normalize();
    
    // Ensure normal points upward (positive Y component)
    if (normal.y < 0) {
        normal.negate();
    }
    
    return normal;
}

export function createShipPawn(isAI = false, color = null, showStar = false, onLoadCallback = null) {
    // Determine color: custom color takes priority, then AI/human default
    let shipColor;
    if (color !== null) {
        shipColor = color;
    } else {
        shipColor = isAI ? 0xFF00FF : 0x00FFFF;  // Purple for AI, Cyan for human
    }
    
    const playerGroup = new THREE.Group();
    
    // Create procedural ship geometry as fallback
    // Removed ship creation logging for performance
    
    // Skip placeholder creation - load GLTF directly
    
    // For networked players, immediately create a simple ship without trying to load GLTF
    if (color === 0xFF0000) { // If this is a networked player (red color)
        console.log('Creating simple ship for networked player');
        console.log('Color check passed:', color, '=== 0xFF0000:', color === 0xFF0000);
        
        // Skip creating the simple red box - networked players will use the GLTF model instead
        console.log('Skipping simple ship creation for networked player - will use GLTF model');
        
        // Try to load Ship1.glb for networked players too
        const loader = new GLTFLoader();
        loader.load(
        './Ship1.glb',
        (gltf) => {
            console.log('Ship1.glb loaded successfully for networked player');
            const shipModel = gltf.scene;
            
            // Configure and add the GLTF ship
            shipModel.scale.setScalar(1.0);
            shipModel.position.y = -0.375; // Position ship so waterline is at proper level (3/8 hull underwater)
            
            // Apply color tint to ship materials
            shipModel.traverse((child) => {
                if (child.isMesh && child.material) {
                    child.material = child.material.clone();
                    const colorVector = new THREE.Color(shipColor);
                    if (child.material.color) {
                        child.material.color.lerp(colorVector, 0.2);
                    }
                    if (child.material.emissive) {
                        child.material.emissive.copy(colorVector);
                        child.material.emissiveIntensity = 0.1;
                    }
                }
            });
            
            playerGroup.add(shipModel);
            playerGroup.shipModel = shipModel;
            console.log('Ship1.glb added to networked player group');
        },
        (progress) => {
            console.log('Loading Ship1.glb progress for networked player:', (progress.loaded / progress.total) * 100 + '%');
        },
        (error) => {
            console.error('Error loading Ship1.glb for networked player:', error);
            // If GLTF fails, create a simple non-red placeholder
            const simpleShipGeometry = new THREE.BoxGeometry(3, 1, 6);
            const simpleShipMaterial = new THREE.MeshLambertMaterial({ 
                color: 0x888888, // Gray instead of red
                emissive: new THREE.Color(0x888888),
                emissiveIntensity: 0.1
            });
            const simpleShip = new THREE.Mesh(simpleShipGeometry, simpleShipMaterial);
            simpleShip.position.y = -0.375; // Match waterline position
            playerGroup.add(simpleShip);
            playerGroup.shipModel = simpleShip;
            console.log('Gray fallback ship created for networked player');
        }
        );
    } else {
        console.log('Not a networked player, using GLTF loader. Color:', color);
        // Try to load Ship1.glb for local and AI players
        const loader = new GLTFLoader();
        loader.load(
        './Ship1.glb',
        (gltf) => {
            console.log('Ship1.glb loaded successfully');
            const shipModel = gltf.scene;
            
            // Configure and add the GLTF ship
            shipModel.scale.setScalar(1.0); // Adjust scale as needed
            shipModel.position.y = -0.375; // Position ship so waterline is at proper level (3/8 hull underwater)
            
            // Apply color tint to ship materials
            shipModel.traverse((child) => {
                if (child.isMesh && child.material) {
                    // Clone material to avoid affecting other instances
                    child.material = child.material.clone();
                    
                    // Apply color tint based on player type
                    const colorVector = new THREE.Color(shipColor);
                    if (child.material.color) {
                        child.material.color.lerp(colorVector, 0.2); // 20% color tint
                    }
                    
                    // Add slight emissive glow for visibility
                    if (child.material.emissive) {
                        child.material.emissive.copy(colorVector);
                        child.material.emissiveIntensity = 0.1;
                    }
                }
            });
            
            playerGroup.add(shipModel);
            playerGroup.shipModel = shipModel; // Store reference for animations
            
            console.log('Ship1.glb added to player group');

            if (onLoadCallback) {
                onLoadCallback(playerGroup);
            }
        },
        (progress) => {
            console.log('Loading Ship1.glb progress:', (progress.loaded / progress.total) * 100 + '%');
        },
        (error) => {
            console.error('Error loading Ship1.glb:', error);
            console.log('Using procedural ship geometry fallback');
            
            // Create the procedural ship hull
            const shipGeometry = createFallbackShipGeometry();
            const shipMaterial = new THREE.MeshLambertMaterial({ 
                color: 0x8B4513, // Brown hull color
                emissive: new THREE.Color(shipColor),
                emissiveIntensity: 0.05
            });
            const shipMesh = new THREE.Mesh(shipGeometry, shipMaterial);
            shipMesh.position.y = -0.375; // Match waterline position
            playerGroup.add(shipMesh);
            
            // Add sailing ship details
            addShipDetails(playerGroup, shipColor);
            
            // Store ship reference for animations
            playerGroup.shipModel = shipMesh;

            if (onLoadCallback) {
                onLoadCallback(playerGroup);
            }
        }
        );
    }

    // Create and add star to the player group (positioned above ship) - only if showStar is true
    if (showStar) {
        const star = createStar(shipColor);
        star.position.y = 5.0; // Position star higher above ship
        playerGroup.add(star);
    }

    // Ship motion variables for ocean movement
    let bobPhase = Math.random() * Math.PI * 2;
    let bobSpeed = 0.8 + Math.random() * 0.4;
    let bobAmplitude = 0.15 + Math.random() * 0.1;
    
    let rollPhase = Math.random() * Math.PI * 2;
    let rollSpeed = 0.6 + Math.random() * 0.3;
    let rollAmplitude = 0.05 + Math.random() * 0.03;
    
    let pitchPhase = Math.random() * Math.PI * 2;
    let pitchSpeed = 0.7 + Math.random() * 0.3;
    let pitchAmplitude = 0.03 + Math.random() * 0.02;

    // Add properties for game mechanics
    playerGroup.position.set(0, 20.625, 0); // Start at water level (ocean surface is at y=20) + proper waterline
    playerGroup.velocity = new THREE.Vector3();
    playerGroup.maxSpeed = 8;
    playerGroup.acceleration = 0.15;
    playerGroup.deceleration = 0.92;
    playerGroup.isAI = isAI;
    
    // Create a forward direction vector that stays with the ship
    playerGroup.forwardVector = new THREE.Vector3(0, 0, -1); // Forward is negative Z in Three.js

    // Simplified update function for ship movement following ocean surface
    playerGroup.update = function(deltaTime, animationTime, sailSpeed, moveState, camera) {
        // Calculate the actual ocean surface height at the ship's position
        // Use the global ocean chunk system if available, otherwise fallback to local calculation
        let oceanHeight;
        let surfaceNormal;
        
        if (window.oceanChunkSystem) {
            oceanHeight = window.oceanChunkSystem.getOceanHeightAtPosition(this.position.x, this.position.z);
            surfaceNormal = window.oceanChunkSystem.getOceanSurfaceNormal(this.position.x, this.position.z);
        } else {
            oceanHeight = calculateOceanHeight(this.position.x, this.position.z);
            surfaceNormal = calculateOceanSurfaceNormal(this.position.x, this.position.z);
        }
        
        const shipFloatHeight = 0.625; // Adjusted so 3/8 of hull is underwater
        
        // Ship follows the ocean surface directly - no extra bobbing
        this.position.y = oceanHeight + shipFloatHeight;
        
        // Safety check: ensure ship never goes too far underwater, even during extreme storms
        const minShipHeight = 18.0; // Minimum Y position to prevent ship from going deep underwater
        if (this.position.y < minShipHeight) {
            this.position.y = minShipHeight;
        }
        
        // Ship model follows ocean surface normal for realistic tilting
        if (this.shipModel) {
            // Convert surface normal to rotation angles
            // Calculate pitch (rotation around X axis) from the Z component of normal
            const pitch = Math.asin(-surfaceNormal.z);
            
            // Calculate roll (rotation around Z axis) from the X component of normal
            const roll = Math.asin(surfaceNormal.x);
            
            // Apply rotation to ship model with some damping for smoother movement
            const dampingFactor = 0.1; // Adjust this to make rotation more or less responsive
            
            // Update ship model position and rotation
            this.shipModel.position.y = -0.375; // Fixed waterline position
            this.shipModel.rotation.x += (pitch - this.shipModel.rotation.x) * dampingFactor;
            this.shipModel.rotation.z += (roll - this.shipModel.rotation.z) * dampingFactor;
        }
        
        // Handle movement based on sail mode and controls (only if parameters are provided)
        if (sailSpeed !== undefined && moveState && camera) {
            const isAutoSailing = !moveState.left && !moveState.right && !moveState.backward && sailSpeed > 0;
            
            if (isAutoSailing) {
                // Removed frequent auto-sailing logging for performance
            } else {
                // Removed frequent manual control logging for performance
            }
            
            // Use the ship's forwardVector and rotate it based on current ship rotation
            const worldForward = this.forwardVector.clone();
            worldForward.applyEuler(new THREE.Euler(0, this.rotation.y, 0)); // Apply Y rotation to forward vector
            worldForward.normalize();

            // Removed frequent forward direction logging for performance

            // Ship movement - automatic forward movement based on sail mode
            if (sailSpeed > 0) {
                const movement = worldForward.clone().multiplyScalar(sailSpeed * deltaTime);
                this.position.add(movement);
                // Removed frequent movement logging for performance
            }

            // New simple turning mechanics with better rotation speed
            const turnSpeed = 2.0; // Increased turn speed for responsive control
            if (moveState.left) {
                // Turn left with consistent speed
                this.rotation.y += turnSpeed * deltaTime;
            }
            if (moveState.right) {
                // Turn right with consistent speed
                this.rotation.y -= turnSpeed * deltaTime;
            }

            // Manual reverse with S key (only when pressed in normal mode)
            if (moveState.backward) {
                const reverseMovement = worldForward.clone().multiplyScalar(-sailSpeed * 0.5 * deltaTime);
                this.position.add(reverseMovement);
            }

        }
        
        // Update velocity
        this.velocity.multiplyScalar(this.deceleration);
        
        // No position limits - allow infinite sailing in the ocean world
        // Removed world boundary constraints to enable unlimited exploration
    };

    // Removed old keyboard controls - now using sail-based movement system from game.js

    return playerGroup;
}

// Create a procedural ship hull geometry
function createFallbackShipGeometry() {
    const hullGeometry = new THREE.BufferGeometry();
    const hullVertices = [];
    
    // Create a more detailed ship hull with proper boat shape
    // Bottom keel
    hullVertices.push(0, -0.5, -3);    // stern bottom
    hullVertices.push(0, -0.5, 3);     // bow bottom
    
    // Hull bottom sides
    hullVertices.push(-1.2, -0.4, -2.5); // stern bottom left
    hullVertices.push(1.2, -0.4, -2.5);  // stern bottom right
    hullVertices.push(-1.0, -0.3, 2.5);  // bow bottom left
    hullVertices.push(1.0, -0.3, 2.5);   // bow bottom right
    
    // Hull waterline
    hullVertices.push(-1.5, 0, -2);      // stern waterline left
    hullVertices.push(1.5, 0, -2);       // stern waterline right
    hullVertices.push(-1.2, 0.1, 2);     // bow waterline left
    hullVertices.push(1.2, 0.1, 2);      // bow waterline right
    
    // Deck level
    hullVertices.push(-1.3, 0.5, -1.5);  // stern deck left
    hullVertices.push(1.3, 0.5, -1.5);   // stern deck right
    hullVertices.push(-1.0, 0.6, 1.5);   // bow deck left
    hullVertices.push(1.0, 0.6, 1.5);    // bow deck right
    
    // Upper hull
    hullVertices.push(0, 0.7, -1.5);     // stern deck center
    hullVertices.push(0, 0.8, 1.5);      // bow deck center
    
    const hullVertexArray = new Float32Array(hullVertices);
    
    // Hull face indices for a proper ship shape
    const hullIndices = [
        // Bottom hull
        0, 2, 3, 0, 3, 1,
        1, 3, 5, 1, 5, 4,
        1, 4, 2, 1, 2, 0,
        
        // Lower sides
        2, 6, 7, 2, 7, 3,
        3, 7, 9, 3, 9, 5,
        5, 9, 8, 5, 8, 4,
        4, 8, 6, 4, 6, 2,
        
        // Upper sides
        6, 10, 11, 6, 11, 7,
        7, 11, 13, 7, 13, 9,
        9, 13, 12, 9, 12, 8,
        8, 12, 10, 8, 10, 6,
        
        // Deck
        10, 14, 11,
        11, 14, 15,
        11, 15, 13,
        13, 15, 12,
        12, 15, 14,
        12, 14, 10
    ];

    hullGeometry.setAttribute('position', new THREE.BufferAttribute(hullVertexArray, 3));
    hullGeometry.setIndex(hullIndices);
    hullGeometry.computeVertexNormals();
    
    return hullGeometry;
}

// Add sailing ship details (masts, sails, rigging)
function addShipDetails(shipGroup, shipColor) {
    // === MAIN MAST ===
    const mainMastGeometry = new THREE.CylinderGeometry(0.05, 0.08, 4, 8);
    const mastMaterial = new THREE.MeshLambertMaterial({ color: 0x654321 }); // Dark brown
    const mainMast = new THREE.Mesh(mainMastGeometry, mastMaterial);
    mainMast.position.set(0, 2.5, 0);
    shipGroup.add(mainMast);
    
    // === FORE MAST ===
    const foreMastGeometry = new THREE.CylinderGeometry(0.04, 0.06, 3, 8);
    const foreMast = new THREE.Mesh(foreMastGeometry, mastMaterial);
    foreMast.position.set(0, 2, 1.5);
    shipGroup.add(foreMast);
    
    // === MAIN SAIL ===
    const mainSailGeometry = new THREE.PlaneGeometry(2, 2.5);
    const sailMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xF5F5DC, // Beige
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        emissive: new THREE.Color(shipColor),
        emissiveIntensity: 0.02
    });
    const mainSail = new THREE.Mesh(mainSailGeometry, sailMaterial);
    mainSail.position.set(0, 3, -0.3);
    shipGroup.add(mainSail);
    
    // === FORE SAIL ===
    const foreSailGeometry = new THREE.PlaneGeometry(1.5, 2);
    const foreSail = new THREE.Mesh(foreSailGeometry, sailMaterial);
    foreSail.position.set(0, 2.5, 1.2);
    shipGroup.add(foreSail);
    
    // === JIB SAIL (triangular) ===
    const jibGeometry = new THREE.BufferGeometry();
    const jibVertices = new Float32Array([
        0, 0, 0,      // bottom point
        -0.8, 1.5, 0, // top left
        0.8, 1.5, 0   // top right
    ]);
    jibGeometry.setAttribute('position', new THREE.BufferAttribute(jibVertices, 3));
    jibGeometry.setIndex([0, 1, 2]);
    jibGeometry.computeVertexNormals();
    
    const jibSail = new THREE.Mesh(jibGeometry, sailMaterial);
    jibSail.position.set(0, 1.5, 2.5);
    shipGroup.add(jibSail);
    
    // === RIGGING (simple lines) ===
    const riggingMaterial = new THREE.LineBasicMaterial({ color: 0x333333 });
    
    // Main mast rigging
    const rigging1Geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-1, 4, 0),
        new THREE.Vector3(1, 4, 0)
    ]);
    const rigging1 = new THREE.Line(rigging1Geometry, riggingMaterial);
    shipGroup.add(rigging1);
    
    // Fore mast rigging
    const rigging2Geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.8, 3, 1.5),
        new THREE.Vector3(0.8, 3, 1.5)
    ]);
    const rigging2 = new THREE.Line(rigging2Geometry, riggingMaterial);
    shipGroup.add(rigging2);
    
    // Stay lines (mast to bow/stern)
    const stay1Geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 4.5, 0),
        new THREE.Vector3(0, 1, 3)
    ]);
    const stay1 = new THREE.Line(stay1Geometry, riggingMaterial);
    shipGroup.add(stay1);
    
    const stay2Geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 4.5, 0),
        new THREE.Vector3(0, 1, -2.5)
    ]);
    const stay2 = new THREE.Line(stay2Geometry, riggingMaterial);
    shipGroup.add(stay2);
    
    // === SHIP DETAILS ===
    // Rudder
    const rudderGeometry = new THREE.BoxGeometry(0.1, 1, 0.5);
    const rudderMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    const rudder = new THREE.Mesh(rudderGeometry, rudderMaterial);
    rudder.position.set(0, 0, -3.2);
    shipGroup.add(rudder);
    
    // Bowsprit
    const bowspritGeometry = new THREE.CylinderGeometry(0.03, 0.04, 1.5, 6);
    const bowsprit = new THREE.Mesh(bowspritGeometry, mastMaterial);
    bowsprit.rotation.x = Math.PI / 6; // Angle upward
    bowsprit.position.set(0, 1.2, 3.5);
    shipGroup.add(bowsprit);
}