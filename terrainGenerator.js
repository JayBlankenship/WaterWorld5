// TerrainGenerator.js - Updated to use unified terrain system
import * as THREE from 'https://cdn.skypack.dev/three@0.134.0';
import { UnifiedTerrain } from './unifiedTerrain.js';

export class TerrainGenerator {
    constructor(scene, planeSize, planeGeometry, planeMaterial) {
        this.scene = scene;
        
        // Create unified terrain system
        this.unifiedTerrain = new UnifiedTerrain(scene, 800, 128); // 800x800 units, 128x128 resolution
        
        // Storm system removed
        
        // For networking compatibility
        this.newPlanes = new Set();
        this.removedPlanes = new Set();
    }

    // Simplified terrain generation using unified terrain
    generateNeighboringPlanes(entityPosition) {
        // Update unified terrain position and animation
        this.unifiedTerrain.update(window.deltaTime || 0.016, entityPosition);
        // For networking compatibility, clear tracking sets
        this.newPlanes.clear();
        this.removedPlanes.clear();
    }

    // updateStormSystem removed

    // getStormIntensityAtPosition removed

    // Remove distant planes (disabled: unified terrain doesn't need this)
    removeDistantPlanes(playerPosition, aiPlayers) {
        // Not needed with unified terrain
    }

    // Get terrain changes since last frame (for networking compatibility)
    getTerrainChanges() {
        const changes = {
            newPlanes: [],
            removedPlanes: []
        };
        
        // Clear the change tracking sets
        this.newPlanes.clear();
        this.removedPlanes.clear();
        
        return changes;
    }

    // Apply terrain changes from network (for networking compatibility)
    applyTerrainChanges(changes) {
        // Not needed with unified terrain, but kept for compatibility
    }
}