#!/usr/bin/env npx tsx
/**
 * RestoreAssist Stripe Setup Script
 * ==================================
 * Run: npx tsx apps/web/scripts/setup-stripe.ts
 *
 * Creates the required Stripe products and prices if they don't already exist:
 *   - RestoreAssist Monthly: $99/mo AUD recurring
 *   - RestoreAssist Yearly:  $1188/yr AUD recurring
 *
 * Outputs the price IDs to add to your .env.local file.
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

const isTest = secretKey.startsWith('sk_test_')

async function setupStripe() {
  console.log('RestoreAssist Stripe Setup')
  console.log('='.repeat(50))
  console.log(`Mode: ${isTest ? 'TEST' : 'LIVE'}`)
  console.log()

  // ── Check for existing products ─────────────────────
  const existingProducts = await stripe.products.list({ active: true, limit: 100 })
  const existingPrices = await stripe.prices.list({ active: true, limit: 100, expand: ['data.product'] })

  // ── Monthly Product & Price ─────────────────────────
  console.log('1. Monthly Subscription ($99/mo AUD)')

  let monthlyPrice = existingPrices.data.find(
    (p) =>
      p.type === 'recurring' &&
      p.recurring?.interval === 'month' &&
      p.unit_amount === 9900 &&
      p.currency === 'aud'
  )

  if (monthlyPrice) {
    const prod = typeof monthlyPrice.product === 'object'
      ? (monthlyPrice.product as Stripe.Product).name
      : monthlyPrice.product
    console.log(`   Already exists: ${monthlyPrice.id} (product: ${prod})`)
  } else {
    // Check if product exists but price doesn't
    let monthlyProduct = existingProducts.data.find(
      (p) => p.name.toLowerCase().includes('monthly') && p.name.toLowerCase().includes('plan')
    )

    if (!monthlyProduct) {
      monthlyProduct = await stripe.products.create({
        name: 'RestoreAssist Monthly Plan',
        description: '50 inspection reports per month. IICRC S500 compliant. PDF & Excel export. All integrations.',
        metadata: {
          app: 'restoreassist',
          reportLimit: '50',
          signupBonus: '10',
        },
      })
      console.log(`   Created product: ${monthlyProduct.id}`)
    }

    monthlyPrice = await stripe.prices.create({
      product: monthlyProduct.id,
      unit_amount: 9900,
      currency: 'aud',
      recurring: { interval: 'month' },
      nickname: 'Monthly Plan - 50 Reports',
      metadata: {
        app: 'restoreassist',
        plan: 'monthly',
      },
    })
    console.log(`   Created price: ${monthlyPrice.id}`)
  }

  // ── Yearly Product & Price ──────────────────────────
  console.log('\n2. Yearly Subscription ($1188/yr AUD)')

  let yearlyPrice = existingPrices.data.find(
    (p) =>
      p.type === 'recurring' &&
      p.recurring?.interval === 'year' &&
      p.unit_amount === 118800 &&
      p.currency === 'aud'
  )

  if (yearlyPrice) {
    const prod = typeof yearlyPrice.product === 'object'
      ? (yearlyPrice.product as Stripe.Product).name
      : yearlyPrice.product
    console.log(`   Already exists: ${yearlyPrice.id} (product: ${prod})`)
  } else {
    let yearlyProduct = existingProducts.data.find(
      (p) => p.name.toLowerCase().includes('yearly') && p.name.toLowerCase().includes('plan')
    )

    if (!yearlyProduct) {
      yearlyProduct = await stripe.products.create({
        name: 'RestoreAssist Yearly Plan',
        description: '70 inspection reports per month. Best value. IICRC S500 compliant. Priority support.',
        metadata: {
          app: 'restoreassist',
          reportLimit: '70',
          signupBonus: '10',
        },
      })
      console.log(`   Created product: ${yearlyProduct.id}`)
    }

    yearlyPrice = await stripe.prices.create({
      product: yearlyProduct.id,
      unit_amount: 118800,
      currency: 'aud',
      recurring: { interval: 'year' },
      nickname: 'Yearly Plan - 70 Reports/Month',
      metadata: {
        app: 'restoreassist',
        plan: 'yearly',
      },
    })
    console.log(`   Created price: ${yearlyPrice.id}`)
  }

  // ── Output ──────────────────────────────────────────
  console.log('\n' + '='.repeat(50))
  console.log('Add these to apps/web/.env.local:\n')
  console.log(`STRIPE_PRICE_MONTHLY=${monthlyPrice.id}`)
  console.log(`STRIPE_PRICE_YEARLY=${yearlyPrice.id}`)
  console.log()

  if (isTest) {
    console.log('NOTE: These are TEST mode price IDs.')
    console.log('Run again with a live key for production price IDs.')
  }

  console.log('\nSetup complete.')
}

setupStripe().catch((err) => {
  console.error('Setup script failed:', err)
  process.exit(2)
})
