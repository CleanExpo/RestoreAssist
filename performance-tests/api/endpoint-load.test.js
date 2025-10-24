import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate, Trend } from 'k6/metrics';
import { TEST_CONFIG, getRandomUser } from '../config/test-config.js';

// Custom metrics
const authEndpointDuration = new Trend('auth_endpoint_duration');
const reportGenerationDuration = new Trend('report_generation_duration');
const checkoutCreationDuration = new Trend('checkout_creation_duration');
const webhookProcessingDuration = new Trend('webhook_processing_duration');
const apiErrorRate = new Rate('api_errors');

// Shared test data
const testUsers = new SharedArray('users', function() {
  return TEST_CONFIG.test_users;
});

export let options = {
  scenarios: {
    authentication_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 50 },   // Ramp up to 50 users
        { duration: '3m', target: 100 },  // Stay at 100 users (100 req/s target)
        { duration: '1m', target: 0 }     // Ramp down
      ],
      gracefulRampDown: '30s',
      exec: 'testAuthEndpoints'
    },
    report_generation: {
      executor: 'constant-arrival-rate',
      rate: 10,                          // 10 reports per second
      timeUnit: '1s',
      duration: '3m',
      preAllocatedVUs: 20,
      maxVUs: 50,
      exec: 'testReportGeneration'
    },
    checkout_creation: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      stages: [
        { duration: '1m', target: 20 },   // Ramp up to 20 checkouts/s
        { duration: '2m', target: 20 },   // Maintain rate
        { duration: '1m', target: 0 }     // Ramp down
      ],
      preAllocatedVUs: 10,
      exec: 'testCheckoutCreation'
    },
    webhook_processing: {
      executor: 'constant-vus',
      vus: 10,
      duration: '3m',
      exec: 'testWebhookProcessing'
    }
  },
  thresholds: {
    'auth_endpoint_duration': ['p(95)<500', 'p(99)<1000'],
    'report_generation_duration': ['p(95)<15000', 'p(99)<20000'],
    'checkout_creation_duration': ['p(95)<1000', 'p(99)<2000'],
    'webhook_processing_duration': ['p(95)<2000', 'p(99)<3000'],
    'api_errors': ['rate<0.05'],
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.1']
  }
};

// Authentication endpoint tests
export function testAuthEndpoints() {
  const baseUrl = TEST_CONFIG.BASE_URL;
  const user = getRandomUser();

  group('Login Endpoint', () => {
    const startTime = Date.now();
    const res = http.post(`${baseUrl}/api/auth/login`,
      JSON.stringify({
        email: user.email,
        password: user.password
      }),
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );
    const duration = Date.now() - startTime;

    check(res, {
      'Login successful': (r) => r.status === 200,
      'JWT token present': (r) => r.json('token') !== undefined,
      'Response time < 500ms': (r) => duration < 500
    });

    authEndpointDuration.add(duration);
    apiErrorRate.add(res.status !== 200);

    // Store token for subsequent requests
    if (res.status === 200) {
      return { token: res.json('token') };
    }
  });

  sleep(1); // Think time

  group('Token Refresh', () => {
    const startTime = Date.now();
    const res = http.post(`${baseUrl}/api/auth/refresh`,
      null,
      {
        headers: {
          'Authorization': `Bearer ${__VU.token || 'test-token'}`
        }
      }
    );
    const duration = Date.now() - startTime;

    check(res, {
      'Token refresh successful': (r) => r.status === 200,
      'New token received': (r) => r.json('token') !== undefined,
      'Response time < 300ms': (r) => duration < 300
    });

    authEndpointDuration.add(duration);
    apiErrorRate.add(res.status !== 200);
  });

  sleep(1);

  group('Protected Route Access', () => {
    const startTime = Date.now();
    const res = http.get(`${baseUrl}/api/user/profile`,
      {
        headers: {
          'Authorization': `Bearer ${__VU.token || 'test-token'}`
        }
      }
    );
    const duration = Date.now() - startTime;

    check(res, {
      'Protected route accessible': (r) => r.status === 200,
      'User data returned': (r) => r.json('user') !== undefined,
      'Response time < 200ms': (r) => duration < 200
    });

    authEndpointDuration.add(duration);
    apiErrorRate.add(res.status !== 200);
  });
}

// Report generation tests
export function testReportGeneration() {
  const baseUrl = TEST_CONFIG.BASE_URL;

  group('Report Generation', () => {
    const startTime = Date.now();
    const res = http.post(`${baseUrl}/api/reports/generate`,
      JSON.stringify({
        type: 'tax_report',
        year: 2023,
        format: 'pdf',
        includeDetails: true
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        timeout: '30s'
      }
    );
    const duration = Date.now() - startTime;

    check(res, {
      'Report generated': (r) => r.status === 200 || r.status === 202,
      'Response time < 15s': (r) => duration < 15000,
      'Report URL provided': (r) => r.json('reportUrl') !== undefined || r.json('jobId') !== undefined
    });

    reportGenerationDuration.add(duration);
    apiErrorRate.add(res.status >= 400);

    // If async, poll for completion
    if (res.status === 202 && res.json('jobId')) {
      let completed = false;
      let pollCount = 0;
      const jobId = res.json('jobId');

      while (!completed && pollCount < 30) {
        sleep(1);
        const pollRes = http.get(`${baseUrl}/api/reports/status/${jobId}`);
        if (pollRes.json('status') === 'completed') {
          completed = true;
          check(pollRes, {
            'Report completed': (r) => r.json('status') === 'completed',
            'Report URL available': (r) => r.json('reportUrl') !== undefined
          });
        }
        pollCount++;
      }
    }
  });
}

// Stripe checkout tests
export function testCheckoutCreation() {
  const baseUrl = TEST_CONFIG.BASE_URL;

  group('Stripe Checkout Creation', () => {
    const startTime = Date.now();
    const res = http.post(`${baseUrl}/api/stripe/create-checkout`,
      JSON.stringify({
        priceId: 'price_test_premium',
        customerEmail: getRandomUser().email,
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel'
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        }
      }
    );
    const duration = Date.now() - startTime;

    check(res, {
      'Checkout session created': (r) => r.status === 200,
      'Session URL provided': (r) => r.json('url') !== undefined,
      'Response time < 1s': (r) => duration < 1000,
      'Session ID present': (r) => r.json('sessionId') !== undefined
    });

    checkoutCreationDuration.add(duration);
    apiErrorRate.add(res.status !== 200);

    if (duration > 1000) {
      console.warn(`Slow checkout creation: ${duration}ms`);
    }
  });
}

// Webhook processing tests
export function testWebhookProcessing() {
  const baseUrl = TEST_CONFIG.BASE_URL;

  group('Stripe Webhook Processing', () => {
    const webhookPayload = {
      id: `evt_test_${Date.now()}_${__VU}_${__ITER}`,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: `cs_test_${Date.now()}`,
          customer_email: getRandomUser().email,
          payment_status: 'paid',
          amount_total: 2900
        }
      }
    };

    const startTime = Date.now();
    const res = http.post(`${baseUrl}/api/stripe/webhook`,
      JSON.stringify(webhookPayload),
      {
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 'test_signature'
        }
      }
    );
    const duration = Date.now() - startTime;

    check(res, {
      'Webhook processed': (r) => r.status === 200,
      'Response time < 2s': (r) => duration < 2000,
      'Idempotent processing': (r) => r.headers['X-Idempotent'] === 'true'
    });

    webhookProcessingDuration.add(duration);
    apiErrorRate.add(res.status !== 200);

    // Test idempotency
    const retryRes = http.post(`${baseUrl}/api/stripe/webhook`,
      JSON.stringify(webhookPayload),
      {
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 'test_signature'
        }
      }
    );

    check(retryRes, {
      'Idempotent retry successful': (r) => r.status === 200,
      'Same response on retry': (r) => r.body === res.body
    });
  });

  sleep(0.5);
}

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    test_type: 'API Endpoint Load Test',
    results: {
      authentication: {
        p95_duration: data.metrics.auth_endpoint_duration?.values?.['p(95)'],
        p99_duration: data.metrics.auth_endpoint_duration?.values?.['p(99)'],
        error_rate: data.metrics.api_errors?.values?.rate
      },
      report_generation: {
        p95_duration: data.metrics.report_generation_duration?.values?.['p(95)'],
        p99_duration: data.metrics.report_generation_duration?.values?.['p(99)']
      },
      checkout_creation: {
        p95_duration: data.metrics.checkout_creation_duration?.values?.['p(95)'],
        p99_duration: data.metrics.checkout_creation_duration?.values?.['p(99)']
      },
      webhook_processing: {
        p95_duration: data.metrics.webhook_processing_duration?.values?.['p(95)'],
        p99_duration: data.metrics.webhook_processing_duration?.values?.['p(99)']
      },
      overall: {
        requests: data.metrics.http_reqs?.values?.count,
        error_rate: data.metrics.http_req_failed?.values?.rate,
        avg_duration: data.metrics.http_req_duration?.values?.avg
      }
    }
  };

  return {
    'stdout': JSON.stringify(summary, null, 2),
    'performance-tests/results/api-load-test.json': JSON.stringify(summary, null, 2)
  };
}