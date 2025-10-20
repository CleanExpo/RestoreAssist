import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import {
  getActiveSubscription,
  cancelSubscription,
} from '../services/subscriptionService';

const router = Router();

/**
 * Get current user's subscription
 * GET /api/subscription/me
 */
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const subscription = await getActiveSubscription(userId);

    if (!subscription) {
      return res.status(404).json({
        error: 'No active subscription found',
        message: 'User does not have an active subscription',
      });
    }

    res.json({ subscription });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({
      error: 'Failed to fetch subscription',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Cancel user's subscription
 * POST /api/subscription/cancel
 */
router.post('/cancel', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { cancelAtPeriodEnd = true } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const subscription = await getActiveSubscription(userId);

    if (!subscription) {
      return res.status(404).json({
        error: 'No active subscription found',
        message: 'User does not have an active subscription',
      });
    }

    if (subscription.plan_type === 'freeTrial') {
      return res.status(400).json({
        error: 'Cannot cancel free trial',
        message: 'Free trial subscriptions cannot be cancelled',
      });
    }

    await cancelSubscription(subscription.subscription_id, cancelAtPeriodEnd);

    res.json({
      message: 'Subscription cancelled successfully',
      cancelAtPeriodEnd,
    });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({
      error: 'Failed to cancel subscription',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
