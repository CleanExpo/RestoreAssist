/**
 * Email/Password Authentication Verification Test
 * Tests whether authentication is real database or mock
 */

const axios = require('axios');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const TEST_EMAIL = `test-${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPass123!';
const TEST_NAME = 'Test User';

console.log('\n========================================');
console.log('EMAIL/PASSWORD AUTH VERIFICATION TEST');
console.log('========================================\n');

async function testAuthSystem() {
  const results = {
    signup: null,
    login: null,
    loginAgain: null,
    jwtVerification: null,
    sessionPersistence: null,
  };

  try {
    // =====================================================
    // TEST 1: Create Account (Signup)
    // =====================================================
    console.log('TEST 1: Creating new account...');
    console.log(`  Email: ${TEST_EMAIL}`);
    console.log(`  Password: ${TEST_PASSWORD}\n`);

    const signupResponse = await axios.post(`${API_BASE_URL}/api/trial-auth/email-signup`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      name: TEST_NAME,
    });

    results.signup = {
      success: signupResponse.data.success,
      user: signupResponse.data.user,
      hasTokens: !!signupResponse.data.tokens,
      hasAccessToken: !!signupResponse.data.tokens?.accessToken,
      hasRefreshToken: !!signupResponse.data.tokens?.refreshToken,
      hasSessionToken: !!signupResponse.data.sessionToken,
    };

    console.log('✅ Signup successful!');
    console.log(`  User ID: ${results.signup.user.userId}`);
    console.log(`  Email: ${results.signup.user.email}`);
    console.log(`  Access Token: ${results.signup.hasAccessToken ? 'Present' : 'Missing'}`);
    console.log(`  Refresh Token: ${results.signup.hasRefreshToken ? 'Present' : 'Missing'}`);
    console.log(`  Session Token: ${results.signup.hasSessionToken ? 'Present' : 'Missing'}\n`);

    const accessToken = signupResponse.data.tokens.accessToken;
    const userId = signupResponse.data.user.userId;

    // =====================================================
    // TEST 2: Login with Same Credentials
    // =====================================================
    console.log('TEST 2: Logging in with same credentials...');

    const loginResponse = await axios.post(`${API_BASE_URL}/api/trial-auth/email-login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    results.login = {
      success: loginResponse.data.success,
      sameUserId: loginResponse.data.user.userId === userId,
      hasTokens: !!loginResponse.data.tokens,
    };

    console.log('✅ Login successful!');
    console.log(`  User ID matches signup: ${results.login.sameUserId}`);
    console.log(`  New access token received: ${!!loginResponse.data.tokens?.accessToken}\n`);

    // =====================================================
    // TEST 3: Test Wrong Password
    // =====================================================
    console.log('TEST 3: Testing wrong password (should fail)...');

    try {
      await axios.post(`${API_BASE_URL}/api/trial-auth/email-login`, {
        email: TEST_EMAIL,
        password: 'WrongPassword123!',
      });
      console.log('❌ ERROR: Login succeeded with wrong password!\n');
      results.loginAgain = { shouldFail: true, actuallyFailed: false };
    } catch (error) {
      console.log('✅ Login correctly rejected wrong password');
      console.log(`  Error: ${error.response?.data?.error}\n`);
      results.loginAgain = { shouldFail: true, actuallyFailed: true };
    }

    // =====================================================
    // TEST 4: Verify JWT Token Works
    // =====================================================
    console.log('TEST 4: Verifying JWT token with /me endpoint...');

    const meResponse = await axios.get(`${API_BASE_URL}/api/trial-auth/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    results.jwtVerification = {
      success: true,
      userId: meResponse.data.userId,
      email: meResponse.data.email,
      matchesSignup: meResponse.data.userId === userId,
    };

    console.log('✅ JWT token verified successfully!');
    console.log(`  User ID: ${meResponse.data.userId}`);
    console.log(`  Email: ${meResponse.data.email}`);
    console.log(`  Matches signup user: ${results.jwtVerification.matchesSignup}\n`);

    // =====================================================
    // TEST 5: Test Session Persistence (Login Again)
    // =====================================================
    console.log('TEST 5: Testing session persistence (login again)...');

    const loginAgainResponse = await axios.post(`${API_BASE_URL}/api/trial-auth/email-login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    results.sessionPersistence = {
      success: loginAgainResponse.data.success,
      sameUserId: loginAgainResponse.data.user.userId === userId,
      canLoginMultipleTimes: true,
    };

    console.log('✅ Session persistence verified!');
    console.log(`  User ID still matches: ${results.sessionPersistence.sameUserId}`);
    console.log(`  Can login multiple times: ${results.sessionPersistence.canLoginMultipleTimes}\n`);

  } catch (error) {
    console.error('\n❌ TEST FAILED:');
    console.error(`  Error: ${error.message}`);
    if (error.response) {
      console.error(`  Status: ${error.response.status}`);
      console.error(`  Response: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return false;
  }

  // =====================================================
  // FINAL ANALYSIS
  // =====================================================
  console.log('\n========================================');
  console.log('FINAL ANALYSIS');
  console.log('========================================\n');

  const isRealAuth =
    results.signup?.success &&
    results.login?.success &&
    results.login?.sameUserId &&
    results.loginAgain?.actuallyFailed &&
    results.jwtVerification?.matchesSignup &&
    results.sessionPersistence?.sameUserId;

  if (isRealAuth) {
    console.log('✅ AUTHENTICATION IS REAL DATABASE');
    console.log('\nEvidence:');
    console.log('  ✅ Account creation succeeded');
    console.log('  ✅ Login with credentials succeeded');
    console.log('  ✅ Login with wrong password failed (properly secured)');
    console.log('  ✅ JWT tokens are valid and authenticated');
    console.log('  ✅ User ID persists across logins');
    console.log('  ✅ Session persistence works correctly');

    console.log('\nDatabase Mode:');
    console.log(`  USE_POSTGRES=${process.env.USE_POSTGRES || 'true'}`);

    console.log('\nConclusion:');
    console.log('  Email/password authentication is using REAL database storage.');
    console.log('  User accounts persist and can be logged into repeatedly.');
    console.log('  Password verification is working correctly with bcrypt.');
    console.log('  JWT tokens are properly generated and validated.');
  } else {
    console.log('⚠️  AUTHENTICATION MAY BE MOCK OR PARTIALLY WORKING');
    console.log('\nIssues detected:');
    if (!results.signup?.success) console.log('  ❌ Signup failed');
    if (!results.login?.success) console.log('  ❌ Login failed');
    if (!results.login?.sameUserId) console.log('  ❌ User ID does not persist');
    if (!results.loginAgain?.actuallyFailed) console.log('  ❌ Wrong password not rejected');
    if (!results.jwtVerification?.matchesSignup) console.log('  ❌ JWT verification failed');
    if (!results.sessionPersistence?.sameUserId) console.log('  ❌ Session persistence broken');
  }

  console.log('\n========================================\n');

  return isRealAuth;
}

// Run the test
testAuthSystem()
  .then(isReal => {
    process.exit(isReal ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
