// TerrainPlane.js
import * as THREE from 'https://cdn.skypack.dev/three@0.134.0';

export class TerrainPlane {
    constructor(gridX, gridZ, scene, planeSize, planeGeometry, planeMaterial) {
        this.gridX = gridX;
        this.gridZ = gridZ;
        this.scene = scene; // Store the scene reference
        this.planeSize = planeSize; // Store planeSize for use in generateBlocks
        this.position = new THREE.Vector3(gridX * planeSize, -2.5, gridZ * planeSize); // Lower terrain islands further
        // Removed static blue plane mesh; only global animated ocean remains

        // Placeholder for future procedural generation (e.g., height, texture)
        this.terrainData = {
            height: 0, // Default flat plane, can be modified later
            // Add more properties (e.g., noise, features) as needed
        };

        // --- Animated terrain wireframe only (no formations) ---
        this.blockGroup = new THREE.Group();
        // Add blockGroup directly to the scene for proper rendering
        this.scene.add(this.blockGroup);
        this.generateTerrainWireframe(); // Generate only the animated ocean floor
        // Animation state for cartoon sparkly ocean
        this.wavePhase = Math.random() * Math.PI * 2;
        this.waveSpeed = 0.9 + Math.random() * 0.8; // Faster for more animated cartoon effect
        this.waveAmp = 0.15 + Math.random() * 0.1; // Slightly bigger waves for cartoon bounce
        this.waveFreq = 0.3 + Math.random() * 0.3; // More variation in frequency
        this.rotation = 0;
        this.rotationSpeed = (Math.random() > 0.5 ? 1 : -1) * (0.12 + Math.random() * 0.15); // Faster rotation for cartoon effect
        this.crashTimer = 0;
        this.crashActive = false;
        
        // Enhanced cartoon animation properties
        this.sparklePhase = Math.random() * Math.PI * 2; // Sparkle animation phase
        this.sparkleSpeed = 2.0 + Math.random() * 3.0; // Fast sparkle animation
        this.magicalGlowPhase = Math.random() * Math.PI * 2; // Magical glow phase
        this.magicalGlowSpeed = 1.5 + Math.random() * 2.0; // Glow animation speed
        this.bubblePhase = Math.random() * Math.PI * 2; // Bubble effect phase
        this.bubbleSpeed = 1.8 + Math.random() * 2.5; // Bubble animation speed
        
        // Regional ocean behavior randomization
        this.oceanPersonality = this.generateOceanPersonality();
        this.regionalWavePatterns = this.generateRegionalWavePatterns();
        this.localCurrents = this.generateLocalCurrents();
        this.underwaterActivity = this.generateUnderwaterActivity();
        
        // Storm effect variables
        this.stormIntensity = 0;
        this.stormRotation = 0;
        
        // Rocky terrain base heights (will be populated by createLandscapeWireframe)
        this.baseHeights = null;
        
        // Removed cached wireframe geometry (fixes black screen)
        
        // Create sparkle particle system for magical water effects
        this.createSparkleSystem();
        
        // Create underwater depth layers for realistic ocean depth
        this.createUnderwaterDepthLayers();
    }

    // Static helper to update all terrain tiles with storm system
    static updateAllTerrains(tilesArray, terrainGenerator = null) {
        // If we have a terrain generator, get storm intensities for each tile
        for (const tile of tilesArray) {
            let stormIntensity = 0;
            
            if (terrainGenerator) {
                // Calculate storm intensity at this tile's position
                stormIntensity = terrainGenerator.getStormIntensityAtPosition(
                    tile.position.x, 
                    tile.position.z
                );
            }
            
            tile.updateTerrain(stormIntensity);
        }
    }

    // Generate only the animated terrain wireframe (no rock formations)
    generateTerrainWireframe() {
        // Remove previous objects from group and scene
        while (this.blockGroup.children.length > 0) {
            const child = this.blockGroup.children[0];
            this.blockGroup.remove(child);
            if (child instanceof THREE.Object3D) {
                this.scene.remove(child);
            }
        }
        this.scene.remove(this.blockGroup);
        this.blockGroup = new THREE.Group();
        this.scene.add(this.blockGroup);

        // Terrain parameters for water surface
        const gridCells = 6; // Reduced resolution for better performance
        const baseSize = this.planeSize / gridCells; // Exact tile size for seamless connection

        // Add only the digital landscape wireframe mesh with water surface
        this.landscapeWireframe = this.createLandscapeWireframe(gridCells, baseSize);
        this.blockGroup.add(this.landscapeWireframe);
    }

    // Create sparkle particle system for magical water effects
    createSparkleSystem() {
        const sparkleCount = 50; // Number of sparkle particles per tile
        const sparkleGeometry = new THREE.BufferGeometry();
        const sparklePositions = new Float32Array(sparkleCount * 3);
        const sparkleColors = new Float32Array(sparkleCount * 3);
        const sparkleSizes = new Float32Array(sparkleCount);
        
        // Initialize sparkle particles
        for (let i = 0; i < sparkleCount; i++) {
            const i3 = i * 3;
            
            // Random positions across the tile
            sparklePositions[i3] = (Math.random() - 0.5) * this.planeSize;
            sparklePositions[i3 + 1] = -2.0 + Math.random() * 1.0; // Just above water surface
            sparklePositions[i3 + 2] = (Math.random() - 0.5) * this.planeSize;
            
            // Magical sparkle colors (blues, whites, light blues)
            const colorChoice = Math.random();
            if (colorChoice < 0.4) {
                // Bright white sparkles
                sparkleColors[i3] = 1.0;
                sparkleColors[i3 + 1] = 1.0;
                sparkleColors[i3 + 2] = 1.0;
            } else if (colorChoice < 0.7) {
                // Light blue sparkles
                sparkleColors[i3] = 0.4;
                sparkleColors[i3 + 1] = 0.8;
                sparkleColors[i3 + 2] = 1.0;
            } else {
                // Cyan sparkles
                sparkleColors[i3] = 0.0;
                sparkleColors[i3 + 1] = 1.0;
                sparkleColors[i3 + 2] = 1.0;
            }
            
            // Random sparkle sizes
            sparkleSizes[i] = 0.8 + Math.random() * 1.5;
        }
        
        sparkleGeometry.setAttribute('position', new THREE.BufferAttribute(sparklePositions, 3));
        sparkleGeometry.setAttribute('color', new THREE.BufferAttribute(sparkleColors, 3));
        sparkleGeometry.setAttribute('size', new THREE.BufferAttribute(sparkleSizes, 1));
        
        // Sparkle material with emissive glow
        const sparkleMaterial = new THREE.PointsMaterial({
            size: 0.15,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            opacity: 0.7, // Slightly more transparent sparkles to match water
            blending: THREE.AdditiveBlending // Additive blending for glow effect
        });
        
        // Create sparkle particle system
        this.sparkleParticles = new THREE.Points(sparkleGeometry, sparkleMaterial);
        this.sparkleParticles.position.copy(this.position);
        this.scene.add(this.sparkleParticles);
        
        // Store original positions for animation
        this.originalSparklePositions = sparklePositions.slice();
    }

    // Create underwater depth layers to simulate ocean depth
    createUnderwaterDepthLayers() {
        this.depthLayers = [];
        const numLayers = 3; // Multiple depth layers
        
        for (let layer = 0; layer < numLayers; layer++) {
            const depth = -1.0 - (layer * 2.0); // Progressively deeper layers
            const size = this.planeSize * (1.0 + layer * 0.3); // Larger at deeper levels
            const opacity = 0.3 - (layer * 0.08); // Fade with depth
            
            // Create underwater terrain geometry
            const depthGeometry = new THREE.PlaneGeometry(size, size, 8, 8);
            const positions = depthGeometry.attributes.position.array;
            
            // Add underwater terrain features
            for (let i = 1; i < positions.length; i += 3) {
                const x = positions[i - 1];
                const z = positions[i + 1];
                
                // Create underwater hills and valleys
                const underwaterHeight = Math.sin(x * 0.05 + layer) * 0.8 + 
                                       Math.cos(z * 0.04 + layer * 1.5) * 0.6 +
                                       Math.sin((x + z) * 0.03 + layer * 2) * 0.4;
                
                positions[i] = depth + underwaterHeight * (layer + 1) * 0.3;
            }
            
            depthGeometry.attributes.position.needsUpdate = true;
            depthGeometry.computeVertexNormals();
            
            // Underwater material with depth-based coloring
            const depthMaterial = new THREE.MeshLambertMaterial({
                color: new THREE.Color().setHSL(0.6, 0.7, 0.3 - layer * 0.1), // Darker blues with depth
                transparent: true,
                opacity: opacity,
                side: THREE.DoubleSide,
                emissive: new THREE.Color().setHSL(0.65, 0.8, 0.05 - layer * 0.02), // Subtle deep glow
                emissiveIntensity: 0.1
            });
            
            const depthMesh = new THREE.Mesh(depthGeometry, depthMaterial);
            depthMesh.rotation.x = -Math.PI / 2;
            depthMesh.position.copy(this.position);
            depthMesh.position.y += depth;
            
            this.scene.add(depthMesh);
            this.depthLayers.push(depthMesh);
        }
        
        // Add underwater flora/coral for depth reference
        this.createUnderwaterFeatures();
    }

    // Create underwater features for depth perception
    createUnderwaterFeatures() {
        this.underwaterFeatures = [];
        const featureCount = 8;
        
        for (let i = 0; i < featureCount; i++) {
            // Random positions across the tile
            const x = (Math.random() - 0.5) * this.planeSize * 0.8;
            const z = (Math.random() - 0.5) * this.planeSize * 0.8;
            const depth = -2.0 - Math.random() * 3.0; // Various depths
            
            // Create simple underwater column/coral geometry
            const height = 1.0 + Math.random() * 2.0;
            const radius = 0.15 + Math.random() * 0.1;
            const featureGeometry = new THREE.CylinderGeometry(radius, radius * 1.2, height, 6);
            
            // Underwater plant/coral coloring
            const hue = 0.3 + Math.random() * 0.4; // Green to blue range
            const featureMaterial = new THREE.MeshLambertMaterial({
                color: new THREE.Color().setHSL(hue, 0.8, 0.3),
                transparent: true,
                opacity: 0.6,
                emissive: new THREE.Color().setHSL(hue, 0.9, 0.05),
                emissiveIntensity: 0.15
            });
            
            const featureMesh = new THREE.Mesh(featureGeometry, featureMaterial);
            featureMesh.position.set(
                this.position.x + x,
                this.position.y + depth + height/2,
                this.position.z + z
            );
            
            // Add slight random rotation for natural look
            featureMesh.rotation.y = Math.random() * Math.PI * 2;
            featureMesh.rotation.z = (Math.random() - 0.5) * 0.3;
            
            this.scene.add(featureMesh);
            this.underwaterFeatures.push(featureMesh);
        }
    }

    // Generate unique ocean personality for this tile
    generateOceanPersonality() {
        const personalities = [
            {
                name: 'calm_mystical',
                waveIntensity: 0.3,
                sparkleRate: 1.5,
                colorShift: { r: 0.0, g: 0.2, b: 0.4 },
                emissiveBoost: 0.8,
                bubbleFrequency: 0.5
            },
            {
                name: 'energetic_playful',
                waveIntensity: 1.8,
                sparkleRate: 3.0,
                colorShift: { r: 0.3, g: 0.1, b: -0.1 },
                emissiveBoost: 1.5,
                bubbleFrequency: 2.5
            },
            {
                name: 'deep_mysterious',
                waveIntensity: 0.7,
                sparkleRate: 0.8,
                colorShift: { r: -0.2, g: -0.1, b: 0.3 },
                emissiveBoost: 0.4,
                bubbleFrequency: 0.3
            },
            {
                name: 'chaotic_wild',
                waveIntensity: 2.2,
                sparkleRate: 4.0,
                colorShift: { r: 0.2, g: 0.3, b: 0.2 },
                emissiveBoost: 2.0,
                bubbleFrequency: 3.0
            },
            {
                name: 'serene_glassy',
                waveIntensity: 0.1,
                sparkleRate: 0.5,
                colorShift: { r: 0.1, g: 0.3, b: 0.2 },
                emissiveBoost: 0.2,
                bubbleFrequency: 0.1
            },
            {
                name: 'electric_charged',
                waveIntensity: 1.5,
                sparkleRate: 5.0,
                colorShift: { r: 0.4, g: 0.4, b: 0.6 },
                emissiveBoost: 3.0,
                bubbleFrequency: 1.8
            }
        ];
        
        const randomIndex = Math.floor(Math.random() * personalities.length);
        return personalities[randomIndex];
    }

    // Generate regional wave patterns unique to this area
    generateRegionalWavePatterns() {
        return {
            primaryDirection: Math.random() * Math.PI * 2, // Random wave direction
            secondaryDirection: Math.random() * Math.PI * 2,
            crossWaveStrength: Math.random() * 0.8 + 0.2,
            spiralIntensity: Math.random() * 1.5,
            rhythmVariation: Math.random() * 2.0 + 0.5,
            harmonicComplexity: Math.floor(Math.random() * 5) + 2, // 2-6 harmonic layers
            phaseOffset: Math.random() * Math.PI * 2,
            turbulencePattern: Math.random() > 0.5 ? 'swirl' : 'linear'
        };
    }

    // Generate local current systems
    generateLocalCurrents() {
        const currentTypes = ['circular', 'linear', 'spiral', 'zigzag', 'figure8'];
        const currentType = currentTypes[Math.floor(Math.random() * currentTypes.length)];
        
        return {
            type: currentType,
            strength: Math.random() * 1.5 + 0.3,
            direction: Math.random() * Math.PI * 2,
            frequency: Math.random() * 0.8 + 0.2,
            amplitude: Math.random() * 0.5 + 0.1,
            speed: Math.random() * 2.0 + 0.5,
            complexity: Math.random() * 3.0 + 1.0
        };
    }

    // Generate underwater activity patterns
    generateUnderwaterActivity() {
        return {
            thermalVents: Math.random() > 0.7, // 30% chance of thermal vents
            schoolingFish: Math.random() > 0.5, // 50% chance of fish schools
            seaweedDensity: Math.random() * 2.0,
            coralActivity: Math.random() * 1.5,
            bioluminescenceLevel: Math.random() * 3.0,
            currentStrength: Math.random() * 2.0,
            temperatureVariation: Math.random() * 1.0,
            mineralDeposits: Math.random() > 0.8 // 20% chance of mineral sparkles
        };
    }

    // Apply local current effects to wave animation
    applyLocalCurrents(px, pz, phase, amplitude) {
        const current = this.localCurrents;
        let currentEffect = 0;
        
        switch (current.type) {
            case 'circular':
                const radius = Math.sqrt(px * px + pz * pz);
                const angle = Math.atan2(pz, px);
                currentEffect = Math.sin(angle * 2 + phase * current.speed) * 
                              Math.cos(radius * current.frequency) * 
                              amplitude * current.strength * 0.3;
                break;
                
            case 'spiral':
                const spiralRadius = Math.sqrt(px * px + pz * pz);
                const spiralAngle = Math.atan2(pz, px);
                currentEffect = Math.sin(spiralAngle * current.complexity + spiralRadius * current.frequency + phase * current.speed) *
                              amplitude * current.strength * 0.4;
                break;
                
            case 'zigzag':
                currentEffect = Math.sin(px * current.frequency + phase * current.speed) *
                              Math.cos(pz * current.frequency * 1.3 + phase * current.speed * 0.7) *
                              amplitude * current.strength * 0.35;
                break;
                
            case 'figure8':
                const fig8X = Math.sin(phase * current.speed) * current.amplitude;
                const fig8Z = Math.sin(phase * current.speed * 2) * current.amplitude;
                currentEffect = Math.sin((px - fig8X) * current.frequency + (pz - fig8Z) * current.frequency + phase) *
                              amplitude * current.strength * 0.25;
                break;
                
            case 'linear':
            default:
                const dirX = Math.cos(current.direction);
                const dirZ = Math.sin(current.direction);
                currentEffect = Math.sin((px * dirX + pz * dirZ) * current.frequency + phase * current.speed) *
                              amplitude * current.strength * 0.3;
                break;
        }
        
        return currentEffect;
    }

    // Helper to create a single triangulated wireframe mesh for the tile
    createLandscapeWireframe(gridCells, baseSize) {
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const indices = [];
        
        // Generate smooth rocky outcrop terrain with flowing features
        for (let x = 0; x <= gridCells; x++) {
            for (let z = 0; z <= gridCells; z++) {
                // Calculate world position to ensure tiles connect seamlessly
                const px = this.position.x + (x - gridCells / 2) * baseSize;
                const pz = this.position.z + (z - gridCells / 2) * baseSize;
                
                // Create flowing rocky outcrop base height (simplified for performance)
                let baseHeight = this.position.y;
                
                // Simplified terrain generation for better performance
                const primaryFlow = this.generateNoise(px * 0.02, pz * 0.02) * 2.5;
                const secondaryFlow = this.generateNoise(px * 0.06, pz * 0.06) * 1.2;
                
                // Simple ridge pattern
                const ridgePattern = Math.sin(px * 0.03 + pz * 0.02) * 0.8;
                
                // Combine for smooth rocky appearance
                const rockyHeight = primaryFlow + secondaryFlow + ridgePattern;
                const py = baseHeight + rockyHeight;
                
                vertices.push(px, py, pz);
            }
        }
        
        // Create indices for triangulated mesh
        for (let x = 0; x < gridCells; x++) {
            for (let z = 0; z < gridCells; z++) {
                const i0 = x * (gridCells + 1) + z;
                const i1 = (x + 1) * (gridCells + 1) + z;
                const i2 = (x + 1) * (gridCells + 1) + (z + 1);
                const i3 = x * (gridCells + 1) + (z + 1);
                indices.push(i0, i1, i2);
                indices.push(i0, i2, i3);
            }
        }
        
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        
        // Create cartoony water material with sparkles and enhanced effects
        const material = new THREE.MeshLambertMaterial({
            color: 0x0088ff, // Brighter, more vibrant blue for cartoon style
            transparent: true,
            opacity: 0.6, // More transparent to show depth layers underneath
            side: THREE.DoubleSide,
            wireframe: false, // Solid surface
            // Enhanced cartoon water appearance with sparkles
            emissive: 0x002266, // Stronger blue glow for magical effect
            emissiveIntensity: 0.25 // Higher intensity for cartoon sparkle
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.geometry = geometry;
        
        // Store base heights for animation reference
        this.baseHeights = vertices.filter((_, index) => index % 3 === 1); // Y coordinates only
        
        return mesh;
    }

    // Enhanced noise function for smooth flowing rocky outcrops
    generateNoise(x, z) {
        // Simple pseudo-random noise based on position
        const seed = this.gridX * 1000 + this.gridZ; // Tile-specific seed for consistency
        
        // Multiple octaves of smooth sine-based noise for flowing terrain
        let noise = 0;
        
        // Primary flowing waves (large gentle undulations)
        noise += Math.sin(x + seed) * 0.45;
        noise += Math.cos(z + seed * 1.3) * 0.35;
        
        // Secondary cross-patterns (creates ridge-like formations)
        noise += Math.sin(x * 1.8 + z * 1.2 + seed * 0.7) * 0.25;
        noise += Math.cos(x * 1.4 + z * 2.1 + seed * 1.9) * 0.15;
        
        // Tertiary fine detail (subtle surface variation)
        noise += Math.sin(x * 3.2 + z * 2.8 + seed * 0.4) * 0.08;
        
        // Add smooth randomness for natural variation
        const hash1 = Math.sin(x * 12.9898 + z * 78.233 + seed) * 43758.5453;
        const hash2 = Math.cos(x * 93.9898 + z * 67.345 + seed * 1.5) * 28474.3829;
        const smoothRandom = ((hash1 - Math.floor(hash1)) + (hash2 - Math.floor(hash2))) * 0.15;
        noise += smoothRandom;
        
        // Apply smoothing function for more organic curves
        return Math.tanh(noise * 0.8) * 1.25; // tanh creates smooth S-curves
    }

    // Method to update terrain with storm effects for wireframe only
    updateTerrain(stormIntensity = 0) {
        this.stormIntensity = stormIntensity;
        
        // Animate terrain wireframe mesh
        if (this.landscapeWireframe) {
            this.animateLandscapeWireframe(window.deltaTime || 0.016); // fallback to 60fps
        }
    }

    animateLandscapeWireframe(deltaTime) {
        // Animate phase
        this.wavePhase += deltaTime * this.waveSpeed;
        // Occasionally reverse direction and crash
        this.crashTimer -= deltaTime;
        if (this.crashTimer <= 0) {
            if (Math.random() < 0.2) {
                this.waveSpeed *= -1;
                this.rotationSpeed *= -1;
                this.crashActive = true;
            } else {
                this.crashActive = false;
            }
            this.crashTimer = 2 + Math.random() * 3;
        }
        
        // Animate rotation (enhanced by storms)
        const stormRotationMultiplier = 1.0 + this.stormIntensity * 2.0;
        this.rotation += deltaTime * this.rotationSpeed * stormRotationMultiplier;
        this.blockGroup.rotation.y = this.rotation;
        
        // Cartoony water surface effects with regional personality and sparkles
        if (this.landscapeWireframe.material) {
            // Apply personality-based modifiers
            const personalityMod = this.oceanPersonality;
            const sparkleIntensity = (Math.sin(this.wavePhase * 3.0) * 0.4 + 0.6) * personalityMod.sparkleRate;
            const magicalGlow = (Math.cos(this.wavePhase * 2.5) * 0.3 + 0.7) * personalityMod.emissiveBoost;
            const shimmer = Math.sin(this.wavePhase * 4.0) * Math.cos(this.wavePhase * 3.5) * 0.2 + 0.2;
            
            // Regional color variations based on personality
            const baseBlue = (0.6 + Math.sin(this.wavePhase * 1.2) * 0.2) * sparkleIntensity + personalityMod.colorShift.b;
            const crystalBlue = (0.8 + Math.cos(this.wavePhase * 1.8) * 0.15) * magicalGlow + personalityMod.colorShift.b * 0.5;
            const aquaGreen = (0.3 + Math.sin(this.wavePhase * 2.0) * 0.15) * sparkleIntensity + personalityMod.colorShift.g;
            
            // Personality-influenced sparkle effects
            const sparkle1 = Math.sin(this.wavePhase * 6.0 * personalityMod.sparkleRate) * 0.3 + 0.3;
            const sparkle2 = Math.cos(this.wavePhase * 8.0 * personalityMod.sparkleRate) * 0.25 + 0.25;
            const diamondSparkle = Math.sin(this.wavePhase * 10.0 * personalityMod.sparkleRate) * Math.cos(this.wavePhase * 7.0) * 0.2 + 0.2;
            
            // Regional underwater activity effects
            let thermalGlow = 0;
            if (this.underwaterActivity.thermalVents) {
                thermalGlow = Math.sin(this.wavePhase * 0.5) * 0.2 + 0.2;
            }
            
            let biolumGlow = Math.sin(this.wavePhase * 1.5) * this.underwaterActivity.bioluminescenceLevel * 0.1;
            
            // Storm color effects with enhanced cartoon drama
            if (this.stormIntensity > 0) {
                const stormOpacity = 0.85 + this.stormIntensity * 0.05; // Slightly more transparent during storms
                this.landscapeWireframe.material.opacity = Math.min(stormOpacity, 0.9);
                
                // Dramatic cartoon storm colors with electric sparkles and personality
                if (this.stormIntensity > 1.0) {
                    const lightning = Math.sin(this.wavePhase * 15.0) * 0.3; // Lightning-like flashes
                    const stormSparkle = Math.cos(this.wavePhase * 12.0) * 0.25; // Storm sparkles
                    this.landscapeWireframe.material.color.setRGB(
                        Math.max(0, Math.min(1, 0.1 + lightning + stormSparkle + personalityMod.colorShift.r)), 
                        Math.max(0, Math.min(1, 0.4 + aquaGreen * 0.8 + stormSparkle * 0.7 + personalityMod.colorShift.g)), 
                        Math.max(0, Math.min(1, 0.7 + baseBlue * 0.9 + lightning * 0.5 + personalityMod.colorShift.b))
                    );
                    // Intense personality-modified emissive for storm magic
                    this.landscapeWireframe.material.emissive.setRGB(
                        Math.max(0, 0.1 + lightning * 0.5 + thermalGlow + personalityMod.colorShift.r * 0.2), 
                        Math.max(0, 0.2 + stormSparkle + biolumGlow + personalityMod.colorShift.g * 0.2), 
                        Math.max(0, 0.4 + lightning * 0.3 + personalityMod.colorShift.b * 0.3)
                    );
                } else {
                    // Moderate storm with personality-enhanced sparkly water
                    this.landscapeWireframe.material.color.setRGB(
                        Math.max(0, Math.min(1, sparkle1 * 0.15 + personalityMod.colorShift.r)), 
                        Math.max(0, Math.min(1, aquaGreen + this.stormIntensity * 0.2 + sparkle2 * 0.1 + personalityMod.colorShift.g)), 
                        Math.max(0, Math.min(1, baseBlue + crystalBlue * 0.3 + diamondSparkle * 0.2 + personalityMod.colorShift.b))
                    );
                    // Personality-influenced magical emissive
                    this.landscapeWireframe.material.emissive.setRGB(
                        Math.max(0, 0.02 + thermalGlow * 0.5 + personalityMod.colorShift.r * 0.1), 
                        Math.max(0, 0.08 + sparkle1 * 0.05 + biolumGlow + personalityMod.colorShift.g * 0.1), 
                        Math.max(0, 0.15 + sparkle2 * 0.08 + personalityMod.colorShift.b * 0.2)
                    );
                }
            } else {
                // Normal cartoon water with personality-driven sparkles and magical effects
                this.landscapeWireframe.material.opacity = 0.6; // More transparent to show depth
                
                // Vibrant cartoon water with personality-based constant sparkle animation
                const rainbowShimmer = Math.sin(this.wavePhase * 2.3) * 0.08 + 0.08; // Rainbow effect
                const crystalHighlight = Math.cos(this.wavePhase * 1.7) * 0.1 + 0.1; // Crystal highlights
                
                // Apply personality color shifts and effects
                this.landscapeWireframe.material.color.setRGB(
                    Math.max(0, Math.min(1, sparkle1 * 0.12 + rainbowShimmer + personalityMod.colorShift.r)), 
                    Math.max(0, Math.min(1, aquaGreen + sparkle2 * 0.15 + crystalHighlight + personalityMod.colorShift.g)), 
                    Math.max(0, Math.min(1, baseBlue + crystalBlue * 0.5 + diamondSparkle * 0.25 + shimmer * 0.3 + personalityMod.colorShift.b))
                );
                
                // Personality-enhanced magical sparkle emissive effect
                this.landscapeWireframe.material.emissive.setRGB(
                    Math.max(0, 0.005 + sparkle1 * 0.02 + rainbowShimmer * 0.3 + thermalGlow * 0.2 + personalityMod.colorShift.r * personalityMod.emissiveBoost * 0.1), 
                    Math.max(0, 0.03 + sparkle2 * 0.04 + Math.sin(this.wavePhase * 0.8) * 0.02 + biolumGlow + personalityMod.colorShift.g * personalityMod.emissiveBoost * 0.1), 
                    Math.max(0, 0.06 + diamondSparkle * 0.08 + Math.cos(this.wavePhase * 1.1) * 0.03 + personalityMod.colorShift.b * personalityMod.emissiveBoost * 0.2)
                );
            }
        }
        
        // Animate mesh vertices (enhanced by storms) on top of rocky base
        const pos = this.landscapeWireframe.geometry.attributes.position;
        const gridCells = 6; // Updated to match generateTerrainWireframe
        const baseSize = this.planeSize / gridCells; // Updated to match generateTerrainWireframe
        
        for (let x = 0; x <= gridCells; x++) {
            for (let z = 0; z <= gridCells; z++) {
                const vertexIndex = x * (gridCells + 1) + z;
                // Calculate same world position as terrain generation
                const px = this.position.x + (x - gridCells / 2) * baseSize;
                const pz = this.position.z + (z - gridCells / 2) * baseSize;
                
                // Get the rocky base height for this vertex
                const baseHeight = this.baseHeights ? this.baseHeights[vertexIndex] : (this.position.y + baseSize / 2);
                
                // Enhanced wave animation with procedural texture patterns
                let amp = baseSize * this.waveAmp * 0.5; // Reduced amplitude for subtle waves over rocks
                let freq = this.waveFreq;
                let phase = this.wavePhase;
                
                // === ENHANCED CARTOONY WATER WITH REGIONAL PERSONALITY ===
                
                // Apply regional ocean personality to wave behavior
                let personalityAmp = amp * this.oceanPersonality.waveIntensity;
                let personalityFreq = freq * this.regionalWavePatterns.rhythmVariation;
                let personalityPhase = phase + this.regionalWavePatterns.phaseOffset;
                
                // Primary wave influenced by regional direction
                const dirX = Math.cos(this.regionalWavePatterns.primaryDirection);
                const dirZ = Math.sin(this.regionalWavePatterns.primaryDirection);
                let waveHeight = Math.sin((px * dirX + pz * dirZ) * personalityFreq + personalityPhase) * personalityAmp * 1.2;
                
                // Secondary cross-waves with regional pattern
                const dir2X = Math.cos(this.regionalWavePatterns.secondaryDirection);
                const dir2Z = Math.sin(this.regionalWavePatterns.secondaryDirection);
                waveHeight += Math.cos((px * dir2X + pz * dir2Z) * personalityFreq * 1.3 + personalityPhase * 1.7) * personalityAmp * this.regionalWavePatterns.crossWaveStrength;
                
                // Complex harmonic waves based on regional complexity
                for (let harmonic = 1; harmonic <= this.regionalWavePatterns.harmonicComplexity; harmonic++) {
                    const harmonicFreq = personalityFreq * harmonic * 0.7;
                    const harmonicAmp = personalityAmp * (0.6 / harmonic); // Diminishing amplitude
                    waveHeight += Math.sin(px * harmonicFreq + pz * harmonicFreq * 0.8 + personalityPhase * harmonic) * harmonicAmp;
                }
                
                // Apply local current effects
                const currentInfluence = this.applyLocalCurrents(px, pz, personalityPhase, personalityAmp);
                waveHeight += currentInfluence;
                
                // Regional turbulence patterns
                if (this.regionalWavePatterns.turbulencePattern === 'swirl') {
                    const swirlRadius = Math.sqrt(px * px + pz * pz);
                    const swirlAngle = Math.atan2(pz, px);
                    const swirlWave = Math.sin(swirlRadius * personalityFreq * 0.5 + swirlAngle * 3 + personalityPhase) * personalityAmp * this.regionalWavePatterns.spiralIntensity * 0.4;
                    waveHeight += swirlWave;
                } else {
                    // Linear turbulence
                    const linearTurbulence = Math.sin(px * personalityFreq * 2.1 + pz * personalityFreq * 1.7 + personalityPhase * 2) * personalityAmp * 0.3;
                    waveHeight += linearTurbulence;
                }
                
                // Personality-based sparkle patterns in wave height
                const sparkleIntensityMod = this.oceanPersonality.sparkleRate;
                const sparkleWave1 = Math.sin(px * personalityFreq * 5.0 + personalityPhase * 4.0) * personalityAmp * 0.12 * sparkleIntensityMod;
                const sparkleWave2 = Math.cos(pz * personalityFreq * 6.0 + personalityPhase * 5.0) * personalityAmp * 0.08 * sparkleIntensityMod;
                const diamondSparkleWave = Math.sin(px * personalityFreq * 8.0 + pz * personalityFreq * 7.0 + personalityPhase * 6.0) * personalityAmp * 0.06 * sparkleIntensityMod;
                waveHeight += sparkleWave1 + sparkleWave2 + diamondSparkleWave;
                
                // Personality-based cartoon bubble and foam effects
                const bubbleFreqMod = this.oceanPersonality.bubbleFrequency;
                const bubblePattern1 = Math.sin(px * personalityFreq * 3.0 * bubbleFreqMod + personalityPhase * 2.5) * Math.cos(pz * personalityFreq * 3.5 * bubbleFreqMod + personalityPhase * 2.8);
                const bubblePattern2 = Math.cos(px * personalityFreq * 4.5 * bubbleFreqMod + pz * personalityFreq * 4.0 * bubbleFreqMod + personalityPhase * 3.2);
                waveHeight += (bubblePattern1 + bubblePattern2) * personalityAmp * 0.18 * bubbleFreqMod; // Personality-influenced bubbly foam texture
                
                // Magical shimmer effects in the waves
                const shimmer1 = Math.sin(px * freq * 12.0 + phase * 8.0) * amp * 0.04; // Fast shimmer
                const shimmer2 = Math.cos(pz * freq * 10.0 + phase * 7.0) * amp * 0.03; // Magical glitter
                const rainbowShimmer = Math.sin((px + pz) * freq * 15.0 + phase * 10.0) * amp * 0.02;
                waveHeight += shimmer1 + shimmer2 + rainbowShimmer;
                
                // Cartoon surface tension with exaggerated small waves
                const tension = Math.sin(px * freq * 20.0 + pz * freq * 18.0 + phase * 12.0) * amp * 0.05;
                waveHeight += tension;
                
                // Enhanced crash effect with dramatic cartoon foam and sparkles
                if (this.crashActive) {
                    const crashFoam = Math.sin(px * freq * 2 + phase * 2) * amp * 2.0; // Bigger crash for cartoon effect
                    const crashSparkles = Math.sin(px * freq * 8 + pz * freq * 6 + phase * 5) * amp * 0.5; // Crash sparkles
                    const crashBubbles = Math.cos(px * freq * 10 + pz * freq * 9 + phase * 7) * amp * 0.4; // Dramatic bubbles
                    const crashGlitter = Math.sin(px * freq * 15 + phase * 10) * amp * 0.3; // Magical crash glitter
                    waveHeight += crashFoam + crashSparkles + crashBubbles + crashGlitter;
                }
                
                // Storm effects - add chaotic movement and higher amplitude
                if (this.stormIntensity > 0) {
                    const stormAmp = amp * this.stormIntensity * 2.5;
                    const stormFreq = freq * (1.0 + this.stormIntensity);
                    const stormPhase = phase * (1.0 + this.stormIntensity * 0.5);
                    
                    // Multiple overlapping waves during storms
                    waveHeight += Math.sin(px * stormFreq + stormPhase) * stormAmp * 0.4;
                    waveHeight += Math.cos(pz * stormFreq * 1.3 + stormPhase * 1.7) * stormAmp * 0.25;
                    waveHeight += Math.sin((px + pz) * stormFreq * 0.7 + stormPhase * 2.1) * stormAmp * 0.15;
                    
                    // Chaotic noise during severe storms - affects the rocky base too
                    if (this.stormIntensity > 1.0) {
                        const chaosAmp = (this.stormIntensity - 1.0) * amp * 1.5;
                        waveHeight += (Math.random() - 0.5) * chaosAmp;
                        
                        // During severe storms, even the rocky base shifts slightly
                        const baseShift = (Math.random() - 0.5) * (this.stormIntensity - 1.0) * 0.3;
                        waveHeight += baseShift;
                    }
                }
                
                // Combine rocky base height with wave animation
                const finalHeight = baseHeight + waveHeight;
                pos.setY(vertexIndex, finalHeight);
            }
        }
        pos.needsUpdate = true;
        this.landscapeWireframe.geometry.computeVertexNormals();
        
        // Animate sparkle particles
        if (this.sparkleParticles && this.originalSparklePositions) {
            const sparklePos = this.sparkleParticles.geometry.attributes.position;
            const sparkleColors = this.sparkleParticles.geometry.attributes.color;
            const sparkleSizes = this.sparkleParticles.geometry.attributes.size;
            
            // Update sparkle animation phases
            this.sparklePhase += deltaTime * this.sparkleSpeed;
            this.magicalGlowPhase += deltaTime * this.magicalGlowSpeed;
            this.bubblePhase += deltaTime * this.bubbleSpeed;
            
            for (let i = 0; i < sparklePos.count; i++) {
                const i3 = i * 3;
                
                // Animate sparkle positions with floating motion
                const floatHeight = Math.sin(this.sparklePhase + i * 0.5) * 0.3 + 0.2;
                const driftX = Math.cos(this.magicalGlowPhase + i * 0.3) * 0.1;
                const driftZ = Math.sin(this.bubblePhase + i * 0.7) * 0.1;
                
                sparklePos.setX(i, this.originalSparklePositions[i3] + driftX);
                sparklePos.setY(i, this.originalSparklePositions[i3 + 1] + floatHeight);
                sparklePos.setZ(i, this.originalSparklePositions[i3 + 2] + driftZ);
                
                // Animate sparkle brightness and colors
                const brightness = Math.sin(this.sparklePhase * 2.0 + i * 0.8) * 0.3 + 0.7;
                const colorShift = Math.cos(this.magicalGlowPhase + i * 0.6) * 0.2;
                
                // Cycle through different sparkle colors
                const colorChoice = (Math.sin(this.sparklePhase * 0.3 + i) + 1.0) * 0.5;
                if (colorChoice < 0.33) {
                    // White sparkles
                    sparkleColors.setXYZ(i, brightness, brightness, brightness);
                } else if (colorChoice < 0.66) {
                    // Blue sparkles
                    sparkleColors.setXYZ(i, 0.3 * brightness, 0.7 * brightness, brightness);
                } else {
                    // Cyan sparkles
                    sparkleColors.setXYZ(i, 0.2 * brightness, brightness, brightness);
                }
                
                // Animate sparkle sizes for twinkling effect
                const sizeVariation = Math.sin(this.sparklePhase * 3.0 + i * 1.2) * 0.3 + 0.7;
                sparkleSizes.setX(i, sizeVariation * (0.8 + Math.random() * 0.4));
            }
            
            sparklePos.needsUpdate = true;
            sparkleColors.needsUpdate = true;
            sparkleSizes.needsUpdate = true;
        }
        
        // Animate depth layers for dynamic underwater movement
        if (this.depthLayers) {
            this.depthLayers.forEach((layer, index) => {
                // Subtle movement for depth layers
                const depthPhase = this.wavePhase * 0.3 + index * 0.5;
                const positions = layer.geometry.attributes.position.array;
                
                for (let i = 1; i < positions.length; i += 3) {
                    const x = positions[i - 1];
                    const z = positions[i + 1];
                    const baseDepth = -1.0 - (index * 2.0);
                    
                    // Gentle underwater current animation
                    const currentWave = Math.sin(x * 0.02 + depthPhase) * 0.2 + 
                                      Math.cos(z * 0.015 + depthPhase * 1.2) * 0.15;
                    
                    positions[i] = baseDepth + currentWave;
                }
                
                layer.geometry.attributes.position.needsUpdate = true;
                
                // Animate underwater feature colors for life-like effect
                const glowIntensity = Math.sin(depthPhase + index) * 0.1 + 0.15;
                layer.material.emissiveIntensity = glowIntensity;
            });
        }
        
        // Animate underwater features (sway like sea plants)
        if (this.underwaterFeatures) {
            this.underwaterFeatures.forEach((feature, index) => {
                const swayPhase = this.wavePhase * 0.5 + index * 0.3;
                feature.rotation.z = Math.sin(swayPhase) * 0.2;
                feature.rotation.x = Math.cos(swayPhase * 1.2) * 0.1;
                
                // Animate emissive for underwater bioluminescence effect
                const biolumIntensity = Math.sin(swayPhase * 2.0) * 0.1 + 0.15;
                feature.material.emissiveIntensity = biolumIntensity;
            });
        }
    }

    remove() {
        this.scene.remove(this.mesh); // Remove the plane
        if (this.blockGroup) {
            this.scene.remove(this.blockGroup); // Remove the blocks
        }
        if (this.sparkleParticles) {
            this.scene.remove(this.sparkleParticles); // Remove sparkle particles
        }
        if (this.depthLayers) {
            this.depthLayers.forEach(layer => this.scene.remove(layer)); // Remove depth layers
        }
        if (this.underwaterFeatures) {
            this.underwaterFeatures.forEach(feature => this.scene.remove(feature)); // Remove underwater features
        }
    }
}

// Global helper to update terrain with storm effects every frame
// Usage: call updateExclusionZoneEveryFrame(tilesArray, terrainGenerator) in your animation loop
export function updateExclusionZoneEveryFrame(tilesArray, terrainGenerator = null) {
    TerrainPlane.updateAllTerrains(tilesArray, terrainGenerator);
}

// Ensure global access for animation loop
window.updateExclusionZoneEveryFrame = updateExclusionZoneEveryFrame;