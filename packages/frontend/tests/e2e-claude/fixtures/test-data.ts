/**
 * Test Data Fixtures for E2E Testing
 * Provides consistent test data across all test suites
 */

export const TEST_USER = {
  email: 'test@restoreassist.com',
  name: 'Test User',
  googleId: 'test-google-id-123',
};

export const MOCK_GOOGLE_CREDENTIAL = {
  credential: 'mock-google-id-token-for-testing',
  clientId: 'mock-client-id',
};

export const MOCK_TRIAL_DATA = {
  success: true,
  user: {
    userId: 'test-user-001',
    email: TEST_USER.email,
    name: TEST_USER.name,
    role: 'user' as const,
    emailVerified: true,
  },
  tokens: {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
  },
  sessionToken: 'mock-session-token',
  trial: {
    tokenId: 'test-trial-token',
    reportsRemaining: 3,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
};

export const STRIPE_TEST_DATA = {
  plans: {
    monthly: {
      priceId: 'price_test_monthly',
      name: 'Monthly Plan',
      amount: 49,
    },
    yearly: {
      priceId: 'price_test_yearly',
      name: 'Yearly Plan',
      amount: 490,
    },
  },
  checkoutSession: {
    id: 'cs_test_session_123',
    url: 'https://checkout.stripe.com/test/session/123',
  },
};

export const FORM_VALIDATION_TESTS = {
  xss: {
    inputs: [
      '<script>alert("xss")</script>',
      '<img src=x onerror=alert("xss")>',
      'javascript:alert("xss")',
      '<svg onload=alert("xss")>',
    ],
    expectedSanitized: [
      '',
      '',
      '',
      '',
    ],
  },
  sql: {
    inputs: [
      "'; DROP TABLE users; --",
      "1' OR '1'='1",
      "admin'--",
    ],
  },
  valid: {
    name: 'John Doe',
    email: 'john.doe@example.com',
    subject: 'Test Subject',
    message: 'This is a valid test message.',
  },
};

export const ROUTES_TO_TEST = [
  // Main Routes
  { path: '/', name: 'Landing/Free Trial' },
  { path: '/about', name: 'About Us' },
  { path: '/pricing', name: 'Pricing Plans' },
  { path: '/preview/landing', name: 'Preview' },

  // Feature Routes - Core Capabilities
  { path: '/features/ai-reports', name: 'AI Report Generation' },
  { path: '/features/iicrc-compliance', name: 'IICRC Compliance' },
  { path: '/features/building-codes', name: 'NCC 2022 Building Codes' },
  { path: '/features/cost-estimation', name: 'Cost Estimation' },

  // Feature Routes - Damage Assessment
  { path: '/features/water-damage', name: 'Water Damage' },
  { path: '/features/fire-damage', name: 'Fire & Smoke Damage' },
  { path: '/features/storm-damage', name: 'Storm Damage' },
  { path: '/features/flood-mould', name: 'Flood & Mould' },

  // Feature Routes - Professional Tools
  { path: '/features/export-formats', name: 'Multi-Format Export' },
  { path: '/features/templates', name: 'Template Library' },
  { path: '/features/batch-processing', name: 'Batch Processing' },
  { path: '/features/analytics', name: 'Analytics Dashboard' },

  // Resource Pages
  { path: '/resources/documentation', name: 'Documentation & Guides' },
  { path: '/resources/training', name: 'Training Videos' },
  { path: '/resources/api', name: 'API Integration' },
  { path: '/resources/compliance', name: 'Compliance Updates' },

  // User Routes
  { path: '/dashboard', name: 'User Dashboard' },
  { path: '/subscription', name: 'Subscription Management' },
  { path: '/settings', name: 'Account Settings' },

  // Legal Routes
  { path: '/privacy', name: 'Privacy Policy' },
  { path: '/terms', name: 'Terms of Service' },
  { path: '/refunds', name: 'Refund Policy' },

  // Support
  { path: '/contact', name: 'Contact Support' },

  // Checkout
  { path: '/checkout/success', name: 'Checkout Success' },
];
