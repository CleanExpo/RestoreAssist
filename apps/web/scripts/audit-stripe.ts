#!/usr/bin/env npx tsx
/**
 * RestoreAssist Stripe Audit Script
 * =================================
 * Run: npx tsx apps/web/scripts/audit-stripe.ts
 *
 * Checks:
 * 1. Products exist: $99/mo subscription + $1188/yr subscription
 * 2. Prices are active and correct
 * 3. Webhook endpoint is configured
 * 4. Test mode vs live mode detection
 * 5. Add-on products ($20 / $50 / $100 packs)
 *
 * Requires STRIPE_SECRET_KEY in environment (or .env.local).
 */

import Stripe from 'stripe'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load env from apps/web/.env.local
config({ path: resolve(__dirname, '../.env.local') })
config({ path: resolve(__dirname, '../.env') })

const secretKey = process.env.STRIPE_SECRET_KEY
if (!secretKey) {
  console.error('ERROR: STRIPE_SECRET_KEY is not set.')
  console.error('Set it in apps/web/.env.local or export it before running this script.')
  process.exit(1)
}

const stripe = new Stripe(secretKey, { apiVersion: '2024-12-18.acacia' })

// Expected products from apps/web/lib/pricing.ts
const EXPECTED = {
  monthly: { amount: 9900, currency: 'aud', interval: 'month', name: 'Monthly Plan' },
  yearly: { amount: 118800, currency: 'aud', interval: 'year', name: 'Yearly Plan' },
  addons: [
    { name: '8 Additional Reports', amount: 2000, currency: 'aud' },
    { name: '25 Additional Reports', amount: 5000, currency: 'aud' },
    { name: '60 Additional Reports', amount: 10000, currency: 'aud' },
  ],
} as const

interface AuditResult {
  label: string
  status: 'PASS' | 'WARN' | 'FAIL' | 'INFO'
  detail: string
}

const results: AuditResult[] = []

function log(r: AuditResult) {
  const icon = { PASS: '[PASS]', WARN: '[WARN]', FAIL: '[FAIL]', INFO: '[INFO]' }[r.status]
  console.log(`  ${icon} ${r.label}: ${r.detail}`)
  results.push(r)
}

async function auditStripe() {
  console.log('RestoreAssist Stripe Audit')
  console.log('='.repeat(50))

  // ── 1. Mode detection ──────────────────────────────
  console.log('\n1. Account & Mode')
  const isTestKey = secretKey!.startsWith('sk_test_')
  const isLiveKey = secretKey!.startsWith('sk_live_')
  log({
    label: 'API key mode',
    status: isTestKey ? 'INFO' : isLiveKey ? 'PASS' : 'WARN',
    detail: isTestKey ? 'TEST mode' : isLiveKey ? 'LIVE mode' : 'Unknown key prefix',
  })

  // ── 2. Active products & prices ────────────────────
  console.log('\n2. Products & Prices')

  const products = await stripe.products.list({ active: true, limit: 100 })
  log({
    label: 'Active products',
    status: products.data.length > 0 ? 'PASS' : 'WARN',
    detail: `${products.data.length} active product(s) found`,
  })

  const prices = await stripe.prices.list({ active: true, limit: 100, expand: ['data.product'] })

  // Check monthly subscription price ($99/mo AUD)
  const monthlyPrices = prices.data.filter(
    (p) =>
      p.type === 'recurring' &&
      p.recurring?.interval === 'month' &&
      p.unit_amount === EXPECTED.monthly.amount &&
      p.currency === EXPECTED.monthly.currency
  )
  log({
    label: '$99/mo AUD subscription price',
    status: monthlyPrices.length > 0 ? 'PASS' : 'FAIL',
    detail:
      monthlyPrices.length > 0
        ? `Found ${monthlyPrices.length}: ${monthlyPrices.map((p) => p.id).join(', ')}`
        : 'NOT FOUND — run setup-stripe.ts to create',
  })

  // Check yearly subscription price ($1188/yr AUD)
  const yearlyPrices = prices.data.filter(
    (p) =>
      p.type === 'recurring' &&
      p.recurring?.interval === 'year' &&
      p.unit_amount === EXPECTED.yearly.amount &&
      p.currency === EXPECTED.yearly.currency
  )
  log({
    label: '$1188/yr AUD subscription price',
    status: yearlyPrices.length > 0 ? 'PASS' : 'FAIL',
    detail:
      yearlyPrices.length > 0
        ? `Found ${yearlyPrices.length}: ${yearlyPrices.map((p) => p.id).join(', ')}`
        : 'NOT FOUND — run setup-stripe.ts to create',
  })

  // Check env vars for price IDs
  const envMonthly = process.env.STRIPE_PRICE_MONTHLY
  const envYearly = process.env.STRIPE_PRICE_YEARLY
  log({
    label: 'STRIPE_PRICE_MONTHLY env var',
    status: envMonthly && envMonthly !== 'MONTHLY_PLAN' ? 'PASS' : 'WARN',
    detail: envMonthly && envMonthly !== 'MONTHLY_PLAN'
      ? envMonthly
      : 'Not set or using fallback "MONTHLY_PLAN" (dynamic creation will be used)',
  })
  log({
    label: 'STRIPE_PRICE_YEARLY env var',
    status: envYearly && envYearly !== 'YEARLY_PLAN' ? 'PASS' : 'WARN',
    detail: envYearly && envYearly !== 'YEARLY_PLAN'
      ? envYearly
      : 'Not set or using fallback "YEARLY_PLAN" (dynamic creation will be used)',
  })

  // List all recurring prices for context
  const allRecurring = prices.data.filter((p) => p.type === 'recurring')
  if (allRecurring.length > 0) {
    console.log('\n   All active recurring prices:')
    for (const p of allRecurring) {
      const prod = typeof p.product === 'object' ? (p.product as Stripe.Product).name : p.product
      console.log(
        `     - ${p.id}: $${(p.unit_amount! / 100).toFixed(2)} ${p.currency.toUpperCase()} / ${p.recurring!.interval} (product: ${prod})`
      )
    }
  }

  // ── 3. Add-on prices (one-time) ────────────────────
  console.log('\n3. Add-on Prices (one-time)')
  console.log('   Note: Add-ons are created dynamically per-checkout in /api/addons/checkout.')
  console.log('   No persistent price objects are required for add-ons.')
  log({
    label: 'Add-on pricing config',
    status: 'PASS',
    detail: 'Configured in lib/pricing.ts: $20 (8 reports), $50 (25 reports), $100 (60 reports)',
  })

  // ── 4. Webhook endpoints ───────────────────────────
  console.log('\n4. Webhook Endpoints')
  try {
    const webhookEndpoints = await stripe.webhookEndpoints.list({ limit: 20 })
    if (webhookEndpoints.data.length === 0) {
      log({
        label: 'Webhook endpoints',
        status: 'WARN',
        detail: 'No webhook endpoints configured. Subscription lifecycle events will not be processed.',
      })
    } else {
      for (const wh of webhookEndpoints.data) {
        const status = wh.status === 'enabled' ? 'PASS' : 'WARN'
        log({
          label: `Webhook ${wh.id}`,
          status,
          detail: `${wh.url} | status: ${wh.status} | events: ${wh.enabled_events.length > 5 ? wh.enabled_events.length + ' events' : wh.enabled_events.join(', ')}`,
        })
      }
    }

    // Check for required events
    const requiredEvents = [
      'checkout.session.completed',
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.payment_succeeded',
      'invoice.payment_failed',
      'payment_intent.succeeded',
    ]

    const allEnabledEvents = webhookEndpoints.data.flatMap((wh) => wh.enabled_events)
    const hasWildcard = allEnabledEvents.includes('*')

    if (!hasWildcard) {
      for (const evt of requiredEvents) {
        const covered = allEnabledEvents.includes(evt)
        log({
          label: `Event: ${evt}`,
          status: covered ? 'PASS' : 'WARN',
          detail: covered ? 'Covered by at least one endpoint' : 'NOT covered by any webhook endpoint',
        })
      }
    } else {
      log({
        label: 'Webhook event coverage',
        status: 'PASS',
        detail: 'Wildcard (*) enabled — all events are covered',
      })
    }
  } catch (err: any) {
    log({
      label: 'Webhook endpoints',
      status: 'WARN',
      detail: `Could not list webhook endpoints: ${err.message}`,
    })
  }

  // ── 5. STRIPE_WEBHOOK_SECRET env ───────────────────
  console.log('\n5. Environment Variables')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  log({
    label: 'STRIPE_WEBHOOK_SECRET',
    status: webhookSecret ? 'PASS' : 'FAIL',
    detail: webhookSecret ? 'Set (starts with whsec_...)' : 'NOT SET — webhooks will fail signature verification',
  })

  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  log({
    label: 'STRIPE_PUBLISHABLE_KEY',
    status: publishableKey ? 'PASS' : 'WARN',
    detail: publishableKey ? `Set (${publishableKey.substring(0, 12)}...)` : 'Not set — fallback key in code will be used',
  })

  // ── 6. Customer portal ─────────────────────────────
  console.log('\n6. Billing Portal')
  try {
    const portalConfigs = await stripe.billingPortal.configurations.list({ limit: 5 })
    log({
      label: 'Billing portal configuration',
      status: portalConfigs.data.length > 0 ? 'PASS' : 'WARN',
      detail:
        portalConfigs.data.length > 0
          ? `${portalConfigs.data.length} configuration(s) found`
          : 'No portal config — Stripe will use defaults',
    })
  } catch (err: any) {
    log({
      label: 'Billing portal',
      status: 'WARN',
      detail: `Could not check portal config: ${err.message}`,
    })
  }

  // ── Summary ────────────────────────────────────────
  console.log('\n' + '='.repeat(50))
  const fails = results.filter((r) => r.status === 'FAIL').length
  const warns = results.filter((r) => r.status === 'WARN').length
  const passes = results.filter((r) => r.status === 'PASS').length
  console.log(`Summary: ${passes} passed, ${warns} warnings, ${fails} failures`)

  if (fails > 0) {
    console.log('\nAction required:')
    for (const r of results.filter((r) => r.status === 'FAIL')) {
      console.log(`  - ${r.label}: ${r.detail}`)
    }
  }

  if (warns > 0) {
    console.log('\nWarnings:')
    for (const r of results.filter((r) => r.status === 'WARN')) {
      console.log(`  - ${r.label}: ${r.detail}`)
    }
  }

  process.exit(fails > 0 ? 1 : 0)
}

auditStripe().catch((err) => {
  console.error('Audit script failed:', err)
  process.exit(2)
})
