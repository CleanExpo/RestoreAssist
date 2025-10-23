/**
 * Detailed Authentication Test with debugging
 */

const axios = require('axios');

const API_BASE_URL = 'http://localhost:3001';
const TEST_EMAIL = `test-${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPass123!';

async function test() {
  try {
    console.log('\n=== STEP 1: SIGNUP ===');
    const signupRes = await axios.post(`${API_BASE_URL}/api/trial-auth/email-signup`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      name: 'Test User',
    });

    console.log('Signup response:', JSON.stringify(signupRes.data, null, 2));
    const userId = signupRes.data.user.userId;
    const accessToken = signupRes.data.tokens.accessToken;

    console.log('\n=== STEP 2: LOGIN ===');
    const loginRes = await axios.post(`${API_BASE_URL}/api/trial-auth/email-login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    console.log('Login response:', JSON.stringify(loginRes.data, null, 2));

    console.log('\n=== STEP 3: GET /ME ===');
    console.log(`Using userId: ${userId}`);
    console.log(`Using access token: ${accessToken.substring(0, 20)}...`);

    try {
      const meRes = await axios.get(`${API_BASE_URL}/api/trial-auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      console.log('Me response:', JSON.stringify(meRes.data, null, 2));
      console.log('\n✅ SUCCESS: All endpoints working!');
    } catch (error) {
      console.error('\n❌ /me endpoint failed:');
      console.error('Status:', error.response?.status);
      console.error('Error:', error.response?.data);

      // Try to decode the JWT to see what's in it
      const jwtParts = accessToken.split('.');
      const payload = JSON.parse(Buffer.from(jwtParts[1], 'base64').toString());
      console.log('\nJWT Payload:', JSON.stringify(payload, null, 2));
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', error.response.data);
    }
  }
}

test();
