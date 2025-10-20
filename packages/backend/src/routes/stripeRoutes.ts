import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import * as Sentry from '@sentry/node';
import { STRIPE_CONFIG } from '../config/stripe';
import {
  processCheckoutSession,
  processSubscriptionUpdate,
  updateSubscriptionStatus,
  recordSubscriptionHistory,
  getSubscriptionByStripeId,
} from '../services/subscriptionService';

const router = Router();

// Initialise Stripe
const stripe = new Stripe(STRIPE_CONFIG.secretKey, {
  apiVersion: '2025-09-30.clover',
});

/**
 * Create Stripe Checkout Session
 * POST /api/stripe/create-checkout-session
 */
router.post('/create-checkout-session', async (req: Request, res: Response) => {
  try {
    const { priceId, planName, successUrl, cancelUrl } = req.body;

    if (!priceId) {
      return res.status(400).json({ error: 'Price ID is required' });
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: priceId === STRIPE_CONFIG.prices.freeTrial ? 'payment' : 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl || `${process.env.BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.BASE_URL}/pricing`,
      metadata: {
        planName: planName || 'Unknown',
      },
      // Allow promotion codes
      allow_promotion_codes: true,
      // Billing address collection
      billing_address_collection: 'required',
      // Customer email
      customer_email: req.body.email || undefined,
    });

    res.json({
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({
      error: 'Failed to create checkout session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get Checkout Session
 * GET /api/stripe/checkout-session/:sessionId
 */
router.get('/checkout-session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    res.json({
      session: {
        id: session.id,
        status: session.status,
        customerEmail: session.customer_email,
        amountTotal: session.amount_total,
        currency: session.currency,
        metadata: session.metadata,
      },
    });
  } catch (error) {
    console.error('Error retrieving checkout session:', error);
    res.status(500).json({
      error: 'Failed to retrieve checkout session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Stripe Webhook Handler
 * POST /api/stripe/webhook
 */
router.post('/webhook', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  if (!webhookSecret) {
    console.warn('Stripe webhook secret not configured');
    return res.status(400).json({ error: 'Webhook secret not configured' });
  }

  try {
    // Verify webhook signature
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      webhookSecret
    );

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('Checkout session completed:', session.id);

        // Add Sentry breadcrumb
        Sentry.addBreadcrumb({
          category: 'stripe.webhook',
          message: 'Processing checkout session',
          level: 'info',
          data: {
            sessionId: session.id,
            customerId: session.customer,
            subscriptionId: session.subscription,
          },
        });

        try {
          // Process checkout and create subscription
          await processCheckoutSession(session);
          console.log('✅ Subscription created successfully');

          // TODO: Send confirmation email
          // TODO: Trigger welcome workflow
        } catch (error) {
          console.error('Failed to process checkout session:', error);

          // Track critical error in Sentry
          Sentry.captureException(error, {
            tags: {
              'stripe.event': 'checkout.session.completed',
              'stripe.session_id': session.id,
            },
            contexts: {
              stripe: {
                sessionId: session.id,
                customerId: session.customer,
                subscriptionId: session.subscription,
                paymentStatus: session.payment_status,
              },
            },
            level: 'error',
          });
        }

        break;
      }

      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('Subscription created:', subscription.id);

        try {
          // Update subscription status if already exists
          await processSubscriptionUpdate(subscription);
          console.log('✅ Subscription status updated');
        } catch (error) {
          console.error('Failed to process subscription creation:', error);
        }

        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('Subscription updated:', subscription.id);

        try {
          // Update subscription status and details
          await processSubscriptionUpdate(subscription);
          console.log('✅ Subscription updated successfully');
        } catch (error) {
          console.error('Failed to process subscription update:', error);
        }

        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('Subscription cancelled:', subscription.id);

        try {
          // Find and cancel the subscription
          const sub = await getSubscriptionByStripeId(subscription.id);
          if (sub) {
            await updateSubscriptionStatus(sub.subscription_id, 'cancelled', {
              cancelled_by: 'stripe_webhook',
              reason: 'subscription_deleted',
            });
            console.log('✅ Subscription cancelled successfully');
          }

          // TODO: Send cancellation email
        } catch (error) {
          console.error('Failed to process subscription deletion:', error);
        }

        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice & {
          subscription?: string | Stripe.Subscription;
        };
        console.log('Invoice payment succeeded:', invoice.id);

        try {
          // Get subscription and record payment success
          const subscriptionId = typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id;

          if (subscriptionId) {
            const sub = await getSubscriptionByStripeId(subscriptionId);
            if (sub) {
              await recordSubscriptionHistory({
                subscription_id: sub.subscription_id,
                user_id: sub.user_id,
                event_type: 'payment_succeeded',
                metadata: {
                  invoice_id: invoice.id,
                  amount: invoice.amount_paid,
                  currency: invoice.currency,
                },
              });
              console.log('✅ Payment recorded successfully');
            }
          }

          // TODO: Send receipt email
        } catch (error) {
          console.error('Failed to process payment success:', error);
        }

        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice & {
          subscription?: string | Stripe.Subscription;
        };
        console.log('Invoice payment failed:', invoice.id);

        try {
          // Get subscription and mark as past_due
          const subscriptionId = typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id;

          if (subscriptionId) {
            const sub = await getSubscriptionByStripeId(subscriptionId);
            if (sub) {
              await updateSubscriptionStatus(sub.subscription_id, 'past_due', {
                invoice_id: invoice.id,
                attempt_count: invoice.attempt_count,
              });

              await recordSubscriptionHistory({
                subscription_id: sub.subscription_id,
                user_id: sub.user_id,
                event_type: 'payment_failed',
                old_status: sub.status,
                new_status: 'past_due',
                metadata: {
                  invoice_id: invoice.id,
                  amount: invoice.amount_due,
                },
              });
              console.log('✅ Subscription marked as past_due');
            }
          }

          // TODO: Send payment failure notification
        } catch (error) {
          console.error('Failed to process payment failure:', error);
        }

        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).json({
      error: 'Webhook error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
