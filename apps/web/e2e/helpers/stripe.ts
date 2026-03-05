/**
 * Stripe test helpers — generate mock webhook event payloads
 * for testing the /api/webhooks/stripe endpoint without live Stripe.
 */

interface CheckoutCompletedOverrides {
  sessionId?: string
  customerId?: string
  subscriptionId?: string
  userId?: string
  customerEmail?: string
  mode?: 'subscription' | 'payment'
  metadataType?: string
  amountTotal?: number
}

interface SubscriptionDeletedOverrides {
  subscriptionId?: string
  customerId?: string
  endedAt?: number
  currentPeriodEnd?: number
}

interface SubscriptionUpdatedOverrides {
  subscriptionId?: string
  customerId?: string
  status?: string
  currentPeriodEnd?: number
}

interface InvoicePaymentFailedOverrides {
  invoiceId?: string
  subscriptionId?: string
  customerId?: string
  amountDue?: number
  currency?: string
}

/**
 * Create a mock `checkout.session.completed` webhook event payload.
 * Matches the shape expected by POST /api/webhooks/stripe.
 */
export function createCheckoutCompletedEvent(overrides: CheckoutCompletedOverrides = {}) {
  const now = Math.floor(Date.now() / 1000)
  return {
    id: `evt_test_${Date.now()}`,
    object: 'event',
    type: 'checkout.session.completed',
    created: now,
    data: {
      object: {
        id: overrides.sessionId ?? `cs_test_${Date.now()}`,
        object: 'checkout.session',
        mode: overrides.mode ?? 'subscription',
        payment_status: 'paid',
        customer: overrides.customerId ?? 'cus_test_123',
        customer_email: overrides.customerEmail ?? 'test@restoreassist.com',
        subscription: overrides.subscriptionId ?? 'sub_test_123',
        amount_total: overrides.amountTotal ?? 9900,
        metadata: {
          userId: overrides.userId ?? 'test-user-id',
          ...(overrides.metadataType ? { type: overrides.metadataType } : {}),
        },
      },
    },
  }
}

/**
 * Create a mock `customer.subscription.deleted` webhook event payload.
 */
export function createSubscriptionDeletedEvent(overrides: SubscriptionDeletedOverrides = {}) {
  const now = Math.floor(Date.now() / 1000)
  return {
    id: `evt_test_del_${Date.now()}`,
    object: 'event',
    type: 'customer.subscription.deleted',
    created: now,
    data: {
      object: {
        id: overrides.subscriptionId ?? 'sub_test_123',
        object: 'subscription',
        customer: overrides.customerId ?? 'cus_test_123',
        status: 'canceled',
        ended_at: overrides.endedAt ?? now,
        current_period_end: overrides.currentPeriodEnd ?? now + 30 * 86400,
        items: {
          data: [
            {
              price: {
                recurring: { interval: 'month' },
              },
            },
          ],
        },
      },
    },
  }
}

/**
 * Create a mock `customer.subscription.updated` webhook event payload.
 */
export function createSubscriptionUpdatedEvent(overrides: SubscriptionUpdatedOverrides = {}) {
  const now = Math.floor(Date.now() / 1000)
  return {
    id: `evt_test_upd_${Date.now()}`,
    object: 'event',
    type: 'customer.subscription.updated',
    created: now,
    data: {
      object: {
        id: overrides.subscriptionId ?? 'sub_test_123',
        object: 'subscription',
        customer: overrides.customerId ?? 'cus_test_123',
        status: overrides.status ?? 'active',
        current_period_end: overrides.currentPeriodEnd ?? now + 30 * 86400,
        items: {
          data: [
            {
              price: {
                recurring: { interval: 'month' },
              },
            },
          ],
        },
      },
    },
  }
}

/**
 * Create a mock `invoice.payment_failed` webhook event payload.
 */
export function createInvoicePaymentFailedEvent(overrides: InvoicePaymentFailedOverrides = {}) {
  const now = Math.floor(Date.now() / 1000)
  return {
    id: `evt_test_fail_${Date.now()}`,
    object: 'event',
    type: 'invoice.payment_failed',
    created: now,
    data: {
      object: {
        id: overrides.invoiceId ?? `in_test_${Date.now()}`,
        object: 'invoice',
        subscription: overrides.subscriptionId ?? 'sub_test_123',
        customer: overrides.customerId ?? 'cus_test_123',
        amount_due: overrides.amountDue ?? 9900,
        currency: overrides.currency ?? 'aud',
        period_end: now + 30 * 86400,
        charge: null,
        last_finalization_error: null,
      },
    },
  }
}
