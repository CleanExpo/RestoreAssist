import { db } from '../db/connection';
import Stripe from 'stripe';
import { uuidv4 } from '../utils/uuid';

export interface Subscription {
  subscription_id: string;
  user_id: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  plan_type: 'freeTrial' | 'monthly' | 'yearly';
  status: 'active' | 'cancelled' | 'expired' | 'past_due';
  reports_used: number;
  reports_limit: number | null; // 3 for free trial, NULL for unlimited
  current_period_start?: Date;
  current_period_end?: Date;
  cancel_at_period_end: boolean;
  cancelled_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface SubscriptionHistory {
  history_id?: number;
  subscription_id: string;
  user_id: string;
  event_type: string;
  old_status?: string;
  new_status?: string;
  metadata?: Record<string, any>;
  created_at?: Date;
}

/**
 * Create a new subscription record
 */
export async function createSubscription(params: {
  userId: string;
  planType: 'freeTrial' | 'monthly' | 'yearly';
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
}): Promise<Subscription> {
  const subscriptionId = `sub-${Date.now()}-${uuidv4().substring(0, 8)}`;

  const reportsLimit = params.planType === 'freeTrial' ? 3 : null;

  const subscription: Subscription = {
    subscription_id: subscriptionId,
    user_id: params.userId,
    stripe_customer_id: params.stripeCustomerId,
    stripe_subscription_id: params.stripeSubscriptionId,
    plan_type: params.planType,
    status: 'active',
    reports_used: 0,
    reports_limit: reportsLimit,
    current_period_start: params.currentPeriodStart,
    current_period_end: params.currentPeriodEnd,
    cancel_at_period_end: false,
    created_at: new Date(),
    updated_at: new Date(),
  };

  // Check if PostgreSQL is enabled
  const usePostgres = process.env.USE_POSTGRES === 'true';

  if (usePostgres) {
    try {
      await db.none(
        `INSERT INTO user_subscriptions (
          subscription_id, user_id, stripe_customer_id, stripe_subscription_id,
          plan_type, status, reports_used, reports_limit,
          current_period_start, current_period_end, cancel_at_period_end,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          subscription.subscription_id,
          subscription.user_id,
          subscription.stripe_customer_id,
          subscription.stripe_subscription_id,
          subscription.plan_type,
          subscription.status,
          subscription.reports_used,
          subscription.reports_limit,
          subscription.current_period_start,
          subscription.current_period_end,
          subscription.cancel_at_period_end,
          subscription.created_at,
          subscription.updated_at,
        ]
      );

      // Record in history
      await recordSubscriptionHistory({
        subscription_id: subscriptionId,
        user_id: params.userId,
        event_type: 'created',
        new_status: 'active',
        metadata: { plan_type: params.planType },
      });
    } catch (error) {
      console.error('Failed to create subscription in database:', error);
      throw error;
    }
  }

  return subscription;
}

/**
 * Get active subscription for a user
 */
export async function getActiveSubscription(userId: string): Promise<Subscription | null> {
  const usePostgres = process.env.USE_POSTGRES === 'true';

  if (!usePostgres) {
    return null;
  }

  try {
    const subscription = await db.oneOrNone<Subscription>(
      `SELECT * FROM user_subscriptions
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    return subscription;
  } catch (error) {
    console.error('Failed to get active subscription:', error);
    return null;
  }
}

/**
 * Get subscription by Stripe subscription ID
 */
export async function getSubscriptionByStripeId(
  stripeSubscriptionId: string
): Promise<Subscription | null> {
  const usePostgres = process.env.USE_POSTGRES === 'true';

  if (!usePostgres) {
    return null;
  }

  try {
    const subscription = await db.oneOrNone<Subscription>(
      'SELECT * FROM user_subscriptions WHERE stripe_subscription_id = $1',
      [stripeSubscriptionId]
    );

    return subscription;
  } catch (error) {
    console.error('Failed to get subscription by Stripe ID:', error);
    return null;
  }
}

/**
 * Update subscription status
 */
export async function updateSubscriptionStatus(
  subscriptionId: string,
  status: 'active' | 'cancelled' | 'expired' | 'past_due',
  metadata?: Record<string, any>
): Promise<void> {
  const usePostgres = process.env.USE_POSTGRES === 'true';

  if (!usePostgres) {
    return;
  }

  try {
    // Get old status
    const oldSubscription = await db.oneOrNone<Subscription>(
      'SELECT * FROM user_subscriptions WHERE subscription_id = $1',
      [subscriptionId]
    );

    // Update status
    await db.none(
      `UPDATE user_subscriptions
       SET status = $1, updated_at = NOW()
       WHERE subscription_id = $2`,
      [status, subscriptionId]
    );

    // Record in history
    if (oldSubscription) {
      await recordSubscriptionHistory({
        subscription_id: subscriptionId,
        user_id: oldSubscription.user_id,
        event_type: 'status_updated',
        old_status: oldSubscription.status,
        new_status: status,
        metadata,
      });
    }
  } catch (error) {
    console.error('Failed to update subscription status:', error);
    throw error;
  }
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(
  subscriptionId: string,
  cancelAtPeriodEnd: boolean = true
): Promise<void> {
  const usePostgres = process.env.USE_POSTGRES === 'true';

  if (!usePostgres) {
    return;
  }

  try {
    const status = cancelAtPeriodEnd ? 'active' : 'cancelled';
    const cancelledAt = new Date();

    await db.none(
      `UPDATE user_subscriptions
       SET status = $1, cancel_at_period_end = $2, cancelled_at = $3, updated_at = NOW()
       WHERE subscription_id = $4`,
      [status, cancelAtPeriodEnd, cancelledAt, subscriptionId]
    );

    // Get subscription for history
    const subscription = await db.oneOrNone<Subscription>(
      'SELECT * FROM user_subscriptions WHERE subscription_id = $1',
      [subscriptionId]
    );

    if (subscription) {
      await recordSubscriptionHistory({
        subscription_id: subscriptionId,
        user_id: subscription.user_id,
        event_type: 'cancelled',
        new_status: status,
        metadata: { cancel_at_period_end: cancelAtPeriodEnd },
      });
    }
  } catch (error) {
    console.error('Failed to cancel subscription:', error);
    throw error;
  }
}

/**
 * Increment report usage for a user
 */
export async function incrementReportUsage(userId: string): Promise<void> {
  const usePostgres = process.env.USE_POSTGRES === 'true';

  if (!usePostgres) {
    return;
  }

  try {
    await db.none(
      `UPDATE user_subscriptions
       SET reports_used = reports_used + 1, updated_at = NOW()
       WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );
  } catch (error) {
    console.error('Failed to increment report usage:', error);
    throw error;
  }
}

/**
 * Check if user can generate a report (within limits)
 */
export async function checkReportLimit(userId: string): Promise<{
  allowed: boolean;
  reason?: string;
  subscription?: Subscription;
}> {
  const subscription = await getActiveSubscription(userId);

  if (!subscription) {
    return {
      allowed: false,
      reason: 'No active subscription found',
    };
  }

  // Check if subscription is active
  if (subscription.status !== 'active') {
    return {
      allowed: false,
      reason: `Subscription is ${subscription.status}`,
      subscription,
    };
  }

  // Check report limit (NULL = unlimited)
  if (subscription.reports_limit !== null) {
    if (subscription.reports_used >= subscription.reports_limit) {
      return {
        allowed: false,
        reason: `Report limit reached (${subscription.reports_used}/${subscription.reports_limit})`,
        subscription,
      };
    }
  }

  return {
    allowed: true,
    subscription,
  };
}

/**
 * Record subscription history event
 */
export async function recordSubscriptionHistory(
  history: SubscriptionHistory
): Promise<void> {
  const usePostgres = process.env.USE_POSTGRES === 'true';

  if (!usePostgres) {
    return;
  }

  try {
    await db.none(
      `INSERT INTO subscription_history (
        subscription_id, user_id, event_type, old_status, new_status, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        history.subscription_id,
        history.user_id,
        history.event_type,
        history.old_status,
        history.new_status,
        history.metadata ? JSON.stringify(history.metadata) : null,
      ]
    );
  } catch (error) {
    console.error('Failed to record subscription history:', error);
  }
}

/**
 * Process Stripe checkout session completion
 */
export async function processCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<void> {
  const userId = session.metadata?.userId || session.client_reference_id || '';
  const planType = session.metadata?.planType as 'freeTrial' | 'monthly' | 'yearly';

  if (!userId) {
    throw new Error('No user ID found in checkout session');
  }

  // Create subscription record
  await createSubscription({
    userId,
    planType,
    stripeCustomerId: session.customer as string,
    stripeSubscriptionId: session.subscription as string,
    currentPeriodStart: new Date(),
    currentPeriodEnd: session.metadata?.periodEnd
      ? new Date(session.metadata.periodEnd)
      : undefined,
  });

  console.log(`✅ Subscription created for user ${userId} with plan ${planType}`);
}

/**
 * Process Stripe subscription update
 */
export async function processSubscriptionUpdate(
  stripeSubscription: Stripe.Subscription
): Promise<void> {
  const subscription = await getSubscriptionByStripeId(stripeSubscription.id);

  if (!subscription) {
    console.error('Subscription not found for Stripe subscription:', stripeSubscription.id);
    return;
  }

  const newStatus = mapStripeStatus(stripeSubscription.status);

  // Type assertion to access current_period_end (exists in API but may not be in types)
  const periodEnd = (stripeSubscription as any).current_period_end;

  await updateSubscriptionStatus(subscription.subscription_id, newStatus, {
    stripe_status: stripeSubscription.status,
    current_period_end: periodEnd ? new Date(periodEnd * 1000) : undefined,
  });

  console.log(`✅ Subscription ${subscription.subscription_id} updated to ${newStatus}`);
}

/**
 * Map Stripe subscription status to our status
 */
function mapStripeStatus(
  stripeStatus: Stripe.Subscription.Status
): 'active' | 'cancelled' | 'expired' | 'past_due' {
  switch (stripeStatus) {
    case 'active':
      return 'active';
    case 'canceled': // Stripe uses American spelling
      return 'cancelled'; // We use British spelling internally
    case 'past_due':
      return 'past_due';
    case 'unpaid':
    case 'incomplete':
    case 'incomplete_expired':
    case 'trialing':
    default:
      return 'expired';
  }
}
