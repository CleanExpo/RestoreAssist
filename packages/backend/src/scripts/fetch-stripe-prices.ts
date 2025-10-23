import Stripe from 'stripe';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';

if (!STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY not found in environment variables');
  process.exit(1);
}

// Validate Stripe key format and safety
const UNSAFE_PATTERNS = ['EXAMPLE', 'test_KEY', 'NEVER_USE', 'your_stripe'];
if (UNSAFE_PATTERNS.some(pattern => STRIPE_SECRET_KEY.toLowerCase().includes(pattern.toLowerCase()))) {
  console.error('❌ STRIPE_SECRET_KEY is using an unsafe example value! Generate a real key from Stripe Dashboard.');
  process.exit(1);
}

if (!STRIPE_SECRET_KEY.startsWith('sk_test_') && !STRIPE_SECRET_KEY.startsWith('sk_live_')) {
  console.error('❌ STRIPE_SECRET_KEY has invalid format. Must start with sk_test_ or sk_live_');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2025-09-30.clover',
});

/**
 * Fetch price information from existing Stripe products
 */
async function fetchStripePrices() {
  console.log('🔍 Fetching prices from existing Stripe products...\n');

  const PRODUCTS = {
    yearly: 'prod_TGdZP6UNZ8ONMh',
    monthly: 'prod_TGdXM0eZiBxmfW',
    freeTrial: 'prod_TGdTtgqCXY34na',
  };

  try {
    const config: any = {
      products: {},
      prices: {},
    };

    // =====================================================
    // Fetch Free Trial Product & Prices
    // =====================================================
    console.log('🆓 Fetching Free Trial product...');
    const freeTrialProduct = await stripe.products.retrieve(PRODUCTS.freeTrial);
    const freeTrialPrices = await stripe.prices.list({ product: PRODUCTS.freeTrial, limit: 10 });

    console.log(`✅ Product: ${freeTrialProduct.name} (${freeTrialProduct.id})`);

    config.products.freeTrial = {
      id: freeTrialProduct.id,
      name: freeTrialProduct.name,
    };

    if (freeTrialPrices.data.length > 0) {
      const price = freeTrialPrices.data[0];
      config.prices.freeTrial = {
        id: price.id,
        amount: price.unit_amount || 0,
        currency: price.currency,
        type: price.type,
      };
      console.log(`   Price ID: ${price.id}`);
      console.log(`   Amount: $${(price.unit_amount || 0) / 100} ${price.currency.toUpperCase()}`);
    } else {
      console.log('   ⚠️  No prices found for this product');
    }
    console.log('');

    // =====================================================
    // Fetch Monthly Product & Prices
    // =====================================================
    console.log('📅 Fetching Monthly Plan product...');
    const monthlyProduct = await stripe.products.retrieve(PRODUCTS.monthly);
    const monthlyPrices = await stripe.prices.list({ product: PRODUCTS.monthly, limit: 10 });

    console.log(`✅ Product: ${monthlyProduct.name} (${monthlyProduct.id})`);

    config.products.monthly = {
      id: monthlyProduct.id,
      name: monthlyProduct.name,
    };

    if (monthlyPrices.data.length > 0) {
      const price = monthlyPrices.data[0];
      config.prices.monthly = {
        id: price.id,
        amount: price.unit_amount || 0,
        currency: price.currency,
        type: price.type,
        recurring: price.recurring,
      };
      console.log(`   Price ID: ${price.id}`);
      console.log(`   Amount: $${(price.unit_amount || 0) / 100} ${price.currency.toUpperCase()}`);
      if (price.recurring) {
        console.log(`   Interval: ${price.recurring.interval}`);
      }
    } else {
      console.log('   ⚠️  No prices found for this product');
    }
    console.log('');

    // =====================================================
    // Fetch Yearly Product & Prices
    // =====================================================
    console.log('📆 Fetching Yearly Plan product...');
    const yearlyProduct = await stripe.products.retrieve(PRODUCTS.yearly);
    const yearlyPrices = await stripe.prices.list({ product: PRODUCTS.yearly, limit: 10 });

    console.log(`✅ Product: ${yearlyProduct.name} (${yearlyProduct.id})`);

    config.products.yearly = {
      id: yearlyProduct.id,
      name: yearlyProduct.name,
    };

    if (yearlyPrices.data.length > 0) {
      const price = yearlyPrices.data[0];
      config.prices.yearly = {
        id: price.id,
        amount: price.unit_amount || 0,
        currency: price.currency,
        type: price.type,
        recurring: price.recurring,
      };
      console.log(`   Price ID: ${price.id}`);
      console.log(`   Amount: $${(price.unit_amount || 0) / 100} ${price.currency.toUpperCase()}`);
      if (price.recurring) {
        console.log(`   Interval: ${price.recurring.interval}`);
      }
    } else {
      console.log('   ⚠️  No prices found for this product');
    }
    console.log('');

    // =====================================================
    // Summary
    // =====================================================
    console.log('═══════════════════════════════════════════════════════');
    console.log('✨ STRIPE PRODUCT INFORMATION FETCHED!');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('📋 Configuration for .env.local:\n');
    console.log('# Stripe Products');
    console.log(`STRIPE_PRODUCT_FREE_TRIAL=${PRODUCTS.freeTrial}`);
    console.log(`STRIPE_PRODUCT_MONTHLY=${PRODUCTS.monthly}`);
    console.log(`STRIPE_PRODUCT_YEARLY=${PRODUCTS.yearly}`);
    console.log('');

    if (config.prices.freeTrial) {
      console.log(`STRIPE_PRICE_FREE_TRIAL=${config.prices.freeTrial.id}`);
    }
    if (config.prices.monthly) {
      console.log(`STRIPE_PRICE_MONTHLY=${config.prices.monthly.id}`);
    }
    if (config.prices.yearly) {
      console.log(`STRIPE_PRICE_YEARLY=${config.prices.yearly.id}`);
    }
    console.log('');

    console.log('💰 Pricing Summary:');
    if (config.prices.freeTrial) {
      console.log(`   Free Trial: $${config.prices.freeTrial.amount / 100} ${config.prices.freeTrial.currency.toUpperCase()}`);
    }
    if (config.prices.monthly) {
      console.log(`   Monthly: $${config.prices.monthly.amount / 100} ${config.prices.monthly.currency.toUpperCase()}/month`);
    }
    if (config.prices.yearly) {
      const yearlyAmount = config.prices.yearly.amount / 100;
      const monthlyEquivalent = (yearlyAmount / 12).toFixed(2);
      console.log(`   Yearly: $${yearlyAmount} ${config.prices.yearly.currency.toUpperCase()}/year ($${monthlyEquivalent}/month)`);
    }

    return config;

  } catch (error) {
    console.error('❌ Error fetching Stripe products:', error);

    if (error instanceof Stripe.errors.StripeError) {
      console.error(`   Type: ${error.type}`);
      console.error(`   Message: ${error.message}`);
    }

    process.exit(1);
  }
}

// Run the fetch
fetchStripePrices()
  .then(() => {
    console.log('\n✅ Fetch completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fetch failed:', error);
    process.exit(1);
  });
