import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  createSubscription,
  getActiveSubscription,
  updateSubscriptionStatus,
  recordSubscriptionHistory,
} from '../../src/services/subscriptionService';

// Mock database connection
jest.mock('../../src/db/connection', () => ({
  db: {
    none: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    one: jest.fn<() => Promise<any>>(),
    oneOrNone: jest.fn<() => Promise<any>>(),
    many: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  },
}));

describe('Subscription Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment to use in-memory storage
    process.env.USE_POSTGRES = 'false';
  });

  describe('createSubscription', () => {
    it('should create a free trial subscription', async () => {
      const subscription = await createSubscription({
        userId: 'user-123',
        planType: 'freeTrial',
      });

      expect(subscription).toMatchObject({
        user_id: 'user-123',
        plan_type: 'freeTrial',
        status: 'active',
        reports_used: 0,
        reports_limit: 3, // Free trial has 3 reports
        cancel_at_period_end: false,
      });

      expect(subscription.subscription_id).toMatch(/^sub-\d+-/);
    });

    it('should create a monthly subscription with unlimited reports', async () => {
      const subscription = await createSubscription({
        userId: 'user-456',
        planType: 'monthly',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_stripe_123',
        currentPeriodStart: new Date('2025-01-01'),
        currentPeriodEnd: new Date('2025-02-01'),
      });

      expect(subscription).toMatchObject({
        user_id: 'user-456',
        plan_type: 'monthly',
        status: 'active',
        reports_used: 0,
        reports_limit: null, // Unlimited
        stripe_customer_id: 'cus_123',
        stripe_subscription_id: 'sub_stripe_123',
      });
    });

    it('should create a yearly subscription', async () => {
      const subscription = await createSubscription({
        userId: 'user-789',
        planType: 'yearly',
        stripeCustomerId: 'cus_456',
        stripeSubscriptionId: 'sub_stripe_456',
      });

      expect(subscription.plan_type).toBe('yearly');
      expect(subscription.reports_limit).toBeNull(); // Unlimited
    });

    it('should throw error with invalid plan type', async () => {
      await expect(
        createSubscription({
          userId: 'user-123',
          planType: 'invalid' as any,
        })
      ).rejects.toThrow('Invalid plan type: "invalid". Must be one of: freeTrial, monthly, yearly');
    });
  });

  describe('getActiveSubscription', () => {
    it('should return null when USE_POSTGRES is false', async () => {
      const subscription = await getActiveSubscription('user-123');
      expect(subscription).toBeNull();
    });

    it('should return active subscription when exists', async () => {
      process.env.USE_POSTGRES = 'true';
      const { db } = require('../../src/db/connection');

      const mockSubscription = {
        subscription_id: 'sub-123',
        user_id: 'user-123',
        status: 'active',
        plan_type: 'monthly',
      };

      db.oneOrNone.mockResolvedValueOnce(mockSubscription);

      const subscription = await getActiveSubscription('user-123');
      expect(subscription).toEqual(mockSubscription);
    });
  });

  describe('updateSubscriptionStatus', () => {
    it('should update subscription status', async () => {
      process.env.USE_POSTGRES = 'true';
      const { db } = require('../../src/db/connection');

      await updateSubscriptionStatus('sub-123', 'cancelled', {
        cancelled_by: 'user',
        reason: 'user_request',
      });

      expect(db.none).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_subscriptions'),
        expect.arrayContaining(['cancelled', 'sub-123'])
      );
    });

    it('should handle past_due status', async () => {
      process.env.USE_POSTGRES = 'true';
      const { db } = require('../../src/db/connection');

      await updateSubscriptionStatus('sub-456', 'past_due', {
        invoice_id: 'inv_123',
      });

      expect(db.none).toHaveBeenCalled();
    });
  });

  describe('recordSubscriptionHistory', () => {
    it('should record subscription creation event', async () => {
      process.env.USE_POSTGRES = 'true';
      const { db } = require('../../src/db/connection');

      await recordSubscriptionHistory({
        subscription_id: 'sub-123',
        user_id: 'user-123',
        event_type: 'created',
        new_status: 'active',
        metadata: { plan_type: 'monthly' },
      });

      expect(db.none).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO subscription_history'),
        expect.arrayContaining(['sub-123', 'user-123', 'created'])
      );
    });

    it('should record status change event', async () => {
      process.env.USE_POSTGRES = 'true';
      const { db } = require('../../src/db/connection');

      await recordSubscriptionHistory({
        subscription_id: 'sub-123',
        user_id: 'user-123',
        event_type: 'status_changed',
        old_status: 'active',
        new_status: 'cancelled',
        metadata: { reason: 'user_request' },
      });

      expect(db.none).toHaveBeenCalled();
    });

    it('should record payment events', async () => {
      process.env.USE_POSTGRES = 'true';
      const { db } = require('../../src/db/connection');

      await recordSubscriptionHistory({
        subscription_id: 'sub-123',
        user_id: 'user-123',
        event_type: 'payment_succeeded',
        metadata: {
          invoice_id: 'inv_123',
          amount: 2999,
          currency: 'aud',
        },
      });

      expect(db.none).toHaveBeenCalled();
    });
  });

  describe('Subscription lifecycle', () => {
    it('should handle full subscription lifecycle', async () => {
      // 1. Create subscription
      const subscription = await createSubscription({
        userId: 'user-lifecycle',
        planType: 'monthly',
        stripeCustomerId: 'cus_test',
        stripeSubscriptionId: 'sub_test',
      });

      expect(subscription.status).toBe('active');
      expect(subscription.reports_used).toBe(0);

      // 2. Mark as past_due (would normally be in database)
      // This tests the status update logic
      process.env.USE_POSTGRES = 'true';
      const { db } = require('../../src/db/connection');

      await updateSubscriptionStatus(subscription.subscription_id, 'past_due', {
        invoice_id: 'inv_test',
      });

      expect(db.none).toHaveBeenCalled();

      // 3. Cancel subscription
      await updateSubscriptionStatus(subscription.subscription_id, 'cancelled', {
        cancelled_by: 'user',
      });

      expect(db.none).toHaveBeenCalled();
    });
  });
});
