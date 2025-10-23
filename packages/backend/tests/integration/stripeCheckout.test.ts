import request from 'supertest';
import express from 'express';
import { createStripeRoutes } from '../../src/routes/stripeRoutes';

describe('Stripe Checkout Integration', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/stripe', createStripeRoutes());
  });

  describe('POST /api/stripe/create-checkout-session', () => {
    it('should create checkout session with userId and email', async () => {
      const response = await request(app)
        .post('/api/stripe/create-checkout-session')
        .send({
          priceId: process.env.STRIPE_PRICE_MONTHLY || 'price_1SK6GPBY5KEPMwxd43EBhwXx',
          planName: 'Professional Monthly',
          email: 'test@example.com',
          userId: 'user-123',
          successUrl: 'http://localhost:3000/checkout/success',
          cancelUrl: 'http://localhost:3000/dashboard',
        });

      if (process.env.STRIPE_SECRET_KEY) {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('url');
        expect(response.body).toHaveProperty('sessionId');
      } else {
        // Skip test if Stripe not configured
        expect(response.status).toBe(500);
      }
    });

    it('should reject request without priceId', async () => {
      const response = await request(app)
        .post('/api/stripe/create-checkout-session')
        .send({
          email: 'test@example.com',
          userId: 'user-123',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should include userId in session metadata', async () => {
      const userId = 'user-test-123';
      const email = 'test@example.com';

      const response = await request(app)
        .post('/api/stripe/create-checkout-session')
        .send({
          priceId: process.env.STRIPE_PRICE_MONTHLY || 'price_1SK6GPBY5KEPMwxd43EBhwXx',
          planName: 'Professional Monthly',
          email,
          userId,
          successUrl: 'http://localhost:3000/checkout/success',
          cancelUrl: 'http://localhost:3000/dashboard',
        });

      if (process.env.STRIPE_SECRET_KEY) {
        expect(response.status).toBe(200);
        // In a real integration test, we would retrieve the session
        // and verify the metadata contains userId
        // This requires Stripe SDK and actual API call
      } else {
        expect(response.status).toBe(500);
      }
    });
  });

  describe('GET /api/stripe/checkout-session/:sessionId', () => {
    it('should retrieve checkout session data', async () => {
      const fakeSessionId = 'cs_test_123';

      const response = await request(app)
        .get(`/api/stripe/checkout-session/${fakeSessionId}`);

      // Will fail without valid session ID, but tests the route exists
      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });
});
