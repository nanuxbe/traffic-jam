#!/usr/bin/env node

/**
 * Level Generator for Traffic Jam Game
 *
 * Generates valid levels by:
 * 1. Placing vehicles without overlaps
 * 2. Ensuring all vehicles can exit
 * 3. Creating properly interleaved passenger queues
 *
 * Usage: node generate-level.js [options]
 *   --grid <size>      Grid size (default: 8)
 *   --vehicles <count> Number of vehicles (default: 16)
 *   --colors <count>   Number of colors (default: 7)
 *   --output <file>    Output file path
 */

const fs = require('fs');

const CAPACITIES = { 1: 4, 2: 6, 3: 10 };

const COLORS = [
    '#e74c3c', // red
    '#3498db', // blue
    '#27ae60', // green
    '#f39c12', // yellow
    '#9b59b6', // purple
    '#e91e63', // pink
    '#00bcd4', // cyan
];

function getVehicleCells(vehicle) {
    const cells = [];
    for (let i = 0; i < vehicle.size; i++) {
        if (vehicle.orientation === 'horizontal') {
            cells.push({ x: vehicle.x + i, y: vehicle.y });
        } else {
            cells.push({ x: vehicle.x, y: vehicle.y + i });
        }
    }
    return cells;
}

function canVehicleExit(vehicle, vehicles, gridSize) {
    const dir = vehicle.direction;
    const occupied = new Set();

    for (const v of vehicles) {
        if (v.id === vehicle.id) continue;
        for (const cell of getVehicleCells(v)) {
            occupied.add(`${cell.x},${cell.y}`);
        }
    }

    if (vehicle.orientation === 'horizontal') {
        if (dir === 'right') {
            for (let x = vehicle.x + vehicle.size; x < gridSize; x++) {
                if (occupied.has(`${x},${vehicle.y}`)) return false;
            }
        } else {
            for (let x = vehicle.x - 1; x >= 0; x--) {
                if (occupied.has(`${x},${vehicle.y}`)) return false;
            }
        }
    } else {
        if (dir === 'down') {
            for (let y = vehicle.y + vehicle.size; y < gridSize; y++) {
                if (occupied.has(`${vehicle.x},${y}`)) return false;
            }
        } else {
            for (let y = vehicle.y - 1; y >= 0; y--) {
                if (occupied.has(`${vehicle.x},${y}`)) return false;
            }
        }
    }
    return true;
}

function isWinnable(vehicles, gridSize) {
    // BFS to check if all vehicles can eventually exit
    const queue = [{ remaining: [...vehicles] }];
    const visited = new Set();

    while (queue.length > 0) {
        const state = queue.shift();
        if (state.remaining.length === 0) return true;

        const stateKey = state.remaining.map(v => v.id).sort().join(',');
        if (visited.has(stateKey)) continue;
        visited.add(stateKey);

        for (let i = 0; i < state.remaining.length; i++) {
            if (canVehicleExit(state.remaining[i], state.remaining, gridSize)) {
                const newRemaining = [...state.remaining];
                newRemaining.splice(i, 1);
                queue.push({ remaining: newRemaining });
            }
        }
    }
    return false;
}

function generateLevel(options = {}) {
    const gridSize = options.gridSize || 8;
    const targetVehicles = options.vehicleCount || 16;
    const colorCount = Math.min(options.colorCount || 7, COLORS.length);

    const usedColors = COLORS.slice(0, colorCount);
    let vehicles = [];
    let attempts = 0;
    const maxAttempts = 1000;

    while (vehicles.length < targetVehicles && attempts < maxAttempts) {
        attempts++;

        // Try to add a vehicle
        const size = Math.random() < 0.4 ? 1 : (Math.random() < 0.7 ? 2 : 3);
        const orientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
        const color = usedColors[Math.floor(Math.random() * usedColors.length)];

        // Determine direction based on position
        let direction;
        if (orientation === 'horizontal') {
            direction = Math.random() < 0.5 ? 'left' : 'right';
        } else {
            direction = Math.random() < 0.5 ? 'up' : 'down';
        }

        // Try random positions
        for (let posAttempt = 0; posAttempt < 50; posAttempt++) {
            let x, y;

            if (orientation === 'horizontal') {
                x = Math.floor(Math.random() * (gridSize - size + 1));
                y = Math.floor(Math.random() * gridSize);
            } else {
                x = Math.floor(Math.random() * gridSize);
                y = Math.floor(Math.random() * (gridSize - size + 1));
            }

            const newVehicle = {
                id: `vehicle${vehicles.length + 1}`,
                x, y, size, orientation, direction, color
            };

            // Check for overlaps
            const newCells = getVehicleCells(newVehicle);
            const occupied = new Set();
            for (const v of vehicles) {
                for (const cell of getVehicleCells(v)) {
                    occupied.add(`${cell.x},${cell.y}`);
                }
            }

            const hasOverlap = newCells.some(cell => occupied.has(`${cell.x},${cell.y}`));
            if (hasOverlap) continue;

            // Check if level is still winnable with this vehicle
            const testVehicles = [...vehicles, newVehicle];
            if (isWinnable(testVehicles, gridSize)) {
                // Rename with color-based ID
                const colorName = getColorName(color);
                const colorIndex = vehicles.filter(v => v.color === color).length + 1;
                newVehicle.id = `${colorName}${colorIndex}`;
                vehicles.push(newVehicle);
                break;
            }
        }
    }

    // Generate interleaved passengers
    const passengers = generatePassengers(vehicles);

    return {
        gridSize,
        vehicles,
        passengers
    };
}

function getColorName(hex) {
    const names = {
        '#e74c3c': 'red',
        '#3498db': 'blue',
        '#27ae60': 'green',
        '#f39c12': 'yellow',
        '#9b59b6': 'purple',
        '#e91e63': 'pink',
        '#00bcd4': 'cyan',
    };
    return names[hex] || 'unknown';
}

function generatePassengers(vehicles) {
    // Count passengers needed per color
    const passengersByColor = {};
    for (const vehicle of vehicles) {
        const capacity = CAPACITIES[vehicle.size] || 4;
        passengersByColor[vehicle.color] = (passengersByColor[vehicle.color] || 0) + capacity;
    }

    // Interleave passengers in groups of 4-6 (one vehicle capacity at a time)
    const passengers = [];
    const remaining = { ...passengersByColor };
    const colors = Object.keys(remaining);

    while (colors.some(c => remaining[c] > 0)) {
        for (const color of colors) {
            if (remaining[color] <= 0) continue;

            // Add 4-6 passengers of this color
            const count = Math.min(remaining[color], Math.random() < 0.5 ? 4 : 6);
            for (let i = 0; i < count; i++) {
                passengers.push(color);
            }
            remaining[color] -= count;
        }
    }

    return passengers;
}

// Parse arguments
const args = process.argv.slice(2);
const options = {
    gridSize: 8,
    vehicleCount: 16,
    colorCount: 7,
    output: null
};

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--grid' && args[i + 1]) {
        options.gridSize = parseInt(args[i + 1]);
        i++;
    } else if (args[i] === '--vehicles' && args[i + 1]) {
        options.vehicleCount = parseInt(args[i + 1]);
        i++;
    } else if (args[i] === '--colors' && args[i + 1]) {
        options.colorCount = parseInt(args[i + 1]);
        i++;
    } else if (args[i] === '--output' && args[i + 1]) {
        options.output = args[i + 1];
        i++;
    }
}

// Generate level
console.log('Generating level...');
console.log(`  Grid: ${options.gridSize}x${options.gridSize}`);
console.log(`  Target vehicles: ${options.vehicleCount}`);
console.log(`  Colors: ${options.colorCount}`);

const level = generateLevel(options);

console.log(`\nGenerated level:`);
console.log(`  Vehicles: ${level.vehicles.length}`);
console.log(`  Passengers: ${level.passengers.length}`);

// Output
const json = JSON.stringify(level, null, 2);

if (options.output) {
    fs.writeFileSync(options.output, json);
    console.log(`\nSaved to: ${options.output}`);
} else {
    console.log('\n' + json);
}
