import * as THREE from 'https://cdn.skypack.dev/three@0.134.0';
import { createPlayerPawn } from './playerPawn.js';
import { createShipPawn } from './shipPawn.js';
// Calculate ocean surface normal at given x,z coordinates for ship tilting
function calculateOceanSurfaceNormal(x, z, sampleDistance = 0.1) {
    const heightCenter = calculateOceanHeight(x, z);
    const heightRight = calculateOceanHeight(x + sampleDistance, z);
    const heightForward = calculateOceanHeight(x, z + sampleDistance);
    const vectorRight = new THREE.Vector3(sampleDistance, heightRight - heightCenter, 0);
    const vectorForward = new THREE.Vector3(0, heightForward - heightCenter, sampleDistance);
    const normal = new THREE.Vector3();
    normal.crossVectors(vectorForward, vectorRight);
    normal.normalize();
    if (normal.y < 0) normal.negate();
    return normal;
}

// Calculate ocean surface height at given x,z coordinates (matches game.js exactly)
function calculateOceanHeight(x, z) {
    const globalOceanTime = window.globalOceanTime || 0;
    let height = 20.0;
    const t = globalOceanTime;
    height += Math.sin(0.08 * x + t * 0.6) * 1.0;
    height += Math.cos(0.07 * z + t * 0.4) * 0.8;
    height += Math.sin(0.06 * (x + z) + t * 0.2) * 0.5;
    return height;
}

export function createAIPlayer(onLoad) {
    createShipPawn(true, null, false, (aiPawn) => {
        // Basic random spawn
        const randX = (Math.random() - 0.5) * 40;
        const randZ = (Math.random() - 0.5) * 40;
        aiPawn.position.set(randX, 0, randZ);

        // Add forward vector and rotationY like the player
        aiPawn.forwardVector = new THREE.Vector3(0, 0, -1); // Forward is negative Z
        aiPawn.rotationY = Math.random() * Math.PI * 2; // Random initial rotation

        // AI controller: pick a new target rotation every few seconds
        let decisionTimer = 0;
        let changeDirectionInterval = 5 + Math.random() * 5; // Change direction less often (5-10s)
        let targetRotationY = aiPawn.rotationY;
        const turnSpeed = 0.7; // Turn slower for less turning
        const aiSpeed = 3.5; // Match player sail speed

        function chooseNewDirection() {
            targetRotationY = Math.random() * Math.PI * 2;
            decisionTimer = 0;
            changeDirectionInterval = 5 + Math.random() * 5;
        }

        aiPawn.updateAI = function(deltaTime, animationTime) {
        // Decision logic
            decisionTimer += deltaTime;
            if (decisionTimer > changeDirectionInterval) {
                chooseNewDirection();
            }

            // Smoothly rotate towards targetRotationY
            let angleDiff = targetRotationY - aiPawn.rotationY;
            angleDiff = ((angleDiff + Math.PI) % (2 * Math.PI)) - Math.PI;
            const maxStep = turnSpeed * deltaTime;
            if (Math.abs(angleDiff) < maxStep) {
                aiPawn.rotationY = targetRotationY;
            } else {
                aiPawn.rotationY += Math.sign(angleDiff) * maxStep;
            }

            // Move forward using rotated forwardVector (like player)
            const worldForward = aiPawn.forwardVector.clone();
            worldForward.applyEuler(new THREE.Euler(0, aiPawn.rotationY, 0));
            worldForward.normalize();
            aiPawn.position.x += worldForward.x * aiSpeed * deltaTime;
            aiPawn.position.z += worldForward.z * aiSpeed * deltaTime;

            // Floating logic
            let oceanY = calculateOceanHeight(aiPawn.position.x, aiPawn.position.z);
            const shipFloatHeight = 0.625;
            aiPawn.position.y = oceanY + shipFloatHeight;
            if (aiPawn.position.y < 18.0) aiPawn.position.y = 18.0;

            // Tilting/leaning logic (match player)
            const surfaceNormal = calculateOceanSurfaceNormal(aiPawn.position.x, aiPawn.position.z);
            if (aiPawn.shipModel) {
                aiPawn.shipModel.position.y = -0.375;
                // Calculate pitch (rotation around X axis) from Z component of normal
                const pitch = Math.asin(-surfaceNormal.z);
                // Calculate roll (rotation around Z axis) from X component of normal
                const roll = Math.asin(surfaceNormal.x);
                // Damping for smooth tilt
                const dampingFactor = 0.1;
                aiPawn.shipModel.rotation.x += (pitch - aiPawn.shipModel.rotation.x) * dampingFactor;
                aiPawn.shipModel.rotation.z += (roll - aiPawn.shipModel.rotation.z) * dampingFactor;
                // Yaw from movement
                aiPawn.shipModel.rotation.y = aiPawn.rotationY;
            }
        };

        if (onLoad) {
            onLoad(aiPawn);
        }
    });
}