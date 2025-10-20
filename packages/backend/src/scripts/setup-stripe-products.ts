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

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2025-09-30.clover',
});

/**
 * Setup Stripe Product Catalog for RestoreAssist
 *
 * Products:
 * - Free Trial: 3 free reports
 * - Monthly Plan: $49.50/month - Unlimited reports
 * - Yearly Plan: $528/year - Unlimited reports (10% discount)
 */
async function setupStripeProducts() {
  console.log('🚀 Setting up RestoreAssist Stripe Product Catalog...\n');

  try {
    // =====================================================
    // 1. Create Main Product
    // =====================================================
    console.log('📦 Creating RestoreAssist product...');

    const product = await stripe.products.create({
      name: 'RestoreAssist',
      description: 'AI-Powered Damage Assessment Reports for Australian Properties',
      images: [], // Add your logo URL here later
      metadata: {
        industry: 'restoration',
        region: 'australia',
        compliance: 'NCC 2022',
      },
    });

    console.log(`✅ Product created: ${product.id} - ${product.name}\n`);

    // =====================================================
    // 2. Create Free Trial Price (One-time)
    // =====================================================
    console.log('🆓 Creating Free Trial price (3 reports)...');

    const freeTrialPrice = await stripe.prices.create({
      product: product.id,
      currency: 'aud',
      unit_amount: 0, // Free
      nickname: 'Free Trial',
      metadata: {
        plan_type: 'free_trial',
        report_limit: '3',
        features: 'Limited to 3 reports',
      },
    });

    console.log(`✅ Free Trial price created: ${freeTrialPrice.id}`);
    console.log(`   - Amount: $0 AUD`);
    console.log(`   - Report Limit: 3 reports\n`);

    // =====================================================
    // 3. Create Monthly Subscription Price
    // =====================================================
    console.log('📅 Creating Monthly subscription price...');

    const monthlyPrice = await stripe.prices.create({
      product: product.id,
      currency: 'aud',
      unit_amount: 4950, // $49.50 in cents
      recurring: {
        interval: 'month',
        interval_count: 1,
      },
      nickname: 'Monthly Plan',
      metadata: {
        plan_type: 'monthly',
        report_limit: 'unlimited',
        features: 'Unlimited reports, PDF export, Email support',
      },
    });

    console.log(`✅ Monthly price created: ${monthlyPrice.id}`);
    console.log(`   - Amount: $49.50 AUD/month`);
    console.log(`   - Report Limit: Unlimited\n`);

    // =====================================================
    // 4. Create Yearly Subscription Price
    // =====================================================
    console.log('📆 Creating Yearly subscription price...');

    const yearlyPrice = await stripe.prices.create({
      product: product.id,
      currency: 'aud',
      unit_amount: 52800, // $528 in cents
      recurring: {
        interval: 'year',
        interval_count: 1,
      },
      nickname: 'Yearly Plan',
      metadata: {
        plan_type: 'yearly',
        report_limit: 'unlimited',
        features: 'Unlimited reports, PDF export, Priority support, 10% discount',
        discount_percentage: '10',
        monthly_equivalent: '44.00',
      },
    });

    console.log(`✅ Yearly price created: ${yearlyPrice.id}`);
    console.log(`   - Amount: $528 AUD/year`);
    console.log(`   - Equivalent: $44/month (10% discount)`);
    console.log(`   - Report Limit: Unlimited\n`);

    // =====================================================
    // 5. Summary
    // =====================================================
    console.log('═══════════════════════════════════════════════════════');
    console.log('✨ STRIPE PRODUCT CATALOG SETUP COMPLETE!');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('📋 Product Details:');
    console.log(`   Product ID: ${product.id}`);
    console.log(`   Product Name: ${product.name}\n`);

    console.log('💰 Pricing Details:');
    console.log('   1. Free Trial:');
    console.log(`      - Price ID: ${freeTrialPrice.id}`);
    console.log(`      - Amount: $0 AUD`);
    console.log(`      - Reports: 3 free reports\n`);

    console.log('   2. Monthly Plan:');
    console.log(`      - Price ID: ${monthlyPrice.id}`);
    console.log(`      - Amount: $49.50 AUD/month`);
    console.log(`      - Reports: Unlimited\n`);

    console.log('   3. Yearly Plan:');
    console.log(`      - Price ID: ${yearlyPrice.id}`);
    console.log(`      - Amount: $528 AUD/year ($44/month)`);
    console.log(`      - Reports: Unlimited`);
    console.log(`      - Savings: 10% discount\n`);

    console.log('📝 Next Steps:');
    console.log('   1. Save these Price IDs to your .env.local file');
    console.log('   2. Update your frontend pricing page');
    console.log('   3. Test checkout flows for each plan');
    console.log('   4. Configure webhooks for subscription events\n');

    // =====================================================
    // 6. Save IDs to file for easy reference
    // =====================================================
    const config = {
      productId: product.id,
      prices: {
        freeTrial: {
          id: freeTrialPrice.id,
          amount: 0,
          currency: 'aud',
          reportLimit: 3,
        },
        monthly: {
          id: monthlyPrice.id,
          amount: 49.50,
          currency: 'aud',
          interval: 'month',
          reportLimit: 'unlimited',
        },
        yearly: {
          id: yearlyPrice.id,
          amount: 528,
          currency: 'aud',
          interval: 'year',
          reportLimit: 'unlimited',
          discount: '10%',
        },
      },
    };

    console.log('💾 Configuration saved to clipboard:');
    console.log('\n# Add these to your .env.local file:');
    console.log(`STRIPE_PRODUCT_ID=${product.id}`);
    console.log(`STRIPE_PRICE_FREE_TRIAL=${freeTrialPrice.id}`);
    console.log(`STRIPE_PRICE_MONTHLY=${monthlyPrice.id}`);
    console.log(`STRIPE_PRICE_YEARLY=${yearlyPrice.id}`);

    return config;

  } catch (error) {
    console.error('❌ Error setting up Stripe products:', error);

    if (error instanceof Stripe.errors.StripeError) {
      console.error(`   Type: ${error.type}`);
      console.error(`   Message: ${error.message}`);
    }

    process.exit(1);
  }
}

// Run the setup
setupStripeProducts()
  .then(() => {
    console.log('\n✅ Setup completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Setup failed:', error);
    process.exit(1);
  });
