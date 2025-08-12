// seededRandom.js
// Simple deterministic PRNG for terrain sync
export function seededRandom(seed) {
    let x = Math.sin(seed) * 10000;
    return function() {
        x = Math.sin(x) * 10000;
        return x - Math.floor(x);
    };
}

// Example usage:
// const rand = seededRandom(12345);
// rand(); // returns a deterministic random number between 0 and 1
