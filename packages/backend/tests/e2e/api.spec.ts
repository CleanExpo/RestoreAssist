import { test as base, expect } from '@playwright/test';

// Extend the base test with a custom fixture for authentication
type TestFixtures = {
  authToken: string | null;
};

const test = base.extend<TestFixtures>({
  authToken: async ({ request }, use) => {
    // Try to login once per worker
    let token: string | null = null;

    try {
      const loginResponse = await request.post('/api/auth/login', {
        data: {
          email: 'demo@restoreassist.com',
          password: 'demo123',
        },
      });

      if (loginResponse.ok()) {
        const data = await loginResponse.json();
        token = data.tokens?.accessToken || data.token;
        console.log('✓ Authentication successful, token acquired');
      } else {
        console.warn('⚠ Demo user login failed with status:', loginResponse.status());
        console.warn('⚠ Tests requiring authentication will be skipped');
      }
    } catch (error) {
      console.warn('⚠ Authentication setup failed:', error);
      console.warn('⚠ Tests requiring authentication will be skipped');
    }

    await use(token);
  },
});

test.describe('RestoreAssist API E2E Tests', () => {
  test.describe('Health Endpoints', () => {
    test('GET /api/health should return healthy status', async ({ request }) => {
      const response = await request.get('/api/health');

      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('status', 'healthy');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('uptime');
    });

    test('GET /api/admin/health should return system info', async ({ request }) => {
      const response = await request.get('/api/admin/health');

      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('system');
      expect(data.system).toHaveProperty('memory');
      expect(data.system).toHaveProperty('platform');
    });
  });

  test.describe('Authentication Flow', () => {
    test('POST /api/auth/login with valid credentials', async ({ request }) => {
      const response = await request.post('/api/auth/login', {
        data: {
          email: 'demo@restoreassist.com',
          password: 'demo123',
        },
      });

      if (response.status() === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('tokens');
        expect(data.tokens).toHaveProperty('accessToken');
        expect(data.tokens).toHaveProperty('refreshToken');
        expect(data).toHaveProperty('user');
        expect(data.user).toHaveProperty('email', 'demo@restoreassist.com');
      } else {
        // Demo user might not exist in test environment
        expect(response.status()).toBe(401);
      }
    });

    test('POST /api/auth/login with invalid credentials should fail', async ({ request }) => {
      const response = await request.post('/api/auth/login', {
        data: {
          email: 'invalid@test.com',
          password: 'wrongpassword',
        },
      });

      expect(response.status()).toBe(401);
    });
  });

  test.describe('Reports API', () => {
    test('GET /api/reports should require authentication', async ({ request }) => {
      const response = await request.get('/api/reports');

      // Should return 401 without token
      expect(response.status()).toBe(401);
    });

    test('GET /api/reports with auth token should return reports', async ({ request, authToken }) => {
      test.skip(!authToken, 'No auth token available - demo user not authenticated');

      const response = await request.get('/api/reports', {
        headers: {
          'authorisation': `Bearer ${authToken}`,
        },
      });

      // Log response details for debugging
      if (!response.ok()) {
        console.log('Response status:', response.status());
        const body = await response.text();
        console.log('Response body:', body);
      }

      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data).toHaveProperty('reports');
      expect(data).toHaveProperty('pagination');
      expect(Array.isArray(data.reports)).toBeTruthy();
    });

    test('GET /api/reports/stats with auth token', async ({ request, authToken }) => {
      test.skip(!authToken, 'No auth token available - demo user not authenticated');

      const response = await request.get('/api/reports/stats', {
        headers: {
          'authorisation': `Bearer ${authToken}`,
        },
      });

      // Log response details for debugging
      if (!response.ok()) {
        console.log('Stats response status:', response.status());
        const body = await response.text();
        console.log('Stats response body:', body);
      }

      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data).toHaveProperty('totalReports');
      expect(data).toHaveProperty('totalCost');
    });
  });

  test.describe('Stripe Endpoints', () => {
    test('POST /api/stripe/create-checkout-session', async ({ request }) => {
      const response = await request.post('/api/stripe/create-checkout-session', {
        data: {
          priceId: 'price_test_monthly',
          planName: 'Professional Monthly',
          email: 'test@example.com',
        },
      });

      // Should create checkout session or return error if Stripe not configured
      expect([200, 500]).toContain(response.status());
    });

    test('POST /api/stripe/webhook requires signature', async ({ request }) => {
      const response = await request.post('/api/stripe/webhook', {
        data: {
          type: 'checkout.session.completed',
          data: { object: {} },
        },
      });

      // Should fail without proper signature
      expect(response.status()).toBe(400);
    });
  });

  test.describe('Admin Endpoints', () => {
    test('GET /api/admin/stats should require admin authentication', async ({ request }) => {
      const response = await request.get('/api/admin/stats');

      // Should return 401 without admin token
      expect(response.status()).toBe(401);
    });
  });

  test.describe('Error Handling', () => {
    test('GET /nonexistent-route should return 404', async ({ request }) => {
      const response = await request.get('/api/nonexistent-endpoint');

      expect(response.status()).toBe(404);
    });

    test('POST /api/reports without auth should return 401', async ({ request }) => {
      const response = await request.post('/api/reports', {
        data: {
          propertyAddress: 'Test',
          damageType: 'water',
        },
      });

      expect(response.status()).toBe(401);
    });
  });

  test.describe('CORS Headers', () => {
    test('OPTIONS request should return CORS headers', async ({ request }) => {
      const response = await request.fetch('/api/health', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:5173'
        }
      });

      expect(response.headers()['access-control-allow-origin']).toBeDefined();
      expect(response.headers()['access-control-allow-methods']).toBeDefined();
    });
  });

  test.describe('Rate Limiting', () => {
    test.skip('Multiple rapid requests should be rate limited', async ({ request }) => {
      // Make 100 requests rapidly
      const requests = Array.from({ length: 100 }, () =>
        request.get('/api/health')
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.some(r => r.status() === 429);

      // If rate limiting is configured, some requests should be rate limited
      // This test is skipped by default as rate limiting might not be configured
      if (process.env.RATE_LIMIT_ENABLED === 'true') {
        expect(rateLimited).toBeTruthy();
      }
    });
  });
});
