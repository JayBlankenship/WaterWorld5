import * as THREE from 'https://cdn.skypack.dev/three@0.134.0';

export function createStar(color = 0x00FFFF) {  // Default to cyan if no color provided
    const radius = 0.3;
    const vertices = new Float32Array([
        0, 0, 0,
        radius * Math.cos(0), radius * Math.sin(0), 0,
        radius * Math.cos(Math.PI * 2 / 5), radius * Math.sin(Math.PI * 2 / 5), 0,
        radius * Math.cos(Math.PI * 4 / 5), radius * Math.sin(Math.PI * 4 / 5), 0,
        radius * Math.cos(Math.PI * 6 / 5), radius * Math.sin(Math.PI * 6 / 5), 0,
        radius * Math.cos(Math.PI * 8 / 5), radius * Math.sin(Math.PI * 8 / 5), 0
    ]);
    const indices = new Uint16Array([
        0, 1, 0, 2, 0, 3, 0, 4, 0, 5,
        1, 3, 2, 4, 3, 5, 4, 1, 5, 2
    ]);
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    starGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
    const starMaterial = new THREE.LineBasicMaterial({
        color: color,  // Use the passed color
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });

    // Create a group to hold the original star and its clones
    const starGroup = new THREE.Group();
    const star = new THREE.LineSegments(starGeometry, starMaterial);
    star.position.set(0, 0, 0); // Relative to group, adjusted by group position
    starGroup.add(star);

    // Create 3 clones with random rotations and smaller scales
    const clones = [];
    const numClones = 3;
    for (let i = 0; i < numClones; i++) {
        const clone = new THREE.LineSegments(starGeometry, starMaterial);
        // Random initial rotation
        clone.rotation.set(
            Math.random() * 2 * Math.PI,
            Math.random() * 2 * Math.PI,
            Math.random() * 2 * Math.PI
        );
        // Random scale between 0.3 and 0.7 (smaller than original)
        const baseScale = 0.3 + Math.random() * 0.4;
        clone.scale.set(baseScale, baseScale, baseScale);
        // Random spin speed and axis for individual clone spinning
        clone.userData.spinSpeed = (Math.random() - 0.5) * 3; // Increased for more intense clone spinning
        clone.userData.spinAxis = new THREE.Vector3(
            Math.random() - 0.5,
            Math.random() - 0.5,
            Math.random() - 0.5
        ).normalize();
        clone.userData.baseScale = baseScale;
        clones.push(clone);
        starGroup.add(clone);
    }

    // Group-level animation properties
    const baseSpinSpeed = (Math.random() - 0.5) * 8; // Base spin speed, increased for violent spinning
    const groupSpinAxis = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
    ).normalize();

    starGroup.update = function(deltaTime, animationTime, { bottomTipY, topTipY }) {
        const distance = (topTipY - bottomTipY) + 0.35;
        const midpointY = (bottomTipY + topTipY) / 2;
        const maxDistance = 1.8778;
        const minDistance = 1.4333;
        const scaleFactor = Math.max(0, (distance - minDistance) / (maxDistance - minDistance));

        // Update group position (centered at midpoint)
        starGroup.position.set(0, midpointY, 0);

        // Update group rotation with speed increasing with distance
        const spinSpeed = baseSpinSpeed * (1 + scaleFactor * 2); // Spin speed increases up to 3x at max distance
        starGroup.rotation.x += deltaTime * spinSpeed * groupSpinAxis.x;
        starGroup.rotation.y += deltaTime * spinSpeed * groupSpinAxis.y;
        starGroup.rotation.z += deltaTime * spinSpeed * groupSpinAxis.z;

        // Vibrational surge effect: amplitude increases with distance
        const surgeAmplitude = scaleFactor * 0.15; // Increased to 15% surge at max distance
        const surge = Math.sin(animationTime * 6) * surgeAmplitude; // Faster pulsing

        // Update individual stars
        starGroup.children.forEach((child, index) => {
            if (index === 0) {
                // Original star scales from 0 to 0.9 with surge
                const totalScale = scaleFactor * 0.9 * (1 + surge);
                child.scale.set(totalScale, totalScale, totalScale);
            } else {
                // Clones scale proportionally to their base scale with surge
                const cloneScale = scaleFactor * child.userData.baseScale * (1 + surge);
                child.scale.set(cloneScale, cloneScale, cloneScale);
                // Individual clone spinning
                child.rotation.x += deltaTime * child.userData.spinSpeed * child.userData.spinAxis.x;
                child.rotation.y += deltaTime * child.userData.spinSpeed * child.userData.spinAxis.y;
                child.rotation.z += deltaTime * child.userData.spinSpeed * child.userData.spinAxis.z;
            }
        });
    };

    return starGroup;
}