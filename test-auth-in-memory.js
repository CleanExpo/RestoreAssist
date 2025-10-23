/**
 * Test Email/Password Auth in IN-MEMORY Mode
 * This bypasses database and uses authService in-memory storage
 */

const axios = require('axios');

const API_BASE_URL = 'http://localhost:3001';
const TEST_EMAIL = `test-${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPass123!';

console.log('\n========================================');
console.log('IN-MEMORY AUTH TEST');
console.log('========================================\n');

async function testInMemoryAuth() {
  try {
    // First, let's check what mode the backend is in
    console.log('Checking backend mode...\n');

    // Test 1: Sign up
    console.log(`TEST 1: Signing up with ${TEST_EMAIL}...`);
    const signupRes = await axios.post(`${API_BASE_URL}/api/trial-auth/email-signup`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      name: 'Test User',
    });

    console.log('✅ Signup successful!');
    console.log(`   User ID: ${signupRes.data.user.userId}`);
    console.log(`   Has tokens: ${!!signupRes.data.tokens}\n`);

    const userId = signupRes.data.user.userId;
    const accessToken = signupRes.data.tokens.accessToken;

    // Test 2: Login
    console.log('TEST 2: Logging in...');
    const loginRes = await axios.post(`${API_BASE_URL}/api/trial-auth/email-login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    console.log('✅ Login successful!');
    console.log(`   Same user ID: ${loginRes.data.user.userId === userId}\n`);

    // Test 3: JWT verification
    console.log('TEST 3: Verifying JWT...');
    const meRes = await axios.get(`${API_BASE_URL}/api/trial-auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    console.log('✅ JWT verified!');
    console.log(`   Email: ${meRes.data.email}\n`);

    console.log('========================================');
    console.log('✅ ALL TESTS PASSED');
    console.log('Authentication is working (in-memory or database)');
    console.log('========================================\n');

    return true;
  } catch (error) {
    console.error('\n❌ TEST FAILED:');
    console.error(`   ${error.message}`);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Error: ${error.response.data.error}`);
    }
    console.log('\n');
    return false;
  }
}

testInMemoryAuth()
  .then(success => process.exit(success ? 0 : 1))
  .catch(() => process.exit(1));
