// UnifiedTerrain.js - Single dynamic mesh for seamless terrain
import * as THREE from 'https://cdn.skypack.dev/three@0.134.0';
import { seededRandom } from './seededRandom.js';

// Deterministic integer hash for seeding
function hash2D(seed, x, z) {
    // Use only integer math for full determinism
    let h = seed ^ (x * 374761393) ^ (z * 668265263);
    h = (h ^ (h >> 13)) * 1274126177;
    h = h ^ (h >> 16);
    return h >>> 0; // Ensure unsigned
}

export class UnifiedTerrain {
    // Call this on the client when the host's seed is received
    onHostSeedReceived(hostSeed, duration = 0) {
        console.log('[UnifiedTerrain][CLIENT] Received host seed:', hostSeed, 'Rerendering terrain to match host...');
        this.setTerrainSeedAndRegenerate(hostSeed, duration);
    }
    constructor(scene, size = 400, resolution = 64) {
        this.scene = scene;
        this.size = size; // Total terrain size (e.g., 400x400 units)
        this.resolution = resolution; // Grid resolution (e.g., 64x64 vertices)
        this.cellSize = this.size / this.resolution;

        // Animation variables
        this.wavePhase = 0;
        this.waveSpeed = 0.8;
        this.waveAmp = 0.15;
        this.waveFreq = 0.4;

        // Infinite terrain generation system
        this.terrainChunks = new Map(); // Store terrain chunks by key "x,z"
        this.chunkSize = 200; // Size of each terrain chunk
        this.chunkResolution = 32; // Resolution per chunk
        this.renderDistance = 3200; // How far to generate chunks (doubled from 800)

        // Ocean surface
        this.oceanSurface = null;
        // Ocean surface disabled - removed for cleaner terrain view
        // this.createOceanSurface();

        // Terrain seed for deterministic generation
        // If no globalTerrainSeed, generate and save a random one
        if (!window.globalTerrainSeed) {
            window.globalTerrainSeed = Math.floor(Math.random() * 1e9);
            console.log('[UnifiedTerrain] Generated new random terrain seed:', window.globalTerrainSeed);
        }
        this.terrainSeed = window.globalTerrainSeed;
        this.rand = seededRandom(this.terrainSeed);
        console.log('[UnifiedTerrain] Using terrain seed:', this.terrainSeed);

        // For lerping terrain regeneration
        this._regenLerpActive = false;
        this._regenLerpTime = 0;
        this._regenLerpDuration = 0;
        this._regenOldHeights = null;
        this._regenNewHeights = null;
        this._regenSeed = null;
    }

    // Call this when the host's seed arrives
    setTerrainSeedAndRegenerate(seed, duration = 0) {
        // Remove all existing terrain chunks from the scene
        if (this.terrainChunks) {
            for (const [chunkKey, chunk] of this.terrainChunks) {
                if (chunk.mesh && this.scene) {
                    this.scene.remove(chunk.mesh);
                }
            }
            this.terrainChunks.clear();
        }
        // ...existing code...
        window.globalTerrainSeed = seed;
        this.terrainSeed = seed;
        this.rand = seededRandom(this.terrainSeed);
        console.log('[UnifiedTerrain] Host seed received, regenerating terrain:', seed);
        // If terrain chunks already exist, smoothly regenerate them
        if (this.terrainChunks.size > 0) {
            this.regenerateTerrain(seed, duration);
        }
        // If no chunks exist yet, they will be generated with the correct seed on demand
    }
    
    createOceanSurface() {
    // Ocean surface mesh removed; using wiremesh ocean system instead
    }
    
    createTerrainChunk(chunkX, chunkZ) {
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const indices = [];
        const colors = [];
        
        // Calculate world position of this chunk
        const worldOffsetX = chunkX * this.chunkSize;
        const worldOffsetZ = chunkZ * this.chunkSize;
        
        // If no seed, skip terrain generation (return empty chunk)
        if (!this.terrainSeed) {
            return {
                mesh: null,
                chunkX: chunkX,
                chunkZ: chunkZ,
                originalHeights: []
            };
        }
        // Generate vertices for this chunk
        for (let z = 0; z <= this.chunkResolution; z++) {
            for (let x = 0; x <= this.chunkResolution; x++) {
                // World position
                const px = worldOffsetX + (x / this.chunkResolution) * this.chunkSize - this.chunkSize / 2;
                const pz = worldOffsetZ + (z / this.chunkResolution) * this.chunkSize - this.chunkSize / 2;

                // Generate terrain height using noise
                const height = this.generateTerrainHeight(px, pz);

                vertices.push(px, height, pz);

                    // Height-based coloring to match provided images
                    // Deep water: dark blue, shallow water: blue, low land: green, high land: light gray/white
                    let r, g, b;
                    if (height < -15) {
                        // Deep sand - light gray (#cccccc)
                        r = 0.81; g = 0.80; b = 0.60; // #cfdf98ff
                    }else if (height < -5) {
                        // Deep sand - light gray (#cccccc)
                        r = 0.81; g = 0.87; b = 0.60; // #cfdf98ff
                    }else if (height < 0) {
                        // Deep sand - light gray (#cccccc)
                        r = 0.71; g = 0.69; b = 0.51; // #cccccc
                    }else if (height < 8) {
                        // Deep sand - light gray (#cccccc)
                        r = 0.8; g = 0.8; b = 0.7; // #cccccc
                    } else if (height < 15) {
                        // Deep sand - tan brown (#8c7a52)
                        r = 0.55; g = 0.48; b = 0.32; // #8c7a52
                    } else if (height < 22) {
                        // Deep water - beige (#dfdcb9ff)
                        r = 0.8; g = 0.8; b = 0.7; // #b6b181ff
                    } else if (height < 25.5) {
                        // Shallow water - pale green (#d4dfadff)
                        r = 0.8; g = 0.8; b = 0.7; // #d4dfadff
                    } else if (height < 31.2) {
                        // Shoreline - greenish blue (#00804d)
                        r = 0.0; g = 0.5; b = 0.3; // #00804d
                    } else if (height < 42.0) {
                        // Low land - green (#339933)
                        r = 0.2; g = 0.6; b = 0.2; // #339933
                    } else if (height < 47.0) {
                        // Mid land - gray brown (#807575ff)
                        r = 0.8; g = 0.8; b = 0.7; // #807575ff
                    } else if (height < 50.0) {
                        // High land (peaks) - off white (#575050ff)
                        r = 1.0; g = 1.0; b = 0.9; // #575050ff
                    } else {
                        // High land (peaks) - light gray (#6d6161ff)
                        r = 1.0; g = 1.0; b = 0.9; // #6d6161ff
                    }
                    colors.push(r, g, b);
            }
        }
        
        // Generate indices
        for (let z = 0; z < this.chunkResolution; z++) {
            for (let x = 0; x < this.chunkResolution; x++) {
                const i0 = z * (this.chunkResolution + 1) + x;
                const i1 = z * (this.chunkResolution + 1) + (x + 1);
                const i2 = (z + 1) * (this.chunkResolution + 1) + x;
                const i3 = (z + 1) * (this.chunkResolution + 1) + (x + 1);
                
                indices.push(i0, i1, i2);
                indices.push(i1, i3, i2);
            }
        }
        
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        
        const material = new THREE.MeshLambertMaterial({
            vertexColors: true,
            transparent: false,
            opacity: 1.0, // Fully opaque
            side: THREE.BackSide,
            wireframe: false,
            // Enhanced cartoon underwater terrain with sparkles
            emissive: 0x001144, // Magical underwater glow
            emissiveIntensity: 0.12 // Sparkly underwater effect
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = -2.5;
        this.scene.add(mesh);
        
        return {
            mesh: mesh,
            chunkX: chunkX,
            chunkZ: chunkZ,
            originalHeights: vertices.filter((_, index) => index % 3 === 1)
        };
    }
    
    generateTerrainHeight(x, z) {
        // --- Deterministic very large land mass ---
        // Place on a coarse grid, rare spawn, deterministic
        const landMassInterval = 8000;
        const landMassSize = 5000;
        const landGridX = Math.round(x / landMassInterval);
        const landGridZ = Math.round(z / landMassInterval);
        const landCenterX = landGridX * landMassInterval;
        const landCenterZ = landGridZ * landMassInterval;
        const distToLand = Math.sqrt((x - landCenterX) ** 2 + (z - landCenterZ) ** 2);
        let hasLandMass = false;
        let landMassBlend = 0;
        let landMassHeight = 0;
        // Deterministic spawn: rare, seed-based
        const landCellSeed = hash2D(this.terrainSeed ^ 0x1A2B3C4D, landGridX, landGridZ);
        const landCellRand = seededRandom(landCellSeed);
        if (landCellRand() < 0.08) { // 8% chance per grid cell
            if (distToLand < landMassSize) {
                hasLandMass = true;
                landMassBlend = Math.pow(1 - (distToLand / landMassSize), 2.2);
                // Large, rolling hills and plateaus
                const landSeed = hash2D(this.terrainSeed ^ 0x5EEDBEEF, landGridX, landGridZ);
                const landRand = seededRandom(landSeed);
                const hill1 = Math.sin((x - landCenterX) * 0.0007 + landRand() * 10) * 60;
                const hill2 = Math.cos((z - landCenterZ) * 0.0009 + landRand() * 20) * 40;
                const plateau = Math.max(0, 1 - (distToLand / (landMassSize * 0.7))) * 120;
                const rough = Math.sin((x - landCenterX) * 0.005 + (z - landCenterZ) * 0.005 + landRand() * 12) * 8;
                landMassHeight = 80 + hill1 + hill2 + plateau + rough;
            }
        }
        // If no seed, return 0 height (flat ocean)
        if (!this.terrainSeed) return 0;

        // Smootherstep helper for smooth blending
        function smootherstep(edge0, edge1, x) {
            x = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
            return x * x * x * (x * (x * 6 - 15) + 10);
        }

        // --- Normal terrain, islands, deep spots ---
        // Multi-scale noise for realistic terrain, seeded
        let height = 0;
        const seed = this.terrainSeed + Math.floor(x * 1000 + z * 1000);
        const rand = seededRandom(seed);
        // --- Mountainous ocean floor regions ---
        // Deterministic, seed-based placement of mountain regions
        const mountainSeed = this.terrainSeed ^ 0xA7A7A7A7;
        // Use a low-frequency noise to modulate mountain presence
        const mountainPhase = (x * 0.00018 + z * 0.00021) + mountainSeed * 0.000001;
        const mountainNoise = Math.sin(x * 0.00013 + mountainSeed * 0.0001) * Math.cos(z * 0.00019 + mountainSeed * 0.0002);
        // Map noise to [0, 1]
        const mountainFactor = Math.max(0, mountainNoise * 0.5 + 0.5);
        // Only apply mountains if factor is high enough
        let mountainBlend = 0;
        if (mountainFactor > 0.7) {
            // Mountain region: add large amplitude, multi-frequency ridges
            const ridge1 = Math.sin(x * 0.008 + z * 0.011 + mountainSeed * 0.1) * 7.5;
            const ridge2 = Math.cos(x * 0.014 + z * 0.017 + mountainSeed * 0.2) * 5.2;
            const ridge3 = Math.sin(x * 0.021 + z * 0.019 + mountainSeed * 0.3) * 3.1;
            // Extra roughness
            const rough = Math.sin(x * 0.09 + z * 0.07 + mountainSeed * 0.4) * 1.2;
            // Blend strength based on mountainFactor
            mountainBlend = Math.pow((mountainFactor - 0.7) / 0.3, 1.5);
            height += (ridge1 + ridge2 + ridge3 + rough) * mountainBlend;
        }
        // Island/deep spot grid
        const islandInterval = 1000;
        const islandSize = 600;
        const gridX = Math.round(x / islandInterval);
        const gridZ = Math.round(z / islandInterval);
        const nearestX = gridX * islandInterval;
        const nearestZ = gridZ * islandInterval;
        const isOrigin = (gridX === 0 && gridZ === 0);
        const distToFeature = Math.sqrt((x - nearestX) ** 2 + (z - nearestZ) ** 2);
        let featureBlend = 0;
        let featureType = null;
        let hasIsland = false;
        let hasDeep = false;
        let islandType = 0;
        let islandHeightParams = {};
        let featureRand = null;
        if (!isOrigin) {
            const cellSeed = hash2D(this.terrainSeed, gridX, gridZ);
            const cellRand = seededRandom(cellSeed);
            const featureRoll = cellRand();
            // --- Deterministic density modulation ---
            // Use a low-frequency, seed-based noise to modulate island density
            const densitySeed = this.terrainSeed ^ 0xD3A5171;
            const densityPhase = (gridX * 0.13 + gridZ * 0.17) + densitySeed * 0.000001;
            const densityNoise = Math.sin(gridX * 0.07 + densitySeed * 0.0001) * Math.cos(gridZ * 0.09 + densitySeed * 0.0002);
            // Map noise to [0.7, 1.3] for density factor
            const densityFactor = 1.0 + densityNoise * 0.3;
            // Base thresholds
            const deepThreshold = 0.20 * densityFactor;
            const islandThreshold = 0.86 * densityFactor;
            if (featureRoll < deepThreshold) {
                hasDeep = true;
                featureType = 'deep';
            } else if (featureRoll < islandThreshold) {
                hasIsland = true;
                featureType = 'island';
                // Remove spire and pillar types
                const typeRand = cellRand();
                if (typeRand < 0.18) islandType = 1; // jagged
                else if (typeRand < 0.36) islandType = 2; // tall
                else if (typeRand < 0.60) islandType = 4; // wide
                else if (typeRand < 0.72) islandType = 5; // arch
                else if (typeRand < 0.86) islandType = 7; // rocky outcrop
                else if (typeRand < 0.93) islandType = 9; // curvy wide island
                else islandType = 8; // cliff/overhang
                islandHeightParams = {
                    base: 10 + cellRand() * 20,
                    jagged: cellRand() * 10 + 5,
                    tall: 20 + cellRand() * 30,
                    wide: 1.2 + cellRand() * 1.5,
                    arch: 10 + cellRand() * 10,
                    rocky: 8 + cellRand() * 12,
                    cliff: 18 + cellRand() * 22,
                    noise: cellRand() * 2.5 + 0.5
                };
                featureRand = cellRand;
            }
        }
        // Main deep spot at 0,0 for spawn
        const mainDeepSpotRadius = 300;
        const mainDeepDensitySeed = this.terrainSeed ^ 0xDEEFACE;
        const mainDeepDensityNoise = Math.sin(0 * 0.07 + mainDeepDensitySeed * 0.0001) * Math.cos(0 * 0.09 + mainDeepDensitySeed * 0.0002);
        const mainDeepDensityFactor = 1.0 + mainDeepDensityNoise * 0.3;
        const distToMainDeep = Math.sqrt(x * x + z * z);
        let mainDeepBlend = 0;
        if (distToMainDeep < mainDeepSpotRadius * mainDeepDensityFactor) {
            mainDeepBlend = 1 - (distToMainDeep / (mainDeepSpotRadius * mainDeepDensityFactor));
        }
        // Deep spot height
        let deepHeight = -10.0 + Math.sin(x * 0.002) * Math.cos(z * 0.002) * 0.5 + (rand() - 0.5) * 0.1;
        // Deep spot blending
        let deepBlend = 0;
        if (hasDeep && distToFeature < islandSize) {
            featureBlend = 1 - (distToFeature / islandSize);
            deepBlend = smootherstep(0, 1, featureBlend);
        }
        // Island heights
        let islandBlend = 0;
        let islandHeight = 0;
        if (hasIsland && distToFeature < islandSize) {
            featureBlend = 1 - (distToFeature / islandSize);
            islandBlend = smootherstep(0, 1, featureBlend);
            // Use a unique, deterministic PRNG for each island
            const islandSeed = hash2D(this.terrainSeed ^ 0xA1A1A1, gridX, gridZ);
            const localRand = seededRandom(islandSeed);
            // --- Deterministic island shape filter to break symmetry ---
            // Generate deterministic shape parameters
            const shapeSkewAngle = localRand() * Math.PI * 2; // 0 - 2PI
            const shapeSkewStrength = 0.18 + localRand() * 0.32; // 0.18 - 0.5
            const shapeWarpFreq = 0.001 + localRand() * 0.003; // 0.001 - 0.004
            const shapeWarpAmp = 30 + localRand() * 60; // 30 - 90
            const shapeNoiseFreq = 0.012 + localRand() * 0.018; // 0.012 - 0.03
            const shapeNoiseAmp = 8 + localRand() * 18; // 8 - 26
            // Skew and warp the (x, z) coordinates deterministically for this island
            let dx = x - nearestX;
            let dz = z - nearestZ;
            // Skew: rotate and stretch
            const skewedX = dx + Math.sin(shapeSkewAngle) * dz * shapeSkewStrength;
            const skewedZ = dz + Math.cos(shapeSkewAngle) * dx * shapeSkewStrength;
            // Warp: add a wavy offset
            const warpedX = skewedX + Math.sin(skewedZ * shapeWarpFreq) * shapeWarpAmp;
            const warpedZ = skewedZ + Math.cos(skewedX * shapeWarpFreq) * shapeWarpAmp;
            // Extra noise: add deterministic noise to the height
            const shapeNoise = Math.sin(skewedX * shapeNoiseFreq + localRand() * 10) * Math.cos(skewedZ * shapeNoiseFreq + localRand() * 10) * shapeNoiseAmp;

            // --- Deterministic fractal noise for natural surface detail ---
            function deterministicFractalNoise(x, z, octaves, baseFreq, baseAmp, randGen) {
                let total = 0;
                let freq = baseFreq;
                let amp = baseAmp;
                let phaseX = randGen() * 1000;
                let phaseZ = randGen() * 1000;
                for (let i = 0; i < octaves; ++i) {
                    // Each octave uses a different random phase and frequency
                    total += Math.sin((x + phaseX) * freq + randGen() * 10) * Math.cos((z + phaseZ) * freq + randGen() * 10) * amp;
                    freq *= 2.1 + randGen() * 0.3; // Slightly randomize frequency step
                    amp *= 0.45 + randGen() * 0.15; // Slightly randomize amplitude falloff
                    phaseX += randGen() * 1000;
                    phaseZ += randGen() * 1000;
                }
                return total;
            }
            // Use a copy of localRand for noise so it doesn't affect island shape
            function makeRandCopy(rand) {
                let state = [];
                for (let i = 0; i < 4; ++i) state.push(rand());
                let idx = 0;
                return function() { idx = (idx + 1) % 4; return state[idx]; };
            }
            const noiseRand = seededRandom(islandSeed ^ 0xBADA55);
            const fractalNoise = deterministicFractalNoise(warpedX, warpedZ, 4, 0.012 + noiseRand() * 0.01, 7 + noiseRand() * 5, noiseRand);
            // Randomize parameters for each island
            const freq1 = 0.008 + localRand() * 0.012; // 0.008 - 0.02
            const freq2 = 0.05 + localRand() * 0.09;   // 0.05 - 0.14
            const freq3 = 0.1 + localRand() * 0.12;    // 0.1 - 0.22
            const amp1 = 8 + localRand() * 16;         // 8 - 24
            const amp2 = 10 + localRand() * 18;        // 10 - 28
            const amp3 = 12 + localRand() * 20;        // 12 - 32
            const noiseAmp = 2 + localRand() * 6;      // 2 - 8
            const blendCurve = 0.5 + localRand() * 1.2; // 0.5 - 1.7
            if (islandType === 1) {
                islandHeight = islandHeightParams.base + islandHeightParams.jagged
                    + Math.sin(warpedX * freq1) * Math.cos(warpedZ * freq1) * (amp1 * 0.35)
                    + Math.sin(warpedX * freq2 + warpedZ * freq3) * (amp2 * 0.25)
                    + Math.abs(Math.sin(warpedX * freq3) * Math.cos(warpedZ * freq3)) * (amp3 * 0.18)
                    + (localRand() - 0.5) * (noiseAmp * 0.5)
                    + shapeNoise * 0.7
                    + fractalNoise;
            } else if (islandType === 2) {
                islandHeight = islandHeightParams.tall
                    + Math.sin(warpedX * (freq1 * 0.5)) * Math.cos(warpedZ * (freq1 * 0.5)) * (amp1 * 0.28)
                    + Math.abs(Math.sin(warpedX * (freq2 * 0.4)) * Math.cos(warpedZ * (freq2 * 0.4))) * (amp2 * 0.22)
                    + (localRand() - 0.5) * (noiseAmp * 0.3)
                    + shapeNoise * 0.7
                    + fractalNoise;
            } else if (islandType === 3) {
                // Simple small island: low, round, with some noise
                const smallRadius = 90 + localRand() * 30;
                const dist = Math.sqrt(dx * dx + dz * dz);
                let base = islandHeightParams.base * 0.5 + 4;
                let mask = Math.max(0, 1 - (dist / smallRadius));
                let noise = Math.sin(dx * 0.07 + localRand() * 10) * Math.cos(dz * 0.07 + localRand() * 10) * 2;
                noise += (localRand() - 0.5) * 1.2;
                islandHeight = base * mask + noise * mask + shapeNoise * 0.3 + fractalNoise * 0.5;
                islandBlend = Math.pow(islandBlend, blendCurve * 0.8);
            } else if (islandType === 4) {
                islandHeight = islandHeightParams.base
                    + Math.sin(warpedX * (freq1 * 0.2)) * Math.cos(warpedZ * (freq1 * 0.2)) * (amp1 * 0.08)
                    + Math.sin(warpedX * (freq2 * 0.5)) * Math.cos(warpedZ * (freq2 * 0.5)) * (amp2 * 0.04)
                    + (localRand() - 0.5) * (noiseAmp * 0.08)
                    + shapeNoise * 0.7
                    + fractalNoise;
                islandBlend = Math.pow(islandBlend, blendCurve);
            } else if (islandType === 9) {
                // Curvy wide island: copy of wide, but with curvy, organic noise
                let base = islandHeightParams.base;
                let wide = islandHeightParams.wide;
                // Use sin/cos with phase shifts and nonlinear combinations for curvy shapes
                let curveNoise = Math.sin(warpedX * freq1 * 0.22 + Math.cos(warpedZ * freq1 * 0.18)) * (amp1 * 0.09);
                curveNoise += Math.cos(warpedZ * freq2 * 0.51 + Math.sin(warpedX * freq2 * 0.47)) * (amp2 * 0.05);
                curveNoise += Math.sin((warpedX + warpedZ) * freq3 * 0.33 + Math.cos(warpedX * freq3 * 0.29)) * (amp3 * 0.04);
                // Add some nonlinear blending for extra curves
                curveNoise += Math.sin(warpedX * 0.021 + warpedZ * 0.017) * Math.cos(warpedZ * 0.019 + warpedX * 0.013) * 2.2;
                curveNoise += Math.sin(warpedX * 0.09 + warpedZ * 0.11) * Math.sin(warpedZ * 0.07 + warpedX * 0.05) * 1.1;
                // Add deterministic noise
                curveNoise += (localRand() - 0.5) * (noiseAmp * 0.09);
                islandHeight = base
                    + wide * 0.9
                    + curveNoise
                    + shapeNoise * 0.7
                    + fractalNoise;
                islandBlend = Math.pow(islandBlend, blendCurve * 0.95);
            } else if (islandType === 5) {
                const archOffset = 100 + localRand() * 60;
                const archSpread = 60 + localRand() * 40;
                const arch1 = Math.exp(-((warpedX - archOffset) ** 2 + warpedZ ** 2) / (2 * archSpread ** 2)) * islandHeightParams.arch;
                const arch2 = Math.exp(-((warpedX + archOffset) ** 2 + warpedZ ** 2) / (2 * archSpread ** 2)) * islandHeightParams.arch;
                islandHeight = arch1 + arch2
                    + Math.sin(warpedX * freq1) * Math.cos(warpedZ * freq1) * (amp1 * 0.08)
                    + (localRand() - 0.5) * (noiseAmp * 0.2)
                    + shapeNoise * 0.7
                    + fractalNoise;
            } else if (islandType === 6) {
                // Removed spire type
            } else if (islandType === 7) {
                // Rocky outcrop: high-frequency, moderate amplitude, localized
                const outcropFreq = 0.09 + localRand() * 0.07;
                const outcropAmp = islandHeightParams.rocky;
                const outcropMask = Math.exp(-((warpedX) ** 2 + (warpedZ) ** 2) / (2 * 120 ** 2));
                let rocky = Math.sin(warpedX * outcropFreq + localRand() * 10) * Math.cos(warpedZ * outcropFreq + localRand() * 10) * outcropAmp;
                rocky += Math.sin(warpedX * outcropFreq * 1.7 + warpedZ * outcropFreq * 1.3 + localRand() * 10) * outcropAmp * 0.5;
                rocky += (localRand() - 0.5) * outcropAmp * 0.2;
                // Add some vertical spikes
                rocky += Math.abs(Math.sin(warpedX * 0.23 + warpedZ * 0.19)) * outcropAmp * 0.7;
                islandHeight = islandHeightParams.base
                    + rocky * outcropMask
                    + shapeNoise * 3.5
                    + fractalNoise * 3.7;
            } else if (islandType === 8) {
                // Cliff/overhang: SDF-based vertical wall, with gentler overhang
                
            }
        }
        // Normal terrain height
        let normalHeight = 0;
        normalHeight += Math.sin(x * 0.01) * Math.cos(z * 0.01) * 3.0;
        normalHeight += Math.sin(x * 0.015 + z * 0.01) * 2.0;
        normalHeight += Math.sin(x * 0.03) * Math.cos(z * 0.025) * 1.5;
        normalHeight += Math.cos(x * 0.025 + z * 0.035) * 1.2;
        normalHeight += Math.sin(x * 0.08) * Math.cos(z * 0.06) * 0.6;
        normalHeight += Math.sin(x * 0.05 + z * 0.07) * 0.8;
        normalHeight += (rand() - 0.5) * 0.5;

        // --- Blend all features except trenches ---
        if (hasLandMass && landMassBlend > 0) {
            height = landMassHeight * landMassBlend + normalHeight * (1 - landMassBlend);
        } else if (mainDeepBlend > 0) {
            height = deepHeight * mainDeepBlend + normalHeight * (1 - mainDeepBlend);
        } else if (deepBlend > 0) {
            height = deepHeight * deepBlend + normalHeight * (1 - deepBlend);
        } else if (islandBlend > 0) {
            height = islandHeight * islandBlend + normalHeight * (1 - islandBlend);
        } else {
            height = normalHeight;
        }

        // --- Apply trenches LAST, with random (deterministic) size/spacing/placement ---
        // Trench centers are placed on a coarse grid, but their parameters (size, angle, etc) are fully random and deterministic
        // For each (x,z), check all nearby trench centers and blend the deepest result
        // Prevent trenches from cutting through land mass
        let trenchFinalBlend = 0;
        let trenchFinalDepth = height;
        if (hasLandMass && landMassBlend > 0.5) {
            // If inside land mass, skip trench logic
            return height;
        }
        const trenchGrid = 1200; // Trench centers every 1200 units (not aligned to islands)
        const trenchSearchRadius = 2; // Check +/-2 grid cells for influence
        // First, apply trenches
        for (let tx = -trenchSearchRadius; tx <= trenchSearchRadius; ++tx) {
            for (let tz = -trenchSearchRadius; tz <= trenchSearchRadius; ++tz) {
                // Trench center position
                const trenchCenterX = Math.floor((x + tx * trenchGrid) / trenchGrid) * trenchGrid;
                const trenchCenterZ = Math.floor((z + tz * trenchGrid) / trenchGrid) * trenchGrid;
                // Deterministic PRNG for this trench center
                const trenchSeed = hash2D(this.terrainSeed ^ 0xBEEFCAFE, trenchCenterX, trenchCenterZ);
                const trenchRand = seededRandom(trenchSeed);
                // Deterministic density modulation for trenches
                const trenchDensitySeed = this.terrainSeed ^ 0x7A7A7A7;
                const trenchDensityNoise = Math.sin(trenchCenterX * 0.00013 + trenchDensitySeed * 0.0001) * Math.cos(trenchCenterZ * 0.00019 + trenchDensitySeed * 0.0002);
                const trenchDensityFactor = 1.0 + trenchDensityNoise * 0.3;
                // Only spawn a trench if random threshold is met, modulated by density
                if (trenchRand() < 0.33 * trenchDensityFactor) {
                    // Trench parameters: angle, length, width, depth, all deterministic
                    const angle = trenchRand() * Math.PI * 2;
                    const length = 1200 + trenchRand() * 4000; // 1200-5200 units
                    const width = 80 + trenchRand() * 320; // 80-400 units
                    // Up to 10x deeper trenches, variable and natural
                    const baseDepth = -18 - trenchRand() * 32;
                    // Deterministic noise factor for trench depth (0.5 to 1.5)
                    const depthNoise = 0.5 + Math.abs(Math.sin(trenchCenterX * 0.00021 + trenchCenterZ * 0.00017 + trenchSeed * 0.00001)) * 1.0;
                    const depth = baseDepth * (8 + depthNoise * 2); // 8x to 10x deeper, variable
                    // Project (x,z) onto trench axis
                    const dx = x - trenchCenterX;
                    const dz = z - trenchCenterZ;
                    let along = dx * Math.cos(angle) + dz * Math.sin(angle);
                    let across = -dx * Math.sin(angle) + dz * Math.cos(angle);
                    // --- Enhanced natural path: More curves, mountain-like roughness, and rare forking ---
                    // Add extra layers of curves for more organic shape
                    const curveAmp1 = 80 + trenchRand() * 100;
                    const curveFreq1 = 0.00035 + trenchRand() * 0.0007;
                    const curveAmp2 = 20 + trenchRand() * 40;
                    const curveFreq2 = 0.0007 + trenchRand() * 0.0015;
                    const curveAmp3 = 8 + trenchRand() * 16;
                    const curveFreq3 = 0.001 + trenchRand() * 0.002;
                    // Extra curves for more bending
                    const curveAmp4 = 40 + trenchRand() * 60;
                    const curveFreq4 = 0.0015 + trenchRand() * 0.0025;
                    const curveAmp5 = 16 + trenchRand() * 24;
                    const curveFreq5 = 0.0025 + trenchRand() * 0.0035;
                    // Local noise for extra wiggle
                    const localNoiseSeed = hash2D(this.terrainSeed ^ 0xF00DF00D, Math.floor(x), Math.floor(z));
                    const localNoiseRand = seededRandom(localNoiseSeed);
                    const localWiggle = (localNoiseRand() - 0.5) * 6;
                    // Path offset: more curves and bends
                    const curveOffset =
                        Math.sin(along * curveFreq1 + trenchRand() * 10) * curveAmp1 +
                        Math.cos(along * curveFreq2 + trenchRand() * 20) * curveAmp2 +
                        Math.sin(along * curveFreq3 + trenchRand() * 30) * curveAmp3 +
                        Math.sin(along * curveFreq4 + trenchRand() * 40) * curveAmp4 +
                        Math.cos(along * curveFreq5 + trenchRand() * 50) * curveAmp5 +
                        Math.sin((along + across) * 0.001 + trenchRand() * 5) * 22 +
                        Math.cos((along - across) * 0.0012 + trenchRand() * 7) * 16 +
                        localWiggle;
                    // Rare forking: sometimes a trench splits into two
                    let forkOffset = 0;
                    if (trenchRand() < 0.08) {
                        // Fork angle and offset
                        const forkAngle = angle + (trenchRand() < 0.5 ? Math.PI / 4 : -Math.PI / 4);
                        const forkAlong = dx * Math.cos(forkAngle) + dz * Math.sin(forkAngle);
                        const forkCurve = Math.sin(forkAlong * 0.001 + trenchRand() * 5) * 30;
                        if (Math.abs(forkAlong) < length * 0.4) {
                            forkOffset = forkCurve;
                        }
                    }
                    across = across - curveOffset + forkOffset;
                    // Add mountain-like roughness to trench floor
                    const trenchMountainSeed = trenchSeed ^ 0xA7A7A7A7;
                    const trenchMountainPhase = (x * 0.00018 + z * 0.00021) + trenchMountainSeed * 0.000001;
                    const trenchMountainNoise = Math.sin(x * 0.00013 + trenchMountainSeed * 0.0001) * Math.cos(z * 0.00019 + trenchMountainSeed * 0.0002);
                    const trenchMountainFactor = Math.max(0, trenchMountainNoise * 0.5 + 0.5);
                    let trenchMountainBlend = 0;
                    if (trenchMountainFactor > 0.6) {
                        const ridge1 = Math.sin(x * 0.008 + z * 0.011 + trenchMountainSeed * 0.1) * 5.5;
                        const ridge2 = Math.cos(x * 0.014 + z * 0.017 + trenchMountainSeed * 0.2) * 3.2;
                        const ridge3 = Math.sin(x * 0.021 + z * 0.019 + trenchMountainSeed * 0.3) * 2.1;
                        const rough = Math.sin(x * 0.09 + z * 0.07 + trenchMountainSeed * 0.4) * 0.8;
                        trenchMountainBlend = Math.pow((trenchMountainFactor - 0.6) / 0.4, 1.3);
                        // Add to trench depth (not height)
                        trenchFinalDepth -= (ridge1 + ridge2 + ridge3 + rough) * trenchMountainBlend;
                    }
                    // Trench width and depth variation along path (less noise)
                    const trenchWidth = width
                        + Math.sin(along * 0.001 + trenchRand() * 5) * width * 0.12
                        + Math.cos(along * 0.0012 + trenchRand() * 7) * width * 0.05
                        + (localNoiseRand() - 0.5) * 4;
                    const trenchLength = length * (0.98 + (localNoiseRand() - 0.5) * 0.03);
                    // Blend: strong in center, fades at edges (even softer, more natural)
                    if (Math.abs(along) < trenchLength / 2 && Math.abs(across) < trenchWidth) {
                        const core = 1 - Math.abs(across) / trenchWidth;
                        // Soft falloff for trench ends using smootherstep
                        const endBlend = smootherstep(0, 1, 1 - Math.abs(along) / (trenchLength / 2));
                        // Combine core and end blend for final blend strength
                        const blend = Math.pow(smootherstep(0, 1, core), 0.18) * endBlend;
                        // Rocky outcrops, but even less spiky
                        const rockAmp = 2 + trenchRand() * 3;
                        let rock = 0;
                        rock += Math.sin(x * 0.011 + trenchRand() * 10) * Math.cos(z * 0.013 + trenchRand() * 8) * rockAmp * 0.18;
                        rock += Math.sin(x * 0.003 + z * 0.005 + trenchRand() * 20) * (rockAmp * 0.08);
                        rock += (trenchRand() - 0.5) * rockAmp * 0.02;
                        // Depth variation along trench (slightly reduced)
                        const alongNorm = (along + trenchLength / 2) / trenchLength;
                        const depthVar = Math.sin(alongNorm * Math.PI * 2 + trenchRand() * 6.28) * 2.5
                            + Math.cos(alongNorm * Math.PI * 4 + trenchRand() * 12.56) * 1.1;
                        // Final trench depth
                        const trenchDepth = depth + rock * blend + depthVar;
                        const blended = trenchDepth * blend + trenchFinalDepth * (1 - blend);
                        // If this trench is deeper at this point, use it
                        if (blend > trenchFinalBlend || blended < trenchFinalDepth) {
                            trenchFinalBlend = blend;
                            trenchFinalDepth = blended;
                        }
                    }
                // --- Second trench type: smaller, skinnier, snaking ---
                const snakeTrenchSeed = hash2D(this.terrainSeed ^ 0xDEADBEEF, trenchCenterX, trenchCenterZ);
                const snakeTrenchRand = seededRandom(snakeTrenchSeed);
                // Lower density for snaking trenches
                if (snakeTrenchRand() < 0.18 * trenchDensityFactor) {
                    // Smaller, skinnier, super unique snaking trench parameters
                    const angle = snakeTrenchRand() * Math.PI * 2;
                    const length = 600 + snakeTrenchRand() * 1200; // 600-1800 units
                    const width = 30 + snakeTrenchRand() * 60; // 30-90 units
                    const baseDepth = -10 - snakeTrenchRand() * 18;
                    // Deterministic noise factor for trench depth (0.5 to 1.2)
                    const depthNoise = 0.5 + Math.abs(Math.sin(trenchCenterX * 0.00031 + trenchCenterZ * 0.00027 + snakeTrenchSeed * 0.00003)) * 0.7;
                    const depth = baseDepth * (4 + depthNoise * 1.2); // 4x to 5.2x deeper, variable
                    // Project (x,z) onto trench axis
                    const dx = x - trenchCenterX;
                    const dz = z - trenchCenterZ;
                    let along = dx * Math.cos(angle) + dz * Math.sin(angle);
                    let across = -dx * Math.sin(angle) + dz * Math.cos(angle);
                    // --- Super unique snaking path: multiple curves, twists, bends, and local changes ---
                    // Add more layers of curves and twists for uniqueness
                    const curveAmp1 = 60 + snakeTrenchRand() * 60;
                    const curveFreq1 = 0.0007 + snakeTrenchRand() * 0.0012;
                    const curveAmp2 = 18 + snakeTrenchRand() * 22;
                    const curveFreq2 = 0.0012 + snakeTrenchRand() * 0.0021;
                    const curveAmp3 = 7 + snakeTrenchRand() * 9;
                    const curveFreq3 = 0.002 + snakeTrenchRand() * 0.003;
                    // Extra unique curves
                    const curveAmp4 = 30 + snakeTrenchRand() * 40;
                    const curveFreq4 = 0.003 + snakeTrenchRand() * 0.004;
                    const curveAmp5 = 12 + snakeTrenchRand() * 18;
                    const curveFreq5 = 0.004 + snakeTrenchRand() * 0.005;
                    // Local noise for extra wiggle
                    const localNoiseSeed = hash2D(this.terrainSeed ^ 0xF00DF00D, Math.floor(x), Math.floor(z));
                    const localNoiseRand = seededRandom(localNoiseSeed);
                    const localWiggle = (localNoiseRand() - 0.5) * 3;
                    // Path offset: super snaking and unique
                    const curveOffset =
                        Math.sin(along * curveFreq1 + snakeTrenchRand() * 10) * curveAmp1 +
                        Math.cos(along * curveFreq2 + snakeTrenchRand() * 20) * curveAmp2 +
                        Math.sin(along * curveFreq3 + snakeTrenchRand() * 30) * curveAmp3 +
                        Math.sin(along * curveFreq4 + snakeTrenchRand() * 40) * curveAmp4 +
                        Math.cos(along * curveFreq5 + snakeTrenchRand() * 50) * curveAmp5 +
                        Math.sin((along + across) * 0.001 + snakeTrenchRand() * 5) * 18 +
                        Math.cos((along - across) * 0.0012 + snakeTrenchRand() * 7) * 12 +
                        localWiggle;
                    // Add local twists and bends
                    const twist = Math.sin(along * 0.002 + snakeTrenchRand() * 8) * 22;
                    const bend = Math.cos(across * 0.002 + snakeTrenchRand() * 6) * 14;
                    across = across - curveOffset + twist + bend;
                    // Trench width and depth variation along path
                    const trenchWidth = width
                        + Math.sin(along * 0.001 + snakeTrenchRand() * 5) * width * 0.09
                        + Math.cos(along * 0.0012 + snakeTrenchRand() * 7) * width * 0.04
                        + (localNoiseRand() - 0.5) * 2;
                    const trenchLength = length * (0.98 + (localNoiseRand() - 0.5) * 0.03);
                    // Blend: strong in center, fades at edges
                    if (Math.abs(along) < trenchLength / 2 && Math.abs(across) < trenchWidth) {
                        const core = 1 - Math.abs(across) / trenchWidth;
                        const endBlend = smootherstep(0, 1, 1 - Math.abs(along) / (trenchLength / 2));
                        const blend = Math.pow(smootherstep(0, 1, core), 0.22) * endBlend;
                        // Rocky outcrops, but less pronounced
                        const rockAmp = 1.2 + snakeTrenchRand() * 1.8;
                        let rock = 0;
                        rock += Math.sin(x * 0.011 + snakeTrenchRand() * 10) * Math.cos(z * 0.013 + snakeTrenchRand() * 8) * rockAmp * 0.12;
                        rock += Math.sin(x * 0.003 + z * 0.005 + snakeTrenchRand() * 20) * (rockAmp * 0.05);
                        rock += (snakeTrenchRand() - 0.5) * rockAmp * 0.01;
                        // Depth variation along trench
                        const alongNorm = (along + trenchLength / 2) / trenchLength;
                        const depthVar = Math.sin(alongNorm * Math.PI * 2 + snakeTrenchRand() * 6.28) * 1.2
                            + Math.cos(alongNorm * Math.PI * 4 + snakeTrenchRand() * 12.56) * 0.6;
                        // Final trench depth
                        const trenchDepth = depth + rock * blend + depthVar;
                        const blended = trenchDepth * blend + trenchFinalDepth * (1 - blend);
                        // If this trench is deeper at this point, use it
                        if (blend > trenchFinalBlend || blended < trenchFinalDepth) {
                            trenchFinalBlend = blend;
                            trenchFinalDepth = blended;
                        }
                    }
                }
                }
            }
        }
        // Now, apply massive deep ocean pits and override trench depth if pit is deeper
        // Deep pits logic commented out
        // let pitFinalBlend = 0;
        // let pitFinalDepth = trenchFinalDepth;
        // for (let tx = -trenchSearchRadius; tx <= trenchSearchRadius; ++tx) {
        //     for (let tz = -trenchSearchRadius; tz <= trenchSearchRadius; ++tz) {
        //         const trenchCenterX = Math.floor((x + tx * trenchGrid) / trenchGrid) * trenchGrid;
        //         const trenchCenterZ = Math.floor((z + tz * trenchGrid) / trenchGrid) * trenchGrid;
        //         const digSeed = hash2D(this.terrainSeed ^ 0xD1661A9, trenchCenterX, trenchCenterZ);
        //         const digRand = seededRandom(digSeed);
        //         if (digRand() < 0.04) { // 4% chance per grid cell
        //             const digRadius = 600 + digRand() * 1200; // 600-1800 units
        //             const digDepth = (-120 - digRand() * 380) * 5; // -600 to -2500
        //             const digCenterX = trenchCenterX + (digRand() - 0.5) * trenchGrid * 0.7;
        //             const digCenterZ = trenchCenterZ + (digRand() - 0.5) * trenchGrid * 0.7;
        //             // Spherical distance for pit
        //             const distToDig = Math.sqrt((x - digCenterX) ** 2 + (z - digCenterZ) ** 2);
        //             // Rim noise: modulate radius with low-freq noise
        //             const rimNoise = Math.sin((x - digCenterX) * 0.002 + digRand() * 8) * Math.cos((z - digCenterZ) * 0.002 + digRand() * 6) * 0.22
        //                 + Math.sin((x - digCenterX) * 0.005 + (z - digCenterZ) * 0.005 + digRand() * 12) * 0.09;
        //             const noisyRadius = digRadius * (1 + rimNoise);
        //             // SDF for sphere cutout
        //             const sphereMask = Math.max(0, 1 - (distToDig / noisyRadius));
        //             // Blend: strong in center, fades at rim, very soft
        //             let digBlend = 0;
        //             if (distToDig < noisyRadius * 0.9) {
        //                 // Core: gentle nonlinear blend
        //                 digBlend = Math.pow(smootherstep(0, 1, sphereMask), 0.8);
        //             } else if (distToDig < noisyRadius * 1.2) {
        //                 // Rim: very soft gradient
        //                 const rimMask = Math.max(0, 1 - ((distToDig - noisyRadius * 0.9) / (noisyRadius * 0.3)));
        //                 digBlend = Math.pow(smootherstep(0, 1, rimMask), 0.5) * 0.35;
        //             }
        //             // Blend pit depth with trench/terrain
        //             const digBlended = digDepth * digBlend + pitFinalDepth * (1 - digBlend);
        //             // If this pit is deeper, use it
        //             if (digBlend > pitFinalBlend || digBlended < pitFinalDepth) {
        //                 pitFinalBlend = digBlend;
        //                 pitFinalDepth = digBlended;
        //             }
        //         }
        //     }
        // }
        // If any pit applies, override/blend as last step
        return trenchFinalDepth;
    }
    
    storeOriginalHeights() {
        const positions = this.mesh.geometry.attributes.position.array;
        for (let i = 1; i < positions.length; i += 3) {
            this.originalHeights.push(positions[i]);
        }
    }
    
    update(deltaTime, playerPosition) {
        this.wavePhase += deltaTime * this.waveSpeed;
        // Generate terrain chunks around player
        this.updateTerrainChunks(playerPosition);
        // Animate all terrain chunks
        this.animateTerrainChunks();

        // If lerping terrain regeneration, update heights
        if (this._regenLerpActive) {
            this._regenLerpTime += deltaTime;
            let t = Math.min(1, this._regenLerpTime / this._regenLerpDuration);
            for (const [chunkKey, chunk] of this.terrainChunks) {
                const positions = chunk.mesh.geometry.attributes.position.array;
                for (let i = 0; i < chunk.originalHeights.length; i++) {
                    const oldH = this._regenOldHeights[chunkKey][i];
                    const newH = this._regenNewHeights[chunkKey][i];
                    positions[i * 3 + 1] = oldH + (newH - oldH) * t;
                }
                chunk.mesh.geometry.attributes.position.needsUpdate = true;
                chunk.mesh.geometry.computeVertexNormals();
            }
            if (t >= 1) {
                // Finish lerp
                this.terrainSeed = this._regenSeed;
                this.rand = seededRandom(this.terrainSeed);
                // Rebuild originalHeights for all chunks
                for (const [chunkKey, chunk] of this.terrainChunks) {
                    for (let i = 0; i < chunk.originalHeights.length; i++) {
                        chunk.originalHeights[i] = this._regenNewHeights[chunkKey][i];
                    }
                }
                this._regenLerpActive = false;
            }
        }
    }
    // Smoothly regenerate terrain to a new seed over duration (seconds)
    regenerateTerrain(newSeed, duration = 2.0) {
        // Store old heights for all chunks
        this._regenOldHeights = {};
        this._regenNewHeights = {};
        for (const [chunkKey, chunk] of this.terrainChunks) {
            this._regenOldHeights[chunkKey] = chunk.originalHeights.slice();
            // Compute new heights for this chunk with newSeed
            const newHeights = [];
            const positions = chunk.mesh.geometry.attributes.position.array;
            for (let i = 0; i < chunk.originalHeights.length; i++) {
                const x = positions[i * 3];
                const z = positions[i * 3 + 2];
                newHeights.push(this.generateTerrainHeightWithSeed(x, z, newSeed));
            }
            this._regenNewHeights[chunkKey] = newHeights;
        }
        this._regenSeed = newSeed;
        this._regenLerpTime = 0;
        this._regenLerpDuration = duration;
        this._regenLerpActive = true;
    }

    // Helper: generate terrain height at (x, z) for a given seed
    generateTerrainHeightWithSeed(x, z, seed) {
        // Copy of generateTerrainHeight, but uses provided seed
        let height = 0;
        const localSeed = seed + Math.floor(x * 1000 + z * 1000);
        const rand = seededRandom(localSeed);
        const islandInterval = 1000;
        const islandSize = 600; // Match main function
        const nearestX = Math.round(x / islandInterval) * islandInterval;
        const nearestZ = Math.round(z / islandInterval) * islandInterval;
        const isOrigin = (nearestX === 0 && nearestZ === 0);
        const distToIsland = Math.sqrt((x - nearestX) ** 2 + (z - nearestZ) ** 2);
        let islandBlend = 0;
        let islandType = 0;
        let islandRand = null;
        let hasIsland = false;
        let islandHeightParams = {};
        if (!isOrigin) {
            const gridX = Math.round(nearestX / islandInterval);
            const gridZ = Math.round(nearestZ / islandInterval);
            const presenceSeed = hash2D(seed ^ 0xA5A5A5A5, gridX, gridZ);
            const presenceRand = seededRandom(presenceSeed)();
            hasIsland = presenceRand > 0.33;
        }
        if (hasIsland && distToIsland < islandSize) {
            islandBlend = 1 - (distToIsland / islandSize);
            const gridX = Math.round(nearestX / islandInterval);
            const gridZ = Math.round(nearestZ / islandInterval);
            const islandSeed = hash2D(seed, gridX, gridZ);
            islandRand = seededRandom(islandSeed);
            const typeRand = islandRand();
            if (typeRand < 0.18) islandType = 0; // smooth
            else if (typeRand < 0.36) islandType = 1; // jagged
            else if (typeRand < 0.54) islandType = 2; // tall
            else if (typeRand < 0.7) islandType = 3; // pillar
            else if (typeRand < 0.82) islandType = 4; // wide
            else if (typeRand < 0.92) islandType = 5; // arch
            else islandType = 6; // spire

            islandHeightParams = {
                base: 10 + islandRand() * 20,
                jagged: islandRand() * 10 + 5,
                tall: 20 + islandRand() * 30,
                pillar: 30 + islandRand() * 40,
                wide: 1.2 + islandRand() * 1.5,
                arch: 10 + islandRand() * 10,
                spire: 40 + islandRand() * 30,
                noise: islandRand() * 2.5 + 0.5
            };
        }
        const deepSpotRadius = 300;
        const distToDeep = Math.sqrt(x * x + z * z);
        let deepBlend = 0;
        if (distToDeep < deepSpotRadius) {
            deepBlend = 1 - (distToDeep / deepSpotRadius);
        }
        const deepHeight = -10.0 + Math.sin(x * 0.002) * Math.cos(z * 0.002) * 0.5 + (rand() - 0.5) * 0.1;
        let islandHeight = 0;
        if (islandBlend > 0 && islandRand) {
            const gridX = Math.round(nearestX / islandInterval);
            const gridZ = Math.round(nearestZ / islandInterval);
            const localRand = seededRandom(hash2D(seed, gridX * 100000 + Math.floor(x), gridZ * 100000 + Math.floor(z)));
            if (islandType === 0) {
                islandHeight = islandHeightParams.base
                    + Math.sin(x * 0.002) * Math.cos(z * 0.002) * 4.0
                    + Math.sin(x * 0.01) * Math.cos(z * 0.01) * 2.0
                    + (localRand() - 0.5) * 1.0;
            } else if (islandType === 1) {
                islandHeight = islandHeightParams.base + islandHeightParams.jagged
                    + Math.sin(x * 0.01) * Math.cos(z * 0.01) * 10.0
                    + Math.sin(x * 0.07 + z * 0.13) * 12.0
                    + Math.abs(Math.sin(x * 0.1) * Math.cos(z * 0.1)) * 18.0
                    + (localRand() - 0.5) * 4.0;
            } else if (islandType === 2) {
                islandHeight = islandHeightParams.tall
                    + Math.sin(x * 0.005) * Math.cos(z * 0.005) * 8.0
                    + Math.abs(Math.sin(x * 0.02) * Math.cos(z * 0.02)) * 10.0
                    + (localRand() - 0.5) * 2.0;
            } else if (islandType === 3) {
                islandHeight = islandHeightParams.pillar
                    + Math.exp(-((x - nearestX) ** 2 + (z - nearestZ) ** 2) / (2 * 120 ** 2)) * 60
                    + Math.abs(Math.sin(x * 0.03) * Math.cos(z * 0.03)) * 8.0
                    + (localRand() - 0.5) * 2.0;
            } else if (islandType === 4) {
                islandHeight = islandHeightParams.base
                    + Math.sin(x * 0.002) * Math.cos(z * 0.002) * 2.0
                    + Math.sin(x * 0.01) * Math.cos(z * 0.01) * 1.0
                    + (localRand() - 0.5) * 0.5;
                islandBlend = Math.pow(islandBlend, 0.6);
            } else if (islandType === 5) {
                const archOffset = 120;
                const arch1 = Math.exp(-((x - nearestX - archOffset) ** 2 + (z - nearestZ) ** 2) / (2 * 80 ** 2)) * islandHeightParams.arch;
                const arch2 = Math.exp(-((x - nearestX + archOffset) ** 2 + (z - nearestZ) ** 2) / (2 * 80 ** 2)) * islandHeightParams.arch;
                islandHeight = arch1 + arch2 + Math.sin(x * 0.01) * Math.cos(z * 0.01) * 2.0 + (localRand() - 0.5) * 1.0;
            } else if (islandType === 6) {
                islandHeight = islandHeightParams.spire
                    + Math.exp(-((x - nearestX) ** 2 + (z - nearestZ) ** 2) / (2 * 60 ** 2)) * 100
                    + Math.abs(Math.sin(x * 0.07) * Math.cos(z * 0.07)) * 20.0
                    + (localRand() - 0.5) * 3.0;
            }
        }
        let normalHeight = 0;
        normalHeight += Math.sin(x * 0.01) * Math.cos(z * 0.01) * 3.0;
        normalHeight += Math.sin(x * 0.015 + z * 0.01) * 2.0;
        normalHeight += Math.sin(x * 0.03) * Math.cos(z * 0.025) * 1.5;
        normalHeight += Math.cos(x * 0.025 + z * 0.035) * 1.2;
        normalHeight += Math.sin(x * 0.08) * Math.cos(z * 0.06) * 0.6;
        normalHeight += Math.sin(x * 0.05 + z * 0.07) * 0.8;
        normalHeight += (rand() - 0.5) * 0.5;
        if (deepBlend > 0) {
            height = deepHeight * deepBlend + normalHeight * (1 - deepBlend);
        } else if (islandBlend > 0) {
            height = islandHeight * islandBlend + normalHeight * (1 - islandBlend);
        } else {
            height += Math.sin(x * 0.01) * Math.cos(z * 0.01) * 3.0;
            height += Math.sin(x * 0.015 + z * 0.01) * 2.0;
            height += Math.sin(x * 0.03) * Math.cos(z * 0.025) * 1.5;
            height += Math.cos(x * 0.025 + z * 0.035) * 1.2;
            height += Math.sin(x * 0.08) * Math.cos(z * 0.06) * 0.6;
            height += Math.sin(x * 0.05 + z * 0.07) * 0.8;
            height += (rand() - 0.5) * 0.5;
        }
        return height;
    }
    
    updateTerrainChunks(playerPosition) {
        // Calculate which chunks should exist around the player
        const playerChunkX = Math.floor(playerPosition.x / this.chunkSize);
        const playerChunkZ = Math.floor(playerPosition.z / this.chunkSize);
        const chunkRadius = Math.ceil(this.renderDistance / this.chunkSize);
        
        // Track which chunks should exist
        const requiredChunks = new Set();
        
        for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
            for (let dz = -chunkRadius; dz <= chunkRadius; dz++) {
                const chunkX = playerChunkX + dx;
                const chunkZ = playerChunkZ + dz;
                const distance = Math.sqrt(dx * dx + dz * dz) * this.chunkSize;
                
                if (distance <= this.renderDistance) {
                    const chunkKey = `${chunkX},${chunkZ}`;
                    requiredChunks.add(chunkKey);
                    
                    // Create chunk if it doesn't exist
                    if (!this.terrainChunks.has(chunkKey)) {
                        const chunk = this.createTerrainChunk(chunkX, chunkZ);
                        this.terrainChunks.set(chunkKey, chunk);
                    }
                }
            }
        }
        
        // Remove chunks that are too far away
        const chunksToRemove = [];
        for (const [chunkKey, chunk] of this.terrainChunks) {
            if (!requiredChunks.has(chunkKey)) {
                chunksToRemove.push(chunkKey);
                this.scene.remove(chunk.mesh);
                chunk.mesh.geometry.dispose();
                chunk.mesh.material.dispose();
            }
        }
        
        for (const chunkKey of chunksToRemove) {
            this.terrainChunks.delete(chunkKey);
        }
    }
    
    animateTerrainChunks() {
        for (const [chunkKey, chunk] of this.terrainChunks) {
            if (!chunk || !chunk.mesh || !chunk.mesh.geometry || !chunk.mesh.geometry.attributes.position || !chunk.mesh.geometry.attributes.color) continue;
            const positions = chunk.mesh.geometry.attributes.position;
            const colors = chunk.mesh.geometry.attributes.color;
            const posArray = positions.array;
            const colorArray = colors.array;
            for (let i = 0; i < chunk.originalHeights.length; i++) {
                const vertexIndex = i * 3 + 1; // Y coordinate
                const colorIndex = i * 3; // Color index
                const x = posArray[i * 3]; // X coordinate
                const z = posArray[i * 3 + 2]; // Z coordinate
                // Get original height
                const baseHeight = chunk.originalHeights[i];
                // Animate waves only
                let waveHeight = 0;
                waveHeight += Math.sin(x * this.waveFreq + z * this.waveFreq + this.wavePhase) * this.waveAmp;
                waveHeight += Math.cos(x * this.waveFreq * 1.3 + this.wavePhase * 1.2) * this.waveAmp * 0.6;
                // Apply final height only
                const finalHeight = baseHeight + waveHeight;
                posArray[vertexIndex] = finalHeight;
            }
            positions.needsUpdate = true;
            colors.needsUpdate = true;
            chunk.mesh.geometry.computeVertexNormals();
        }
    }
    
    animateTerrain() {
        const positions = this.mesh.geometry.attributes.position;
        const colors = this.mesh.geometry.attributes.color;
        const posArray = positions.array;
        const colorArray = colors.array;
        
        for (let i = 0; i < this.originalHeights.length; i++) {
            const vertexIndex = i * 3 + 1; // Y coordinate
            const colorIndex = i * 3; // Color index (RGB)
            const x = posArray[i * 3]; // X coordinate
            const z = posArray[i * 3 + 2]; // Z coordinate
            
            // Get original height
            const baseHeight = this.originalHeights[i];
            
            // Calculate storm intensity at this position
            let stormIntensity = 0;
            for (const storm of this.storms) {
                const dist = Math.sqrt((x - storm.x) ** 2 + (z - storm.z) ** 2);
                if (dist < storm.radius) {
                    const intensity = (1 - dist / storm.radius) * storm.amp;
                    stormIntensity = Math.max(stormIntensity, intensity);
                }
            }
            
            // Animate waves on top of base terrain
            let waveHeight = 0;
            
            // Base wave animation
            waveHeight += Math.sin(x * this.waveFreq + z * this.waveFreq + this.wavePhase) * this.waveAmp;
            waveHeight += Math.cos(x * this.waveFreq * 1.3 + this.wavePhase * 1.2) * this.waveAmp * 0.6;
            
            // Storm effects
            if (stormIntensity > 0) {
                const stormAmp = this.waveAmp * stormIntensity * 3.0;
                const stormFreq = this.waveFreq * (1.0 + stormIntensity);
                const stormPhase = this.wavePhase * (1.0 + stormIntensity * 0.7);
                
                waveHeight += Math.sin(x * stormFreq + stormPhase) * stormAmp * 0.5;
                waveHeight += Math.cos(z * stormFreq * 1.4 + stormPhase * 1.8) * stormAmp * 0.3;
                waveHeight += Math.sin((x + z) * stormFreq * 0.8 + stormPhase * 2.2) * stormAmp * 0.2;
                
                // Chaotic movement during severe storms
                if (stormIntensity > 1.5) {
                    waveHeight += (Math.random() - 0.5) * stormAmp * 0.4;
                }
            }
            
            
        }
        
        positions.needsUpdate = true;
        colors.needsUpdate = true; // Update colors
        this.mesh.geometry.computeVertexNormals();
    }
    
    animateOceanSurface(deltaTime) {
        if (!this.oceanSurface) return;
        
        const positions = this.oceanSurface.geometry.attributes.position;
        const posArray = positions.array;
        
        // Calculate storm effects on surface
        let avgStormIntensity = 0;
        for (const storm of this.storms) {
            avgStormIntensity += storm.intensity || storm.amp || 1.0;
        }
        avgStormIntensity = Math.min(avgStormIntensity / Math.max(this.storms.length, 1), 2.0);
        
        // Animate each vertex of the ocean surface to match terrain wave patterns
        for (let i = 0; i < this.originalSurfaceVertices.length; i++) {
            const vertex = this.originalSurfaceVertices[i];
            const arrayIndex = i * 3;
            
            // Use absolute world position (no offset since surface is stationary)
            const worldX = vertex.x;
            const worldZ = vertex.z;
            
            // Match terrain wave patterns but offset upward to ocean surface level
            let waveHeight = 0;
            
            // Base wave animation matching terrain chunks
            const waveAmp = this.waveAmp;
            const waveFreq = this.waveFreq;
            const wavePhase = this.wavePhase;
            
            // Primary wave motion (same as terrain)
            waveHeight += Math.sin(worldX * waveFreq + worldZ * waveFreq + wavePhase) * waveAmp;
            
            // Secondary wave layers for ocean depth
            waveHeight += Math.sin(worldX * waveFreq * 1.3 + wavePhase * 1.7) * waveAmp * 0.4;
            waveHeight += Math.cos(worldZ * waveFreq * 1.1 + wavePhase * 1.2) * waveAmp * 0.25;
            
            // Storm effects matching terrain storm animation
            if (avgStormIntensity > 0) {
                const stormAmp = waveAmp * avgStormIntensity * 2.5;
                const stormFreq = waveFreq * (1.0 + avgStormIntensity);
                const stormPhase = wavePhase * (1.0 + avgStormIntensity * 0.5);
                
                // Multiple overlapping storm waves (matching terrain)
                waveHeight += Math.sin(worldX * stormFreq + stormPhase) * stormAmp * 0.4;
                waveHeight += Math.cos(worldZ * stormFreq * 1.3 + stormPhase * 1.7) * stormAmp * 0.25;
                waveHeight += Math.sin((worldX + worldZ) * stormFreq * 0.7 + stormPhase * 2.1) * stormAmp * 0.15;
                
                // Chaotic surface during severe storms
                if (avgStormIntensity > 1.0) {
                    const chaosAmp = (avgStormIntensity - 1.0) * waveAmp * 1.5;
                    waveHeight += (Math.random() - 0.5) * chaosAmp;
                }
            }
            
            // Apply wave height (Y is up for the rotated plane)
            posArray[arrayIndex + 1] = vertex.y + waveHeight;
        }
        
        positions.needsUpdate = true;
        this.oceanSurface.geometry.computeVertexNormals();
        
        // Update surface material opacity based on storms
        if (avgStormIntensity > 0) {
            const stormOpacity = 0.6 + avgStormIntensity * 0.15; // Slightly more transparent
            this.oceanSurface.material.opacity = Math.min(stormOpacity, 0.75);
            
            // Add slight color shift during storms
            const stormTint = avgStormIntensity * 0.3;
            this.oceanSurface.material.color.setRGB(
                stormTint * 0.5, 
                0.67 - stormTint * 0.2, 
                1.0 - stormTint * 0.1
            );
        } else {
            this.oceanSurface.material.opacity = 0.6; // More transparent for consistency
            this.oceanSurface.material.color.setRGB(0, 0.67, 1.0); // Reset to light blue
        }
    }
    
    // getStormIntensityAtPosition removed
    
    remove() {
        // Remove all terrain chunks
        for (const [chunkKey, chunk] of this.terrainChunks) {
            this.scene.remove(chunk.mesh);
            chunk.mesh.geometry.dispose();
            chunk.mesh.material.dispose();
        }
        this.terrainChunks.clear();
        
        // Remove ocean surface
        if (this.oceanSurface) {
            this.scene.remove(this.oceanSurface);
            this.oceanSurface.geometry.dispose();
            this.oceanSurface.material.dispose();
        }
    }
}
