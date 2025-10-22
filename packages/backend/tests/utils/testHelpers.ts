/**
 * Test Helper Utilities for Backend Testing
 *
 * Common utilities for creating test data, mocking dependencies,
 * and setting up test environments.
 */

import { jest } from '@jest/globals';

// ========================================
// Test Data Factories
// ========================================

/**
 * Create a mock user object for testing
 */
export function createMockUser(overrides: Partial<any> = {}) {
  return {
    user_id: 'test-user-' + Date.now(),
    email: 'test@example.com',
    name: 'Test User',
    google_id: 'google-123',
    picture: 'https://example.com/avatar.jpg',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock subscription object for testing
 */
export function createMockSubscription(overrides: Partial<any> = {}) {
  return {
    subscription_id: 'sub-test-' + Date.now(),
    user_id: 'test-user-123',
    plan_type: 'monthly',
    status: 'active',
    reports_used: 0,
    reports_limit: null,
    current_period_start: new Date(),
    current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    cancel_at_period_end: false,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock report object for testing
 */
export function createMockReport(overrides: Partial<any> = {}) {
  return {
    report_id: 'report-test-' + Date.now(),
    user_id: 'test-user-123',
    property_address: '123 Test St',
    damage_type: 'water',
    severity: 'moderate',
    description: 'Test damage description',
    ai_analysis: 'AI analysis results',
    status: 'draft',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

/**
 * Create a mock Stripe customer object
 */
export function createMockStripeCustomer(overrides: Partial<any> = {}) {
  return {
    id: 'cus_test_' + Date.now(),
    email: 'test@example.com',
    name: 'Test Customer',
    metadata: {},
    created: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

/**
 * Create a mock Stripe subscription object
 */
export function createMockStripeSubscription(overrides: Partial<any> = {}) {
  return {
    id: 'sub_test_' + Date.now(),
    customer: 'cus_test_123',
    status: 'active',
    current_period_start: Math.floor(Date.now() / 1000),
    current_period_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
    cancel_at_period_end: false,
    items: {
      data: [
        {
          id: 'si_test_123',
          price: {
            id: 'price_test_123',
            unit_amount: 2999,
            currency: 'aud',
          },
        },
      ],
    },
    ...overrides,
  };
}

// ========================================
// Database Mocking Utilities
// ========================================

/**
 * Create a mock database connection for testing
 */
export function createMockDb() {
  return {
    one: jest.fn<() => Promise<any>>(),
    oneOrNone: jest.fn<() => Promise<any>>(),
    many: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    none: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    any: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    result: jest.fn<() => Promise<any>>(),
    tx: jest.fn<() => Promise<any>>(),
  };
}

/**
 * Setup database mocks with common responses
 */
export function setupDbMocks(mockDb: any, options: {
  user?: any;
  subscription?: any;
  report?: any;
} = {}) {
  if (options.user) {
    mockDb.oneOrNone.mockResolvedValue(options.user);
  }
  if (options.subscription) {
    mockDb.one.mockResolvedValue(options.subscription);
  }
  if (options.report) {
    mockDb.many.mockResolvedValue([options.report]);
  }
}

// ========================================
// API Request Helpers
// ========================================

/**
 * Create an authenticated request header
 */
export function createAuthHeader(userId: string = 'test-user-123') {
  const token = Buffer.from(JSON.stringify({ userId })).toString('base64');
  return {
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Create a mock Express request object
 */
export function createMockRequest(overrides: any = {}) {
  return {
    body: {},
    query: {},
    params: {},
    headers: {},
    user: undefined,
    ...overrides,
  };
}

/**
 * Create a mock Express response object
 */
export function createMockResponse() {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
  };
  return res;
}

/**
 * Create a mock Next function for middleware testing
 */
export function createMockNext() {
  return jest.fn();
}

// ========================================
// Environment Utilities
// ========================================

/**
 * Set test environment variables
 */
export function setTestEnv(vars: Record<string, string>) {
  const original: Record<string, string | undefined> = {};

  Object.entries(vars).forEach(([key, value]) => {
    original[key] = process.env[key];
    process.env[key] = value;
  });

  return () => {
    Object.entries(original).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  };
}

/**
 * Reset environment to test defaults
 */
export function resetTestEnv() {
  process.env.NODE_ENV = 'test';
  process.env.USE_POSTGRES = 'false';
  delete process.env.DATABASE_URL;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.GOOGLE_CLIENT_ID;
}

// ========================================
// Async Testing Utilities
// ========================================

/**
 * Wait for a condition to be true (with timeout)
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 100 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Delay execution for testing
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========================================
// Validation Utilities
// ========================================

/**
 * Assert that an object matches a partial shape
 */
export function assertPartialMatch(actual: any, expected: Partial<any>) {
  Object.entries(expected).forEach(([key, value]) => {
    if (actual[key] !== value) {
      throw new Error(
        `Expected ${key} to be ${JSON.stringify(value)}, but got ${JSON.stringify(actual[key])}`
      );
    }
  });
}

/**
 * Assert that a value is defined (not null or undefined)
 */
export function assertDefined<T>(value: T | null | undefined, message?: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message || 'Expected value to be defined');
  }
}

// ========================================
// Mock Service Factories
// ========================================

/**
 * Create a mock Stripe service
 */
export function createMockStripeService() {
  return {
    customers: {
      create: jest.fn().mockResolvedValue(createMockStripeCustomer()),
      retrieve: jest.fn().mockResolvedValue(createMockStripeCustomer()),
      update: jest.fn().mockResolvedValue(createMockStripeCustomer()),
    },
    subscriptions: {
      create: jest.fn().mockResolvedValue(createMockStripeSubscription()),
      retrieve: jest.fn().mockResolvedValue(createMockStripeSubscription()),
      update: jest.fn().mockResolvedValue(createMockStripeSubscription()),
      cancel: jest.fn().mockResolvedValue(createMockStripeSubscription({ status: 'canceled' })),
    },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({ id: 'cs_test_123', url: 'https://checkout.stripe.com/test' }),
      },
    },
  };
}

/**
 * Create a mock email service
 */
export function createMockEmailService() {
  return {
    sendWelcomeEmail: jest.fn().mockResolvedValue(true),
    sendReportReadyEmail: jest.fn().mockResolvedValue(true),
    sendSubscriptionConfirmation: jest.fn().mockResolvedValue(true),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  };
}

// ========================================
// Performance Testing Utilities
// ========================================

/**
 * Measure execution time of a function
 */
export async function measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  return { result, duration };
}

/**
 * Run a function multiple times and get average execution time
 */
export async function benchmark(fn: () => Promise<any>, iterations: number = 100): Promise<number> {
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const { duration } = await measureTime(fn);
    times.push(duration);
  }

  const average = times.reduce((sum, time) => sum + time, 0) / times.length;
  return average;
}

// ========================================
// Cleanup Utilities
// ========================================

/**
 * Track resources for cleanup after tests
 */
export class TestResourceTracker {
  private resources: Array<() => Promise<void>> = [];

  /**
   * Register a cleanup function
   */
  register(cleanup: () => Promise<void> | void) {
    this.resources.push(async () => {
      await cleanup();
    });
  }

  /**
   * Clean up all registered resources
   */
  async cleanupAll() {
    for (const cleanup of this.resources.reverse()) {
      try {
        await cleanup();
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    }
    this.resources = [];
  }
}

// ========================================
// Export all utilities
// ========================================

export default {
  createMockUser,
  createMockSubscription,
  createMockReport,
  createMockStripeCustomer,
  createMockStripeSubscription,
  createMockDb,
  setupDbMocks,
  createAuthHeader,
  createMockRequest,
  createMockResponse,
  createMockNext,
  setTestEnv,
  resetTestEnv,
  waitFor,
  delay,
  assertPartialMatch,
  assertDefined,
  createMockStripeService,
  createMockEmailService,
  measureTime,
  benchmark,
  TestResourceTracker,
};
