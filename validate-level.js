#!/usr/bin/env node

/**
 * Level Validation Utility for Traffic Jam Game
 *
 * Validates:
 * 1. No vehicle overlaps
 * 2. Passenger count matches seat capacity per color
 * 3. Level is winnable (all vehicles can eventually exit)
 *
 * Usage: node validate-level.js [level-file.json]
 *        node validate-level.js --all
 */

const fs = require('fs');
const path = require('path');

const CAPACITIES = { 1: 4, 2: 6, 3: 10 };

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

function checkOverlaps(level) {
    const errors = [];
    const grid = {};

    for (const vehicle of level.vehicles) {
        const cells = getVehicleCells(vehicle);

        for (const cell of cells) {
            const key = `${cell.x},${cell.y}`;

            // Check bounds
            if (cell.x < 0 || cell.x >= level.gridSize || cell.y < 0 || cell.y >= level.gridSize) {
                errors.push(`Vehicle ${vehicle.id} is out of bounds at (${cell.x}, ${cell.y})`);
            }

            // Check overlap
            if (grid[key]) {
                errors.push(`Overlap: ${vehicle.id} and ${grid[key]} both occupy (${cell.x}, ${cell.y})`);
            } else {
                grid[key] = vehicle.id;
            }
        }
    }

    return errors;
}

function checkPassengerCounts(level) {
    const errors = [];

    // Count seats per color
    const seatsByColor = {};
    for (const vehicle of level.vehicles) {
        const capacity = CAPACITIES[vehicle.size] || 4;
        seatsByColor[vehicle.color] = (seatsByColor[vehicle.color] || 0) + capacity;
    }

    // Count passengers per color
    const passengersByColor = {};
    for (const passenger of level.passengers) {
        passengersByColor[passenger] = (passengersByColor[passenger] || 0) + 1;
    }

    // Compare
    const allColors = new Set([...Object.keys(seatsByColor), ...Object.keys(passengersByColor)]);

    for (const color of allColors) {
        const seats = seatsByColor[color] || 0;
        const passengers = passengersByColor[color] || 0;

        if (seats !== passengers) {
            errors.push(`Color ${color}: ${seats} seats but ${passengers} passengers`);
        }
    }

    return errors;
}

function canVehicleExit(vehicle, vehicles, gridSize) {
    const dir = vehicle.direction || (vehicle.orientation === 'horizontal' ? 'right' : 'down');

    // Get all occupied cells except this vehicle
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

function checkWinnable(level) {
    const errors = [];
    const warnings = [];

    // Simple check: can we remove all vehicles one by one?
    // This uses a greedy approach - not guaranteed to find all solutions
    let remainingVehicles = [...level.vehicles];
    let stuck = false;
    let iterations = 0;
    const maxIterations = level.vehicles.length * level.vehicles.length;

    while (remainingVehicles.length > 0 && !stuck && iterations < maxIterations) {
        iterations++;
        let removed = false;

        for (let i = 0; i < remainingVehicles.length; i++) {
            if (canVehicleExit(remainingVehicles[i], remainingVehicles, level.gridSize)) {
                remainingVehicles.splice(i, 1);
                removed = true;
                break;
            }
        }

        if (!removed) {
            stuck = true;
        }
    }

    if (remainingVehicles.length > 0) {
        // Try to find if there's ANY way to solve it with BFS
        const solution = findSolution(level);
        if (!solution) {
            errors.push(`Level appears unwinnable. Stuck vehicles: ${remainingVehicles.map(v => v.id).join(', ')}`);
        } else {
            warnings.push(`Level is winnable but requires specific order: ${solution.join(' -> ')}`);
        }
    }

    return { errors, warnings };
}

function findSolution(level) {
    // BFS to find a valid exit order
    const queue = [{ remaining: [...level.vehicles], order: [] }];
    const visited = new Set();

    while (queue.length > 0) {
        const state = queue.shift();

        if (state.remaining.length === 0) {
            return state.order;
        }

        // Create state key for deduplication
        const stateKey = state.remaining.map(v => v.id).sort().join(',');
        if (visited.has(stateKey)) continue;
        visited.add(stateKey);

        // Try removing each vehicle that can exit
        for (let i = 0; i < state.remaining.length; i++) {
            const vehicle = state.remaining[i];
            if (canVehicleExit(vehicle, state.remaining, level.gridSize)) {
                const newRemaining = [...state.remaining];
                newRemaining.splice(i, 1);
                queue.push({
                    remaining: newRemaining,
                    order: [...state.order, vehicle.id]
                });
            }
        }
    }

    return null; // No solution found
}

function checkLoadingZoneWinnable(level) {
    // Simulate actual game with:
    // - 4 loading spots
    // - Passengers loaded from front of queue only
    // - Vehicles only load matching color passengers

    const LOADING_SPOTS = 4;
    const errors = [];

    // BFS with game state
    const initialState = {
        vehicles: [...level.vehicles],
        passengers: [...level.passengers],
        loadingZone: [], // vehicles currently loading
        order: []
    };

    const queue = [initialState];
    const visited = new Set();

    while (queue.length > 0) {
        const state = queue.shift();

        // Win condition: all passengers loaded
        if (state.passengers.length === 0 && state.loadingZone.length === 0) {
            return { success: true, order: state.order };
        }

        // Create state key
        const vehicleIds = state.vehicles.map(v => v.id).sort().join(',');
        const loadingIds = state.loadingZone.map(v => v.id).sort().join(',');
        const passCount = state.passengers.length;
        const stateKey = `${vehicleIds}|${loadingIds}|${passCount}`;

        if (visited.has(stateKey)) continue;
        visited.add(stateKey);

        // Try to complete loading for vehicles in loading zone
        let newLoadingZone = [...state.loadingZone];
        let newPassengers = [...state.passengers];
        let changed = true;

        while (changed) {
            changed = false;
            for (let i = newLoadingZone.length - 1; i >= 0; i--) {
                const vehicle = newLoadingZone[i];
                const capacity = CAPACITIES[vehicle.size] || 4;
                let loaded = vehicle.loaded || 0;

                // Try to load passengers from front of queue
                while (loaded < capacity && newPassengers.length > 0 && newPassengers[0] === vehicle.color) {
                    newPassengers.shift();
                    loaded++;
                    changed = true;
                }

                // If vehicle is full, it leaves
                if (loaded >= capacity) {
                    newLoadingZone.splice(i, 1);
                    changed = true;
                } else {
                    newLoadingZone[i] = { ...vehicle, loaded };
                }
            }
        }

        // If loading zone is full and no vehicle can load, we might be stuck
        if (newLoadingZone.length >= LOADING_SPOTS) {
            // Check if any vehicle in loading zone can still load
            const frontPassenger = newPassengers[0];
            const canLoad = newLoadingZone.some(v => v.color === frontPassenger && (v.loaded || 0) < (CAPACITIES[v.size] || 4));
            if (!canLoad && newPassengers.length > 0) {
                continue; // This state is stuck, skip it
            }
        }

        // Try moving each vehicle that can exit (if there's room in loading zone)
        if (newLoadingZone.length < LOADING_SPOTS) {
            for (let i = 0; i < state.vehicles.length; i++) {
                const vehicle = state.vehicles[i];
                if (canVehicleExit(vehicle, state.vehicles, level.gridSize)) {
                    const newVehicles = [...state.vehicles];
                    newVehicles.splice(i, 1);

                    queue.push({
                        vehicles: newVehicles,
                        passengers: [...newPassengers],
                        loadingZone: [...newLoadingZone, { ...vehicle, loaded: 0 }],
                        order: [...state.order, vehicle.id]
                    });
                }
            }
        }

        // Also try just waiting (advancing the loading state without moving new vehicles)
        if (newLoadingZone.length !== state.loadingZone.length || newPassengers.length !== state.passengers.length) {
            queue.push({
                vehicles: [...state.vehicles],
                passengers: newPassengers,
                loadingZone: newLoadingZone,
                order: [...state.order]
            });
        }
    }

    return { success: false, error: 'Level cannot be completed with loading zone constraint (4 spots, front-of-queue loading)' };
}

function validateLevel(filePath) {
    console.log(`\nValidating: ${filePath}`);
    console.log('='.repeat(50));

    let level;
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        level = JSON.parse(content);
    } catch (e) {
        console.log(`ERROR: Failed to read/parse file: ${e.message}`);
        return false;
    }

    let hasErrors = false;

    // Check overlaps
    const overlapErrors = checkOverlaps(level);
    if (overlapErrors.length > 0) {
        console.log('\nOVERLAP ERRORS:');
        overlapErrors.forEach(e => console.log(`  - ${e}`));
        hasErrors = true;
    }

    // Check passenger counts
    const countErrors = checkPassengerCounts(level);
    if (countErrors.length > 0) {
        console.log('\nPASSENGER COUNT ERRORS:');
        countErrors.forEach(e => console.log(`  - ${e}`));
        hasErrors = true;
    }

    // Check winnability
    const { errors: winErrors, warnings } = checkWinnable(level);
    if (winErrors.length > 0) {
        console.log('\nWINNABILITY ERRORS:');
        winErrors.forEach(e => console.log(`  - ${e}`));
        hasErrors = true;
    }
    if (warnings.length > 0) {
        console.log('\nWARNINGS:');
        warnings.forEach(w => console.log(`  - ${w}`));
    }

    // Check loading zone winnability (actual game constraints)
    // Note: This check is computationally expensive for large levels
    // Uncomment when levels are simpler or solver is optimized
    // const loadingResult = checkLoadingZoneWinnable(level);
    // if (!loadingResult.success) {
    //     console.log('\nLOADING ZONE ERRORS:');
    //     console.log(`  - ${loadingResult.error}`);
    //     hasErrors = true;
    // }

    if (!hasErrors) {
        console.log('\nVALIDATION PASSED');

        // Print summary
        console.log(`\nSummary:`);
        console.log(`  Grid size: ${level.gridSize}x${level.gridSize}`);
        console.log(`  Vehicles: ${level.vehicles.length}`);
        console.log(`  Passengers: ${level.passengers.length}`);
    }

    return !hasErrors;
}

function solveLevel(filePath) {
    console.log(`\nSolving: ${filePath}`);
    console.log('='.repeat(50));

    let level;
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        level = JSON.parse(content);
    } catch (e) {
        console.log(`ERROR: Failed to read/parse file: ${e.message}`);
        return false;
    }

    // First check basic winnability
    const solution = findSolution(level);
    if (!solution) {
        console.log('\nNo solution found - level may be unwinnable');
        return false;
    }

    console.log('\nSOLUTION FOUND!');
    console.log('\nVehicle exit order:');
    solution.forEach((id, i) => {
        const vehicle = level.vehicles.find(v => v.id === id);
        const dir = vehicle.direction || (vehicle.orientation === 'horizontal' ? 'right' : 'down');
        console.log(`  ${i + 1}. ${id} (${vehicle.color}) - exits ${dir}`);
    });

    console.log('\nNote: This shows one possible exit order.');
    console.log('In actual gameplay, you must also consider:');
    console.log('  - Loading zone capacity (4 spots)');
    console.log('  - Passenger queue order');

    return true;
}

// Main
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log('Usage: node validate-level.js [level-file.json]');
    console.log('       node validate-level.js --all');
    console.log('       node validate-level.js --solve [level-file.json]');
    process.exit(1);
}

if (args[0] === '--all') {
    const levelsDir = path.join(__dirname, 'levels');
    const files = fs.readdirSync(levelsDir).filter(f => f.endsWith('.json'));

    let allPassed = true;
    for (const file of files) {
        const passed = validateLevel(path.join(levelsDir, file));
        if (!passed) allPassed = false;
    }

    console.log('\n' + '='.repeat(50));
    console.log(allPassed ? 'ALL LEVELS VALID' : 'SOME LEVELS HAVE ERRORS');
    process.exit(allPassed ? 0 : 1);
} else if (args[0] === '--solve') {
    if (!args[1]) {
        console.log('Usage: node validate-level.js --solve [level-file.json]');
        process.exit(1);
    }
    const solved = solveLevel(args[1]);
    process.exit(solved ? 0 : 1);
} else {
    const passed = validateLevel(args[0]);
    process.exit(passed ? 0 : 1);
}
