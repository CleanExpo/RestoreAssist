// Test Stripe API endpoint directly
const https = require('https');

const data = JSON.stringify({
  priceId: 'price_1SK6GPBY5KEPMwxd43EBhwXx',
  planName: 'Monthly Plan',
  successUrl: 'https://restoreassist.app/success',
  cancelUrl: 'https://restoreassist.app/pricing'
});

const options = {
  hostname: 'restoreassist.app',
  port: 443,
  path: '/api/stripe/create-checkout-session',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  console.log(`\n=== Response Status: ${res.statusCode} ===\n`);
  console.log('Headers:', JSON.stringify(res.headers, null, 2));

  let body = '';

  res.on('data', (chunk) => {
    body += chunk;
  });

  res.on('end', () => {
    console.log('\n=== Response Body ===\n');
    try {
      const parsed = JSON.parse(body);
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log(body);
    }
  });
});

req.on('error', (error) => {
  console.error('Request error:', error);
});

req.write(data);
req.end();
