import * as THREE from 'https://cdn.skypack.dev/three@0.134.0';

function pseudoPerlinNoise(t, seed) {
    const a = Math.sin(t * 1.3 + seed) * 1.7;
    const b = Math.sin(t * 0.8 + seed * 1.2) * 1.2;
    const c = Math.sin(t * 2.1 + seed * 0.7) * 0.9;
    return (a + b + c) / 3;
}

export function createPlayerPawn(isAI = false, color = null) {
    // Determine color: custom color takes priority, then AI/human default
    let coneColor;
    if (color !== null) {
        coneColor = color;
    } else {
        coneColor = isAI ? 0xFF00FF : 0x00FFFF;  // Purple for AI, Cyan for human
    }
    
    const coneGeometry = new THREE.ConeGeometry(0.5, 1, 16, 16);
    const coneMaterial = new THREE.MeshBasicMaterial({ 
        color: coneColor,  // Use the determined color
        wireframe: true,
        transparent: true,
        opacity: 0.8
    });

    const playerGroup = new THREE.Group();
    const bottomCone = new THREE.Mesh(coneGeometry, coneMaterial);
    const topCone = new THREE.Mesh(coneGeometry, coneMaterial);
    
    // Base positions
    const originalBottomY = 0.5;
    const originalTopY = 1.8056;
    const originalDistance = originalTopY - originalBottomY;
    
    bottomCone.position.y = originalBottomY;
    topCone.position.y = originalTopY;
    topCone.rotation.x = Math.PI;
    playerGroup.add(bottomCone);
    playerGroup.add(topCone);

    // Organic motion variables
    let bottomSpinSpeed = (Math.random() - 0.5) * 1.0;
    let bottomSpinAngle = Math.PI * (Math.random() * 0.5 + 0.25);
    let topSpinSpeed = (Math.random() - 0.5) * 1.2;
    const noiseSeed = Math.random() * 100;

    // Space effect variables
    let surgeProgress = 0;
    let surgeVelocity = 0;
    let currentPulsePhase = 0;
    const minDistance = originalDistance * 0.9;
    const maxDistance = originalDistance * 2;

    // Space key state (only for human player)
    let isSpacePressed = false;

    // For AI, expose a way to control surge
    if (isAI) {
        playerGroup.__spacePressed = false;
        playerGroup.setSurge = function(active) {
            this.__spacePressed = active;
        };
    } else {
        // Only add spacebar listeners for human player
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !isSpacePressed) {
                isSpacePressed = true;
                surgeVelocity = 0.015;
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                isSpacePressed = false;
            }
        });
    }

    playerGroup.update = function(deltaTime, animationTime) {
        const spaceActive = isAI ? this.__spacePressed : isSpacePressed;
        
        const targetSurge = spaceActive ? 1 : 0;
        const surgeAcceleration = spaceActive ? 0.6 : 1.8;
        surgeVelocity += (targetSurge - surgeProgress) * deltaTime * surgeAcceleration;
        surgeProgress = THREE.MathUtils.clamp(surgeProgress + surgeVelocity * deltaTime * 2, 0, 1);

        if (spaceActive) {
            currentPulsePhase += deltaTime * (1.5 + Math.sin(animationTime * 0.8) * 0.2);
        } else {
            currentPulsePhase *= 0.97;
        }

        const pulseFactor = (Math.sin(currentPulsePhase) * 0.5 + 0.5);
        const targetDistance = minDistance + (maxDistance - minDistance) * 
            easeInOutSine(pulseFactor);
        
        const currentDistance = THREE.MathUtils.lerp(
            originalDistance,
            targetDistance,
            easeOutQuad(surgeProgress)
        );

        const noiseValue = pseudoPerlinNoise(animationTime * (1 + surgeProgress * 0.3), noiseSeed);
        
        bottomCone.position.y = originalBottomY - 
            (currentDistance - originalDistance) * 0.1;
        
        const floatOffset = noiseValue * 0.2222 * (1 - surgeProgress * 0.1);
        topCone.position.y = originalTopY + 
            (currentDistance - originalDistance) + 
            floatOffset;
        
        bottomCone.rotation.y += deltaTime * bottomSpinSpeed * 
            (1 + surgeProgress * 0.8);
        topCone.rotation.y += deltaTime * topSpinSpeed * 
            (1 + surgeProgress * 0.5);
        
        const surgeRotationFactor = easeInOutSine(surgeProgress);
        topCone.rotation.x = Math.PI + noiseValue * 0.15 * (1 + surgeRotationFactor * 0.7);
        topCone.rotation.z = noiseValue * 0.07 * (1 + surgeRotationFactor);

        if (bottomCone.rotation.y > bottomSpinAngle || bottomCone.rotation.y < -bottomSpinAngle) {
            bottomSpinSpeed *= -1 * (0.85 + Math.random() * 0.3);
        }
    };

    function easeOutQuad(x) {
        return 1 - (1 - x) * (1 - x);
    }
    
    function easeInOutSine(x) {
        return -(Math.cos(Math.PI * x) - 1) / 2;
    }

    playerGroup.getConeTips = function() {
        return { 
            bottomTipY: bottomCone.position.y, 
            topTipY: topCone.position.y 
        };
    };

    return playerGroup;
}