/**
 * Direct API Testing - Tests authentication endpoints
 */

const https = require('https');

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          cookies: res.headers['set-cookie'] || []
        });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function testAPIs() {
  console.log('\n=== API Direct Testing ===\n');

  // Test 1: Get CSRF Token
  console.log('1. Testing /api/auth/csrf');
  try {
    const csrf = await makeRequest({
      hostname: 'restoreassist.app',
      path: '/api/auth/csrf',
      method: 'GET',
      headers: { 'User-Agent': 'Test' }
    });
    console.log('   Status:', csrf.statusCode);
    console.log('   Body:', csrf.body.substring(0, 200));
  } catch (e) {
    console.log('   Error:', e.message);
  }

  // Test 2: Get Session
  console.log('\n2. Testing /api/auth/session');
  try {
    const session = await makeRequest({
      hostname: 'restoreassist.app',
      path: '/api/auth/session',
      method: 'GET',
      headers: { 'User-Agent': 'Test' }
    });
    console.log('   Status:', session.statusCode);
    console.log('   Body:', session.body);
  } catch (e) {
    console.log('   Error:', e.message);
  }

  // Test 3: Check providers
  console.log('\n3. Testing /api/auth/providers');
  try {
    const providers = await makeRequest({
      hostname: 'restoreassist.app',
      path: '/api/auth/providers',
      method: 'GET',
      headers: { 'User-Agent': 'Test' }
    });
    console.log('   Status:', providers.statusCode);
    console.log('   Body:', providers.body);
  } catch (e) {
    console.log('   Error:', e.message);
  }

  // Test 4: POST login
  console.log('\n4. Testing POST /api/auth/callback/credentials');
  try {
    const loginData = new URLSearchParams({
      email: 'test@restoreassist.com',
      password: 'Test123!@#',
      callbackUrl: '/dashboard',
      json: 'true'
    }).toString();

    const login = await makeRequest({
      hostname: 'restoreassist.app',
      path: '/api/auth/callback/credentials',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(loginData),
        'User-Agent': 'Test'
      }
    }, loginData);
    console.log('   Status:', login.statusCode);
    console.log('   Headers:', login.headers);
    console.log('   Cookies:', login.cookies);
    console.log('   Body:', login.body.substring(0, 500));
  } catch (e) {
    console.log('   Error:', e.message);
  }

  // Test 5: Check signin endpoint
  console.log('\n5. Testing POST /api/auth/signin');
  try {
    const signinData = JSON.stringify({
      email: 'test@restoreassist.com',
      password: 'Test123!@#'
    });

    const signin = await makeRequest({
      hostname: 'restoreassist.app',
      path: '/api/auth/signin',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(signinData),
        'User-Agent': 'Test'
      }
    }, signinData);
    console.log('   Status:', signin.statusCode);
    console.log('   Body:', signin.body.substring(0, 500));
  } catch (e) {
    console.log('   Error:', e.message);
  }

  // Test 6: Custom login endpoint
  console.log('\n6. Testing POST /api/login');
  try {
    const customLoginData = JSON.stringify({
      email: 'test@restoreassist.com',
      password: 'Test123!@#'
    });

    const customLogin = await makeRequest({
      hostname: 'restoreassist.app',
      path: '/api/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(customLoginData),
        'User-Agent': 'Test'
      }
    }, customLoginData);
    console.log('   Status:', customLogin.statusCode);
    console.log('   Body:', customLogin.body.substring(0, 500));
  } catch (e) {
    console.log('   Error:', e.message);
  }
}

testAPIs();
