// @ts-nocheck - Disable type checking for test mocks
import { describe, it, expect, beforeAll, afterAll, jest, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Mock Stripe BEFORE importing anything that uses it
const mockStripeConstructor = jest.fn<any>();
const mockCheckoutSessionsCreate = jest.fn<() => Promise<any>>();
const mockCheckoutSessionsRetrieve = jest.fn<() => Promise<any>>();
const mockCustomersRetrieve = jest.fn<() => Promise<any>>();
const mockWebhooksConstructEvent = jest.fn<any>();

// Mock the Stripe module
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: mockCheckoutSessionsCreate,
        retrieve: mockCheckoutSessionsRetrieve,
      },
    },
    customers: {
      retrieve: mockCustomersRetrieve,
    },
    webhooks: {
      constructEvent: mockWebhooksConstructEvent,
    },
  }));
});

// Mock Stripe config
jest.mock('../../src/config/stripe', () => ({
  STRIPE_CONFIG: {
    secretKey: 'sk_test_mock_key',
    prices: {
      freeTrial: 'price_test_trial',
      monthly: 'price_test_monthly',
      yearly: 'price_test_yearly',
    },
  },
}));

// Mock Sentry
jest.mock('@sentry/node', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

// Set default implementation for webhook verification
mockWebhooksConstructEvent.mockImplementation((payload: any, sig: any, secret: any) => {
  // Parse and return the event from payload
  if (typeof payload === 'string') {
    return JSON.parse(payload);
  }
  return payload;
});

// Create mock functions for subscription service
const mockProcessCheckoutSession = jest.fn().mockResolvedValue(undefined);
const mockProcessSubscriptionUpdate = jest.fn().mockResolvedValue(undefined);
const mockUpdateSubscriptionStatus = jest.fn().mockResolvedValue(undefined);
const mockRecordSubscriptionHistory = jest.fn().mockResolvedValue(undefined);
const mockGetSubscriptionByStripeId = jest.fn().mockResolvedValue({
  subscription_id: 'sub-123',
  user_id: 'user-123',
  status: 'active',
  plan_type: 'monthly',
  current_period_end: new Date(),
});

// Create mock functions for email service
const mockEmailService = {
  sendCheckoutConfirmation: jest.fn().mockResolvedValue(true),
  sendSubscriptionCancelled: jest.fn().mockResolvedValue(true),
  sendPaymentReceipt: jest.fn().mockResolvedValue(true),
  sendPaymentFailed: jest.fn().mockResolvedValue(true),
};

// Now import stripeRoutes factory - it will use our mocked Stripe and Sentry
import { createStripeRoutes } from '../../src/routes/stripeRoutes';

describe('Stripe Webhooks Integration', () => {
  let app: express.Application;

  beforeAll(() => {
    // Set up webhook secret BEFORE creating routes (closure captures this value)
    process.env.STRIPE_WEBHOOK_SECRET = 'test_webhook_secret';

    // Create subscription service mock object implementing ISubscriptionService
    const mockSubscriptionService = {
      processCheckoutSession: mockProcessCheckoutSession,
      processSubscriptionUpdate: mockProcessSubscriptionUpdate,
      updateSubscriptionStatus: mockUpdateSubscriptionStatus,
      recordSubscriptionHistory: mockRecordSubscriptionHistory,
      getSubscriptionByStripeId: mockGetSubscriptionByStripeId,
    } as any;

    // Setup Express app with stripe routes using dependency injection
    app = express();
    app.use(express.json());
    app.use(express.raw({ type: 'application/json' }));
    app.use('/api/stripe', createStripeRoutes({
      subscriptionService: mockSubscriptionService,
      emailService: mockEmailService as any,
    }));
  });

  beforeEach(() => {
    // Clear mock call history but preserve implementations
    mockProcessCheckoutSession.mockClear();
    mockProcessSubscriptionUpdate.mockClear();
    mockUpdateSubscriptionStatus.mockClear();
    mockRecordSubscriptionHistory.mockClear();
    mockGetSubscriptionByStripeId.mockClear();
    mockWebhooksConstructEvent.mockClear();
    mockCheckoutSessionsCreate.mockClear();
    mockCheckoutSessionsRetrieve.mockClear();
    mockCustomersRetrieve.mockClear();

    // Clear email service mocks
    mockEmailService.sendCheckoutConfirmation.mockClear();
    mockEmailService.sendSubscriptionCancelled.mockClear();
    mockEmailService.sendPaymentReceipt.mockClear();
    mockEmailService.sendPaymentFailed.mockClear();

    // Restore webhook verification implementation after clearing
    mockWebhooksConstructEvent.mockImplementation((payload: any, sig: any, secret: any) => {
      // Parse and return the event from payload
      if (typeof payload === 'string') {
        return JSON.parse(payload);
      }
      return payload;
    });

    // Ensure webhook secret is set for all tests (some tests may delete it)
    process.env.STRIPE_WEBHOOK_SECRET = 'test_webhook_secret';
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/stripe/webhook', () => {
    it('should handle checkout.session.completed event', async () => {
      const mockEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            customer: 'cus_123',
            customer_email: 'test@example.com',
            customer_details: {
              name: 'Test User',
            },
            amount_total: 2999,
            currency: 'aud',
            subscription: 'sub_123',
            metadata: {
              userId: 'user-test-123',
              planType: 'monthly',
              planName: 'Professional Monthly',
            },
          },
        },
      };

      const response = await request(app)
        .post('/api/stripe/webhook')
        .set('stripe-signature', 'test_signature')
        .send(JSON.stringify(mockEvent));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
      expect(mockProcessCheckoutSession).toHaveBeenCalled();
    });

    it('should handle customer.subscription.deleted event', async () => {
      const mockEvent = {
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_stripe_123',
            customer: 'cus_123',
            current_period_end: Math.floor(Date.now() / 1000) + 86400,
          },
        },
      };

      // Mock Stripe customer retrieval
      mockCustomersRetrieve.mockResolvedValue({
        id: 'cus_123',
        email: 'test@example.com',
        name: 'Test User',
        deleted: false,
      });

      const response = await request(app)
        .post('/api/stripe/webhook')
        .set('stripe-signature', 'test_signature')
        .send(JSON.stringify(mockEvent));

      expect(response.status).toBe(200);
      expect(mockUpdateSubscriptionStatus).toHaveBeenCalledWith(
        'sub-123',
        'cancelled',
        expect.objectContaining({
          cancelled_by: 'stripe_webhook',
          reason: 'subscription_deleted',
        })
      );
    });

    it('should handle invoice.payment_succeeded event', async () => {
      const mockEvent = {
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'in_123',
            customer_email: 'test@example.com',
            customer_name: 'Test User',
            subscription: 'sub_stripe_123',
            amount_paid: 2999,
            currency: 'aud',
            number: 'INV-2025-001',
            created: Math.floor(Date.now() / 1000),
            period_end: Math.floor(Date.now() / 1000) + 2592000,
          },
        },
      };

      const response = await request(app)
        .post('/api/stripe/webhook')
        .set('stripe-signature', 'test_signature')
        .send(JSON.stringify(mockEvent));

      expect(response.status).toBe(200);
      expect(mockRecordSubscriptionHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'payment_succeeded',
          metadata: expect.objectContaining({
            invoice_id: 'in_123',
            amount: 2999,
          }),
        })
      );
    });

    it('should handle invoice.payment_failed event', async () => {
      const mockEvent = {
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_123',
            customer_email: 'test@example.com',
            customer_name: 'Test User',
            subscription: 'sub_stripe_123',
            amount_due: 2999,
            currency: 'aud',
            attempt_count: 1,
            next_payment_attempt: Math.floor(Date.now() / 1000) + 86400,
          },
        },
      };

      const response = await request(app)
        .post('/api/stripe/webhook')
        .set('stripe-signature', 'test_signature')
        .send(JSON.stringify(mockEvent));

      expect(response.status).toBe(200);
      expect(mockUpdateSubscriptionStatus).toHaveBeenCalledWith(
        'sub-123',
        'past_due',
        expect.any(Object)
      );
    });

    it('should return 400 when webhook secret is missing', async () => {
      // Temporarily remove webhook secret
      const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
      delete process.env.STRIPE_WEBHOOK_SECRET;

      const response = await request(app)
        .post('/api/stripe/webhook')
        .set('stripe-signature', 'test_signature')
        .send(JSON.stringify({ type: 'test.event' }));

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Webhook secret not configured');

      // Restore secret
      process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
    });

    it('should return 400 when signature verification fails', async () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'test_secret';

      // Mock constructEvent to throw error
      mockWebhooksConstructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const response = await request(app)
        .post('/api/stripe/webhook')
        .set('stripe-signature', 'invalid_signature')
        .send(JSON.stringify({ type: 'test.event' }));

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Webhook error');
    });

    it('should handle unhandled event types gracefully', async () => {
      const mockEvent = {
        type: 'unhandled.event.type',
        data: {
          object: { id: 'test' },
        },
      };

      const response = await request(app)
        .post('/api/stripe/webhook')
        .set('stripe-signature', 'test_signature')
        .send(JSON.stringify(mockEvent));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    });
  });

  describe('POST /api/stripe/create-checkout-session', () => {
    it('should create a checkout session', async () => {
      mockCheckoutSessionsCreate.mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/pay/cs_test_123',
      });

      const response = await request(app)
        .post('/api/stripe/create-checkout-session')
        .send({
          priceId: 'price_test_monthly',
          planName: 'Professional Monthly',
          email: 'test@example.com',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('url');
      expect(response.body).toHaveProperty('sessionId');
    });

    it('should return 400 when priceId is missing', async () => {
      const response = await request(app)
        .post('/api/stripe/create-checkout-session')
        .send({
          planName: 'Professional Monthly',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Price ID is required');
    });
  });

  describe('GET /api/stripe/checkout-session/:sessionId', () => {
    it('should retrieve a checkout session', async () => {
      mockCheckoutSessionsRetrieve.mockResolvedValue({
        id: 'cs_test_123',
        status: 'complete',
        customer_email: 'test@example.com',
        amount_total: 2999,
        currency: 'aud',
        metadata: {
          planName: 'Professional Monthly',
        },
      });

      const response = await request(app)
        .get('/api/stripe/checkout-session/cs_test_123');

      expect(response.status).toBe(200);
      expect(response.body.session).toHaveProperty('id', 'cs_test_123');
      expect(response.body.session).toHaveProperty('status', 'complete');
    });

    it('should handle errors when session not found', async () => {
      mockCheckoutSessionsRetrieve.mockRejectedValue(new Error('No such session'));

      const response = await request(app)
        .get('/api/stripe/checkout-session/invalid_session');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to retrieve checkout session');
    });
  });
});
