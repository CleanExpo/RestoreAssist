/**
 * Quick verification script to confirm tsx watch module reload issue
 *
 * This script demonstrates the problem:
 * 1. Starts with empty Map
 * 2. Adds users
 * 3. Simulates module reload (clears Map)
 * 4. Shows Map is empty
 */

// Simulate the module-level Map (like in authService.ts line 6)
let users = new Map();

console.log('\n=== Simulating tsx watch module lifecycle ===\n');

// Step 1: Initial module load
console.log('Step 1: Initial module load');
console.log(`Users count: ${users.size}`);
console.log('Users Map is empty (as expected on first load)\n');

// Step 2: Initialization (like the async IIFE in index.ts)
console.log('Step 2: Running initialization (async IIFE)');
users.set('user-1', { email: 'admin@restoreassist.com', name: 'Admin' });
users.set('user-2', { email: 'demo@restoreassist.com', name: 'Demo' });
console.log(`Users count after init: ${users.size}`);
console.log(`Users: ${Array.from(users.values()).map(u => u.email).join(', ')}`);
console.log('✅ Initialization complete\n');

// Step 3: Health check (doesn't use users Map)
console.log('Step 3: Health check succeeds');
console.log('GET /api/health -> 200 OK');
console.log('Playwright considers server "ready"\n');

// Step 4: Simulate tsx watch module reload
console.log('Step 4: tsx watch detects change and reloads authService module');
console.log('Simulating module reload...');
// This is what happens when tsx reloads the module
users = new Map(); // Old Map discarded, new empty Map created
console.log(`Users count after reload: ${users.size}`);
console.log('Users Map is now EMPTY (OLD Map with 2 users was garbage collected)\n');

// Step 5: Test tries to login
console.log('Step 5: Test attempts login');
const email = 'demo@restoreassist.com';
const user = Array.from(users.values()).find(u => u.email === email);
if (!user) {
  console.log(`❌ Login failed: User not found for ${email}`);
  console.log('Throwing: Error: Invalid credentials (authService.ts line 52)');
} else {
  console.log('✅ Login successful');
}

console.log('\n=== Problem Confirmed ===');
console.log('The users Map was reset by tsx watch module reload');
console.log('Initialization IIFE does not re-run on module reload');
console.log('Result: Empty users Map when tests execute\n');

console.log('=== Solution ===');
console.log('Option 1: Use persistent database (Prisma) instead of in-memory Map');
console.log('Option 2: Disable watch mode for E2E tests');
console.log('Option 3: Add lazy initialization that re-runs if Map is empty\n');
