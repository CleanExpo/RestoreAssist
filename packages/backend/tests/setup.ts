// Jest setup file
// Runs before all tests

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.USE_POSTGRES = 'false'; // Use in-memory storage for tests

// Mock Sentry to prevent real error tracking in tests
jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  withScope: jest.fn((callback) => callback({ setContext: jest.fn(), setUser: jest.fn(), setTag: jest.fn(), setLevel: jest.fn() })),
  setupExpressErrorHandler: jest.fn(() => (req: any, res: any, next: any) => next()),
  flush: jest.fn().mockResolvedValue(true),
}));

// Mock email service to prevent sending real emails in tests
jest.mock('../src/services/emailService', () => ({
  emailService: {
    sendCheckoutConfirmation: jest.fn().mockResolvedValue(true),
    sendPaymentReceipt: jest.fn().mockResolvedValue(true),
    sendSubscriptionCancelled: jest.fn().mockResolvedValue(true),
    sendPaymentFailed: jest.fn().mockResolvedValue(true),
  },
}));

// Increase timeout for all tests
jest.setTimeout(10000);

// Global test utilities
global.console = {
  ...console,
  // Suppress console.log in tests unless explicitly needed
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  // Keep error and warn for debugging
  error: console.error,
  warn: console.warn,
};
