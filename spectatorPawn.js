import * as THREE from 'https://cdn.skypack.dev/three@0.134.0';

export class SpectatorPawn {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.speed = 100; // Fast movement speed
        this.mouseSensitivity = 0.002;
        this.active = false;

        // Initial position and rotation
        this.position = new THREE.Vector3(0, 100, 0);
        this.rotation = new THREE.Euler(0, 0, 0);

        // Movement state - tracks which keys are pressed
        this.keys = {
            forward: false,    // W key
            backward: false,   // S key
            left: false,       // A key
            right: false,      // D key
            up: false,         // Space key
            down: false        // Shift key
        };

        // Mouse look state
        this.yaw = 0;
        this.pitch = 0;

        // Bind event handlers
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);

        console.log('[SpectatorPawn] Constructor completed with speed:', this.speed);
    }

    update(deltaTime) {
        if (!this.active) {
            return;
        }

        // Calculate movement based on key presses
        const movement = new THREE.Vector3();
        const speed = this.speed * deltaTime;

        // Create forward/right vectors based on camera rotation
        const forward = new THREE.Vector3(0, 0, -1);
        const right = new THREE.Vector3(1, 0, 0);
        const up = new THREE.Vector3(0, 1, 0);

        // Apply camera rotation to movement vectors
        forward.applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
        right.applyEuler(new THREE.Euler(0, this.yaw, 0, 'YXZ'));

        // Apply movement based on pressed keys
        if (this.keys.forward) {
            movement.add(forward.clone().multiplyScalar(speed));
        }
        if (this.keys.backward) {
            movement.add(forward.clone().multiplyScalar(-speed));
        }
        if (this.keys.right) {
            movement.add(right.clone().multiplyScalar(speed));
        }
        if (this.keys.left) {
            movement.add(right.clone().multiplyScalar(-speed));
        }
        if (this.keys.up) {
            movement.add(up.clone().multiplyScalar(speed));
        }
        if (this.keys.down) {
            movement.add(up.clone().multiplyScalar(-speed));
        }

        // Apply movement to position and camera
        if (movement.length() > 0) {
            this.position.add(movement);
            this.camera.position.copy(this.position);
        }
    }

    // Handle mouse movement for looking around
    handleMouseMovement(mouseX, mouseY) {
        if (!this.active) return;

        // Update yaw and pitch based on mouse movement
        this.yaw -= mouseX * this.mouseSensitivity;
        this.pitch -= mouseY * this.mouseSensitivity;

        // Clamp pitch to prevent camera flipping
        this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));

        // Apply rotation to camera
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.yaw;
        this.camera.rotation.x = this.pitch;
        this.camera.rotation.z = 0;
    }

    activate() {
        console.log('[SpectatorPawn] Activating...');
        this.active = true;
        
        // Set spectator position relative to current camera position
        this.position.copy(this.camera.position);
        this.position.y = Math.max(this.position.y, 100); // Start high up
        
        // Extract current yaw and pitch from camera rotation
        this.yaw = this.camera.rotation.y;
        this.pitch = this.camera.rotation.x;
        
        // Set camera position immediately
        this.camera.position.copy(this.position);
        
        // Add keyboard event listeners
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);
        
        console.log('[SpectatorPawn] Activated with position:', this.position.toArray(), 'Active:', this.active);
    }

    deactivate() {
        console.log('[SpectatorPawn] Deactivating...');
        this.active = false;
        
        // Reset key states
        Object.keys(this.keys).forEach(key => this.keys[key] = false);
        
        // Remove keyboard event listeners
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);
        
        console.log('[SpectatorPawn] Deactivated, Active:', this.active);
    }

    // Handle key press events
    handleKeyDown(event) {
        if (!this.active) return;
        
        const key = event.key.toLowerCase();
        switch (key) {
            case 'w':
                this.keys.forward = true;
                break;
            case 's':
                this.keys.backward = true;
                break;
            case 'a':
                this.keys.left = true;
                break;
            case 'd':
                this.keys.right = true;
                break;
            case ' ':
                this.keys.up = true;
                event.preventDefault(); // Prevent page scroll
                break;
            case 'shift':
                this.keys.down = true;
                break;
        }
    }

    // Handle key release events
    handleKeyUp(event) {
        if (!this.active) return;
        
        const key = event.key.toLowerCase();
        switch (key) {
            case 'w':
                this.keys.forward = false;
                break;
            case 's':
                this.keys.backward = false;
                break;
            case 'a':
                this.keys.left = false;
                break;
            case 'd':
                this.keys.right = false;
                break;
            case ' ':
                this.keys.up = false;
                break;
            case 'shift':
                this.keys.down = false;
                break;
        }
    }

    // Clean up event listeners
    destroy() {
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);
    }
}
