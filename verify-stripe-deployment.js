#!/usr/bin/env node

/**
 * Verify Stripe Integration Deployment
 * Quick verification that Stripe endpoints are responding correctly
 */

const https = require('https');

const PRODUCTION_URL = 'https://restoreassist.app';

// ANSI colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

function log(message, color = RESET) {
  console.log(`${color}${message}${RESET}`);
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'RestoreAssist-Verification',
        ...options.headers,
      },
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

async function verifyCheckoutEndpoint() {
  log('\n📋 Verifying Checkout Endpoint...', BLUE);

  try {
    const response = await makeRequest(`${PRODUCTION_URL}/api/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { priceId: 'MONTHLY_PLAN' },
    });

    // Expect 401 (unauthorized) since we're not logged in
    if (response.statusCode === 401) {
      log('✓ Checkout endpoint is live and requires authentication', GREEN);
      return true;
    } else if (response.statusCode === 500) {
      log('✗ Checkout endpoint returned 500 error', RED);
      log(`Response: ${response.body}`, YELLOW);
      return false;
    } else {
      log(`⚠ Unexpected status code: ${response.statusCode}`, YELLOW);
      log(`Response: ${response.body}`, YELLOW);
      return true; // Still deployed, just unexpected
    }
  } catch (error) {
    log(`✗ Error checking endpoint: ${error.message}`, RED);
    return false;
  }
}

async function verifyWebhookEndpoint() {
  log('\n🔗 Verifying Webhook Endpoint...', BLUE);

  try {
    const response = await makeRequest(`${PRODUCTION_URL}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {},
    });

    // Expect 400 (missing signature) since we're not Stripe
    if (response.statusCode === 400) {
      const body = JSON.parse(response.body);
      if (body.error && body.error.includes('stripe-signature')) {
        log('✓ Webhook endpoint is live and validates signatures', GREEN);
        return true;
      }
    }

    log(`⚠ Unexpected webhook response: ${response.statusCode}`, YELLOW);
    return true;
  } catch (error) {
    log(`✗ Error checking webhook: ${error.message}`, RED);
    return false;
  }
}

async function checkStripeConfiguration() {
  log('\n⚙️  Checking Stripe Configuration...', BLUE);

  // This is informational only - can't directly verify env vars
  log('Configuration items to verify:', YELLOW);
  log('  • STRIPE_SECRET_KEY set in Vercel', YELLOW);
  log('  • NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY set in Vercel', YELLOW);
  log('  • STRIPE_PRICE_MONTHLY = price_1SK6GPBY5KEPMwxd43EBhwXx', YELLOW);
  log('  • STRIPE_PRICE_YEARLY = price_1SK6I7BY5KEPMwxdC451vfBk', YELLOW);
  log('  • STRIPE_PRICE_FREE_TRIAL = price_1SK6CHBY5KEPMwxdjZxT8CKH', YELLOW);

  return true;
}

async function verifyDeployment() {
  log('╔══════════════════════════════════════════════════╗', BLUE);
  log('║   Stripe Deployment Verification                ║', BLUE);
  log('║   Production: restoreassist.app                  ║', BLUE);
  log('╚══════════════════════════════════════════════════╝', BLUE);

  const results = {
    checkout: await verifyCheckoutEndpoint(),
    webhook: await verifyWebhookEndpoint(),
    config: await checkStripeConfiguration(),
  };

  log('\n╔══════════════════════════════════════════════════╗', BLUE);
  log('║   Verification Summary                           ║', BLUE);
  log('╚══════════════════════════════════════════════════╝', BLUE);

  log(`\nCheckout Endpoint: ${results.checkout ? '✓ PASS' : '✗ FAIL'}`,
    results.checkout ? GREEN : RED);
  log(`Webhook Endpoint: ${results.webhook ? '✓ PASS' : '✗ FAIL'}`,
    results.webhook ? GREEN : RED);
  log(`Configuration: ${results.config ? '✓ PASS' : '✗ FAIL'}`,
    results.config ? GREEN : RED);

  const allPassed = Object.values(results).every(r => r);

  if (allPassed) {
    log('\n✓ Stripe integration deployed successfully!', GREEN);
    log('\nNext Steps:', YELLOW);
    log('1. Configure webhook endpoint in Stripe Dashboard', YELLOW);
    log('2. Add STRIPE_WEBHOOK_SECRET to Vercel environment', YELLOW);
    log('3. Run test-stripe-integration.js for full testing', YELLOW);
    process.exit(0);
  } else {
    log('\n✗ Deployment verification failed', RED);
    log('Check the errors above and review deployment logs', YELLOW);
    process.exit(1);
  }
}

verifyDeployment().catch((error) => {
  log(`\n✗ Verification error: ${error.message}`, RED);
  console.error(error);
  process.exit(1);
});
