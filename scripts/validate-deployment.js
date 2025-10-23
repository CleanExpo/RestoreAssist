#!/usr/bin/env node

/**
 * Deployment Validation Script
 * Validates environment configuration before deployment
 */

const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function checkFile(filePath, description) {
  const exists = fs.existsSync(filePath);
  if (exists) {
    log(`✓ ${description}: ${filePath}`, colors.green);
  } else {
    log(`✗ ${description}: ${filePath} (missing)`, colors.red);
  }
  return exists;
}

function checkEnvVar(name, value, description, required = true) {
  if (value && value !== 'undefined' && value !== '') {
    log(`✓ ${name}: ${description}`, colors.green);
    return true;
  } else if (required) {
    log(`✗ ${name}: ${description} (missing or empty)`, colors.red);
    return false;
  } else {
    log(`○ ${name}: ${description} (optional, not set)`, colors.yellow);
    return true;
  }
}

function validateBackendBuild() {
  log('\n=== Backend Build Validation ===', colors.blue);

  const checks = [
    checkFile(path.join(__dirname, '../packages/backend/dist/index.js'), 'Backend entry point'),
    checkFile(path.join(__dirname, '../packages/backend/dist/routes'), 'Backend routes directory'),
    checkFile(path.join(__dirname, '../packages/backend/vercel.json'), 'Backend Vercel config'),
    checkFile(path.join(__dirname, '../packages/backend/api/index.js'), 'Backend API handler'),
  ];

  return checks.every(Boolean);
}

function validateFrontendBuild() {
  log('\n=== Frontend Build Validation ===', colors.blue);

  const checks = [
    checkFile(path.join(__dirname, '../packages/frontend/dist/index.html'), 'Frontend entry point'),
    checkFile(path.join(__dirname, '../packages/frontend/dist/assets'), 'Frontend assets directory'),
    checkFile(path.join(__dirname, '../packages/frontend/vercel.json'), 'Frontend Vercel config'),
  ];

  return checks.every(Boolean);
}

function validateBackendEnv() {
  log('\n=== Backend Environment Variables ===', colors.blue);

  const env = process.env;

  const checks = [
    // Critical
    checkEnvVar('NODE_ENV', env.NODE_ENV, 'Node environment', true),
    checkEnvVar('ANTHROPIC_API_KEY', env.ANTHROPIC_API_KEY, 'Anthropic API key', true),
    checkEnvVar('JWT_SECRET', env.JWT_SECRET, 'JWT secret', true),
    checkEnvVar('JWT_REFRESH_SECRET', env.JWT_REFRESH_SECRET, 'JWT refresh secret', true),
    checkEnvVar('STRIPE_SECRET_KEY', env.STRIPE_SECRET_KEY, 'Stripe secret key', true),
    checkEnvVar('STRIPE_WEBHOOK_SECRET', env.STRIPE_WEBHOOK_SECRET, 'Stripe webhook secret', true),

    // Important
    checkEnvVar('ALLOWED_ORIGINS', env.ALLOWED_ORIGINS, 'CORS allowed origins', true),
    checkEnvVar('GOOGLE_CLIENT_ID', env.GOOGLE_CLIENT_ID, 'Google OAuth client ID', false),
    checkEnvVar('GOOGLE_CLIENT_SECRET', env.GOOGLE_CLIENT_SECRET, 'Google OAuth client secret', false),

    // Optional
    checkEnvVar('SENTRY_DSN', env.SENTRY_DSN, 'Sentry DSN', false),
    checkEnvVar('USE_POSTGRES', env.USE_POSTGRES, 'PostgreSQL flag', false),
    checkEnvVar('DATABASE_URL', env.DATABASE_URL, 'Database URL', false),
  ];

  return checks.every(Boolean);
}

function validateFrontendEnv() {
  log('\n=== Frontend Environment Variables (Build Time) ===', colors.blue);

  const env = process.env;

  const checks = [
    checkEnvVar('VITE_API_URL', env.VITE_API_URL, 'API URL', true),
    checkEnvVar('VITE_GOOGLE_CLIENT_ID', env.VITE_GOOGLE_CLIENT_ID, 'Google OAuth client ID', true),
    checkEnvVar('VITE_STRIPE_PUBLISHABLE_KEY', env.VITE_STRIPE_PUBLISHABLE_KEY, 'Stripe publishable key', true),
    checkEnvVar('VITE_STRIPE_PRICE_FREE_TRIAL', env.VITE_STRIPE_PRICE_FREE_TRIAL, 'Stripe free trial price ID', true),
    checkEnvVar('VITE_STRIPE_PRICE_MONTHLY', env.VITE_STRIPE_PRICE_MONTHLY, 'Stripe monthly price ID', true),
    checkEnvVar('VITE_STRIPE_PRICE_YEARLY', env.VITE_STRIPE_PRICE_YEARLY, 'Stripe yearly price ID', true),
    checkEnvVar('VITE_SENTRY_DSN', env.VITE_SENTRY_DSN, 'Sentry DSN', false),
  ];

  return checks.every(Boolean);
}

function validateVercelSecrets() {
  log('\n=== GitHub Secrets / Vercel Configuration ===', colors.blue);

  const env = process.env;

  const checks = [
    checkEnvVar('VERCEL_TOKEN', env.VERCEL_TOKEN, 'Vercel API token', false),
    checkEnvVar('VERCEL_ORG_ID', env.VERCEL_ORG_ID, 'Vercel org ID (backend)', false),
    checkEnvVar('VERCEL_PROJECT_ID', env.VERCEL_PROJECT_ID, 'Vercel project ID (backend)', false),
    checkEnvVar('VERCEL_ORG_ID_FRONTEND', env.VERCEL_ORG_ID_FRONTEND, 'Vercel org ID (frontend)', false),
    checkEnvVar('VERCEL_PROJECT_ID_FRONTEND', env.VERCEL_PROJECT_ID_FRONTEND, 'Vercel project ID (frontend)', false),
  ];

  if (!checks.some(Boolean)) {
    log('\n⚠️  Note: GitHub secrets are only available in CI/CD environment', colors.yellow);
    return true; // Don't fail for missing secrets in local environment
  }

  return true;
}

function validateAPIRoutes() {
  log('\n=== API Routes Verification ===', colors.blue);

  const routesDir = path.join(__dirname, '../packages/backend/dist/routes');

  if (!fs.existsSync(routesDir)) {
    log('✗ Routes directory not found', colors.red);
    return false;
  }

  const expectedRoutes = [
    'authRoutes.js',
    'trialAuthRoutes.js',
    'reportRoutes.js',
    'stripeRoutes.js',
    'subscriptionRoutes.js',
    'adminRoutes.js',
    'exportRoutes.js',
    'integrationsRoutes.js',
  ];

  let allFound = true;
  for (const route of expectedRoutes) {
    const routePath = path.join(routesDir, route);
    if (fs.existsSync(routePath)) {
      log(`✓ ${route}`, colors.green);
    } else {
      log(`✗ ${route} (missing)`, colors.red);
      allFound = false;
    }
  }

  return allFound;
}

function validateDeploymentStructure() {
  log('\n=== Deployment Structure Validation ===', colors.blue);

  const checks = [
    checkFile(path.join(__dirname, '../vercel.json'), 'Root Vercel config'),
    checkFile(path.join(__dirname, '../.github/workflows/deploy.yml'), 'Deployment workflow'),
    checkFile(path.join(__dirname, '../.github/workflows/test.yml'), 'Test workflow'),
    checkFile(path.join(__dirname, '../api/index.js'), 'Root API handler'),
  ];

  return checks.every(Boolean);
}

// Main validation
async function main() {
  log('\n╔═══════════════════════════════════════════════════════╗', colors.magenta);
  log('║   RestoreAssist Deployment Validation               ║', colors.magenta);
  log('╚═══════════════════════════════════════════════════════╝', colors.magenta);

  const results = {
    backendBuild: validateBackendBuild(),
    frontendBuild: validateFrontendBuild(),
    deploymentStructure: validateDeploymentStructure(),
    apiRoutes: validateAPIRoutes(),
    backendEnv: validateBackendEnv(),
    frontendEnv: validateFrontendEnv(),
    vercelSecrets: validateVercelSecrets(),
  };

  log('\n=== Validation Summary ===', colors.blue);

  for (const [key, value] of Object.entries(results)) {
    const status = value ? '✓' : '✗';
    const color = value ? colors.green : colors.red;
    const name = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    log(`${status} ${name}`, color);
  }

  const allPassed = Object.values(results).every(Boolean);

  log('\n' + '='.repeat(60), colors.blue);

  if (allPassed) {
    log('✓ All validations passed! Ready for deployment.', colors.green);
    process.exit(0);
  } else {
    log('✗ Some validations failed. Please fix the issues above.', colors.red);
    log('\nRecommendations:', colors.yellow);

    if (!results.backendBuild || !results.frontendBuild) {
      log('  • Run: npm run build', colors.yellow);
    }

    if (!results.backendEnv || !results.frontendEnv) {
      log('  • Check .env.example files for required variables', colors.yellow);
      log('  • Ensure all environment variables are set in Vercel dashboard', colors.yellow);
    }

    if (!results.apiRoutes) {
      log('  • Verify backend TypeScript compilation completed successfully', colors.yellow);
    }

    process.exit(1);
  }
}

main().catch(err => {
  console.error('Validation script failed:', err);
  process.exit(1);
});
