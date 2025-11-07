#!/usr/bin/env node

/**
 * Stripe Integration Test Script
 * Tests the Stripe checkout endpoint and validates configuration
 */

const https = require('https');

const BASE_URL = process.env.TEST_URL || 'https://restoreassist.app';
const TEST_EMAIL = 'test@restoreassist.app';
const TEST_PASSWORD = 'TestPassword123!';

// ANSI color codes
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

let sessionCookie = '';

function log(message, color = RESET) {
  console.log(`${color}${message}${RESET}`);
}

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';

      // Capture cookies from response
      const cookies = res.headers['set-cookie'];
      if (cookies) {
        sessionCookie = cookies.map(c => c.split(';')[0]).join('; ');
      }

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = {
            statusCode: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null
          };
          resolve(response);
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });

    req.on('error', reject);

    if (postData) {
      req.write(JSON.stringify(postData));
    }

    req.end();
  });
}

async function testAuthentication() {
  log('\n🔐 Testing Authentication...', BLUE);

  const url = new URL(`${BASE_URL}/api/auth/callback/credentials`);

  const options = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    }
  };

  try {
    const response = await makeRequest(options, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    if (response.statusCode === 200 || response.statusCode === 302) {
      log('✓ Authentication successful', GREEN);
      return true;
    } else {
      log(`✗ Authentication failed: ${response.statusCode}`, RED);
      log(`Response: ${JSON.stringify(response.body, null, 2)}`, YELLOW);
      return false;
    }
  } catch (error) {
    log(`✗ Authentication error: ${error.message}`, RED);
    return false;
  }
}

async function testStripeCheckout(priceId) {
  log(`\n💳 Testing Stripe Checkout (${priceId})...`, BLUE);

  const url = new URL(`${BASE_URL}/api/create-checkout-session`);

  const options = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': sessionCookie,
    }
  };

  try {
    const response = await makeRequest(options, { priceId });

    log(`Status: ${response.statusCode}`, YELLOW);
    log(`Response: ${JSON.stringify(response.body, null, 2)}`, YELLOW);

    if (response.statusCode === 200) {
      if (response.body.sessionId && response.body.url) {
        log('✓ Checkout session created successfully', GREEN);
        log(`Session ID: ${response.body.sessionId}`, GREEN);
        log(`Checkout URL: ${response.body.url}`, GREEN);
        return true;
      } else {
        log('✗ Missing sessionId or url in response', RED);
        return false;
      }
    } else if (response.statusCode === 401) {
      log('✗ Unauthorized - Authentication required', RED);
      return false;
    } else if (response.statusCode === 400) {
      log('✗ Bad request - Invalid price ID or parameters', RED);
      log(`Error: ${response.body.error}`, RED);
      log(`Details: ${response.body.details}`, YELLOW);
      return false;
    } else if (response.statusCode === 500) {
      log('✗ Server error - Check logs for details', RED);
      log(`Error: ${response.body.error}`, RED);
      log(`Type: ${response.body.type}`, YELLOW);
      log(`Details: ${response.body.details}`, YELLOW);
      return false;
    } else {
      log(`✗ Unexpected status code: ${response.statusCode}`, RED);
      return false;
    }
  } catch (error) {
    log(`✗ Request error: ${error.message}`, RED);
    return false;
  }
}

async function testInvalidPriceId() {
  log('\n🚫 Testing Invalid Price ID...', BLUE);

  const url = new URL(`${BASE_URL}/api/create-checkout-session`);

  const options = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': sessionCookie,
    }
  };

  try {
    const response = await makeRequest(options, { priceId: 'invalid_price_id' });

    if (response.statusCode === 400) {
      log('✓ Invalid price ID correctly rejected', GREEN);
      return true;
    } else {
      log(`✗ Expected 400, got ${response.statusCode}`, RED);
      return false;
    }
  } catch (error) {
    log(`✗ Request error: ${error.message}`, RED);
    return false;
  }
}

async function runTests() {
  log('╔══════════════════════════════════════════════════╗', BLUE);
  log('║   Stripe Integration Test Suite                 ║', BLUE);
  log('║   RestoreAssist Payment Processing               ║', BLUE);
  log('╚══════════════════════════════════════════════════╝', BLUE);
  log(`\nTarget: ${BASE_URL}`, YELLOW);

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
  };

  // Test 1: Authentication
  results.total++;
  const authSuccess = await testAuthentication();
  if (authSuccess) results.passed++;
  else results.failed++;

  if (!authSuccess) {
    log('\n⚠️  Skipping Stripe tests - authentication required', YELLOW);
    printSummary(results);
    return;
  }

  // Test 2: Monthly Plan
  results.total++;
  const monthlySuccess = await testStripeCheckout('MONTHLY_PLAN');
  if (monthlySuccess) results.passed++;
  else results.failed++;

  // Test 3: Yearly Plan
  results.total++;
  const yearlySuccess = await testStripeCheckout('YEARLY_PLAN');
  if (yearlySuccess) results.passed++;
  else results.failed++;

  // Test 4: Direct Price ID
  results.total++;
  const priceSuccess = await testStripeCheckout('price_1SK6GPBY5KEPMwxd43EBhwXx');
  if (priceSuccess) results.passed++;
  else results.failed++;

  // Test 5: Invalid Price ID
  results.total++;
  const invalidSuccess = await testInvalidPriceId();
  if (invalidSuccess) results.passed++;
  else results.failed++;

  printSummary(results);
}

function printSummary(results) {
  log('\n╔══════════════════════════════════════════════════╗', BLUE);
  log('║   Test Summary                                   ║', BLUE);
  log('╚══════════════════════════════════════════════════╝', BLUE);
  log(`\nTotal Tests: ${results.total}`, YELLOW);
  log(`Passed: ${results.passed}`, GREEN);
  log(`Failed: ${results.failed}`, RED);
  log(`Success Rate: ${((results.passed / results.total) * 100).toFixed(1)}%\n`, YELLOW);

  if (results.failed === 0) {
    log('✓ All tests passed! Stripe integration is working correctly.', GREEN);
    process.exit(0);
  } else {
    log('✗ Some tests failed. Please review the output above.', RED);
    process.exit(1);
  }
}

// Run tests
runTests().catch((error) => {
  log(`\n✗ Test suite error: ${error.message}`, RED);
  console.error(error);
  process.exit(1);
});
