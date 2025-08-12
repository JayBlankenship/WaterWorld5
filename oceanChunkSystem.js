import * as THREE from 'https://cdn.skypack.dev/three@0.134.0';

export class OceanChunkSystem {
    constructor(scene) {
        this.scene = scene;
        
        // Ocean chunk parameters
        this.chunkSize = 200; // Size of each ocean chunk (matches terrain)
        this.chunkResolution = 32; // Reduced resolution for better performance (32x32 vertices)
        this.renderDistance = 1600; // Slightly reduced render distance
        this.oceanChunks = new Map(); // Store ocean chunks by key "x,z"
        
        // Ocean wave parameters (matches shipPawn.js ocean function)
        this.baseOceanLevel = 20.0;
        this.waveSpeed = 2.0;
        
        // Ocean material
        this.oceanMaterial = new THREE.MeshBasicMaterial({
            color: 0x0066cc,
            wireframe: true,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        
        console.log('[OceanChunkSystem] Initialized with chunk-based ocean generation');
    }
    
    // Calculate ocean height at world coordinates (matches shipPawn.js exactly)
    calculateOceanHeight(x, z) {
        const globalOceanTime = window.globalOceanTime || 0;
        
        // Base ocean level
        let height = this.baseOceanLevel;
        
        // Apply the exact same wave calculation as shipPawn.js
        const t = globalOceanTime;
        height += Math.sin(0.08 * x + t * 0.6) * 1.0;
        height += Math.cos(0.07 * z + t * 0.4) * 0.8;
        height += Math.sin(0.06 * (x + z) + t * 0.2) * 0.5;
        
        return height;
    }
    
    // Create a single ocean chunk
    createOceanChunk(chunkX, chunkZ) {
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const indices = [];
        
        // Calculate world position of this chunk
        const worldOffsetX = chunkX * this.chunkSize;
        const worldOffsetZ = chunkZ * this.chunkSize;
        
        // Generate vertices for this chunk
        for (let z = 0; z <= this.chunkResolution; z++) {
            for (let x = 0; x <= this.chunkResolution; x++) {
                // World position
                const px = worldOffsetX + (x / this.chunkResolution) * this.chunkSize - this.chunkSize / 2;
                const pz = worldOffsetZ + (z / this.chunkResolution) * this.chunkSize - this.chunkSize / 2;
                
                // Calculate ocean height (will be animated in update)
                const height = this.calculateOceanHeight(px, pz);
                
                vertices.push(px, height, pz);
            }
        }
        
        // Generate indices for triangles
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
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        
        // Create mesh
        const mesh = new THREE.Mesh(geometry, this.oceanMaterial.clone());
        this.scene.add(mesh);
        
        // Store original vertices for animation
        const originalVertices = [];
        for (let i = 0; i < vertices.length; i += 3) {
            originalVertices.push({
                x: vertices[i],
                y: vertices[i + 1],
                z: vertices[i + 2]
            });
        }
        
        return {
            mesh: mesh,
            chunkX: chunkX,
            chunkZ: chunkZ,
            originalVertices: originalVertices
        };
    }
    
    // Update ocean chunks around player position
    updateOceanChunks(playerPosition) {
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
                    if (!this.oceanChunks.has(chunkKey)) {
                        const chunk = this.createOceanChunk(chunkX, chunkZ);
                        this.oceanChunks.set(chunkKey, chunk);
                    }
                }
            }
        }
        
        // Remove chunks that are too far away
        const chunksToRemove = [];
        for (const [chunkKey, chunk] of this.oceanChunks) {
            if (!requiredChunks.has(chunkKey)) {
                chunksToRemove.push(chunkKey);
                this.scene.remove(chunk.mesh);
                chunk.mesh.geometry.dispose();
                chunk.mesh.material.dispose();
            }
        }
        
        for (const chunkKey of chunksToRemove) {
            this.oceanChunks.delete(chunkKey);
        }
    }
    
    // Animate all ocean chunks
    animateOceanChunks() {
        for (const [chunkKey, chunk] of this.oceanChunks) {
            const positions = chunk.mesh.geometry.attributes.position;
            const posArray = positions.array;
            
            // Update each vertex height based on current time
            for (let i = 0; i < chunk.originalVertices.length; i++) {
                const vertex = chunk.originalVertices[i];
                const arrayIndex = i * 3;
                
                // Calculate new height using the deterministic ocean function
                const newHeight = this.calculateOceanHeight(vertex.x, vertex.z);
                posArray[arrayIndex + 1] = newHeight;
            }
            
            positions.needsUpdate = true;
            chunk.mesh.geometry.computeVertexNormals();
        }
    }
    
    // Update method called from game loop
    update(deltaTime, playerPosition) {
        // Generate/remove ocean chunks around player
        this.updateOceanChunks(playerPosition);
        
        // Animate all ocean chunks
        this.animateOceanChunks();
    }
    
    // Get ocean height at any world position (for ship physics)
    getOceanHeightAtPosition(x, z) {
        return this.calculateOceanHeight(x, z);
    }
    
    // Calculate ocean surface normal at any world position (for ship tilting)
    getOceanSurfaceNormal(x, z, sampleDistance = 0.1) {
        // Sample ocean height at nearby points to calculate surface normal
        const heightCenter = this.calculateOceanHeight(x, z);
        const heightRight = this.calculateOceanHeight(x + sampleDistance, z);
        const heightForward = this.calculateOceanHeight(x, z + sampleDistance);
        
        // Create vectors for the surface
        const vectorRight = new THREE.Vector3(sampleDistance, heightRight - heightCenter, 0);
        const vectorForward = new THREE.Vector3(0, heightForward - heightCenter, sampleDistance);
        
        // Calculate normal using cross product (corrected order for upward normal)
        const normal = new THREE.Vector3();
        normal.crossVectors(vectorForward, vectorRight);
        normal.normalize();
        
        // Ensure normal points upward (positive Y component)
        if (normal.y < 0) {
            normal.negate();
        }
        
        return normal;
    }
    
    // Cleanup method
    remove() {
        for (const [chunkKey, chunk] of this.oceanChunks) {
            this.scene.remove(chunk.mesh);
            chunk.mesh.geometry.dispose();
            chunk.mesh.material.dispose();
        }
        this.oceanChunks.clear();
    }
}
