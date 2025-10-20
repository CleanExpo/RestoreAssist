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
import { emailService } from '../services/emailService';

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

          // Send checkout confirmation email
          if (session.customer_email) {
            await emailService.sendCheckoutConfirmation({
              email: session.customer_email,
              customerName: session.customer_details?.name || 'Customer',
              planName: session.metadata?.planName || 'Professional',
              subscriptionId: session.subscription as string || 'N/A',
              amount: session.amount_total ? session.amount_total / 100 : 0,
              currency: session.currency?.toUpperCase() || 'AUD',
            }).catch(emailError => {
              console.error('Failed to send checkout confirmation email:', emailError);
              // Don't fail the webhook if email fails
            });
          }
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

            // Send subscription cancellation email
            if (sub.user_id) {
              // Fetch customer email from Stripe
              const customer = await stripe.customers.retrieve(
                typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
              );

              if (!customer.deleted && customer.email) {
                const cancelledAt = new Date().toLocaleDateString('en-AU', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                });

                const accessUntil = sub.current_period_end
                  ? new Date(sub.current_period_end).toLocaleDateString('en-AU', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : cancelledAt;

                await emailService.sendSubscriptionCancelled({
                  email: customer.email,
                  customerName: customer.name || 'Customer',
                  planName: sub.plan_type === 'freeTrial' ? 'Free Trial' :
                           sub.plan_type === 'monthly' ? 'Professional Monthly' :
                           'Professional Yearly',
                  cancelledAt,
                  accessUntil,
                }).catch(emailError => {
                  console.error('Failed to send cancellation email:', emailError);
                  // Don't fail the webhook if email fails
                });
              }
            }
          }
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

              // Send payment receipt email
              if (invoice.customer_email) {
                await emailService.sendPaymentReceipt({
                  email: invoice.customer_email,
                  customerName: invoice.customer_name || 'Customer',
                  planName: sub.plan_type === 'freeTrial' ? 'Free Trial' :
                           sub.plan_type === 'monthly' ? 'Professional Monthly' :
                           'Professional Yearly',
                  amount: invoice.amount_paid ? invoice.amount_paid / 100 : 0,
                  currency: invoice.currency?.toUpperCase() || 'AUD',
                  invoiceNumber: invoice.number || invoice.id,
                  invoiceDate: new Date(invoice.created * 1000).toLocaleDateString('en-AU', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  }),
                }).catch(emailError => {
                  console.error('Failed to send payment receipt email:', emailError);
                  // Don't fail the webhook if email fails
                });
              }
            }
          }
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

              // Send payment failure notification
              if (invoice.customer_email) {
                const retryDate = invoice.next_payment_attempt
                  ? new Date(invoice.next_payment_attempt * 1000).toLocaleDateString('en-AU', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : 'within the next few days';

                await emailService.sendPaymentFailed({
                  email: invoice.customer_email,
                  customerName: invoice.customer_name || 'Customer',
                  amount: invoice.amount_due ? invoice.amount_due / 100 : 0,
                  currency: invoice.currency?.toUpperCase() || 'AUD',
                  retryDate,
                  updatePaymentUrl: `${process.env.BASE_URL}/account/billing`,
                }).catch(emailError => {
                  console.error('Failed to send payment failure email:', emailError);
                  // Don't fail the webhook if email fails
                });
              }
            }
          }
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
