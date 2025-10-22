import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Test Configuration for RestoreAssist E2E Testing
 *
 * Target Score: 65/100
 * Current Score: 40/100
 *
 * Test Coverage:
 * - Free Trial Signup Flow (Google OAuth mock)
 * - Stripe Checkout Flow (payment processing)
 * - Navigation & Routes (all 30 routes)
 * - Form Validation (XSS prevention, sanitization)
 */
export default defineConfig({
  testDir: './tests/e2e-claude',

  // Maximum time one test can run for
  timeout: 30 * 1000,

  // Test execution settings
  fullyParallel: false, // Run tests serially to avoid conflicts
  forbidOnly: !!process.env.CI, // Fail on .only() in CI
  retries: process.env.CI ? 2 : 0, // Retry on CI
  workers: process.env.CI ? 1 : 1, // Single worker for stability

  // Reporter configuration
  reporter: [
    ['list'],
    ['json', { outputFile: 'tests/e2e-claude/results/test-results.json' }],
    ['html', { outputFolder: 'tests/e2e-claude/results/html-report', open: 'never' }],
  ],

  // Shared settings for all tests
  use: {
    // Base URL for the application
    baseURL: process.env.VITE_APP_URL || 'http://localhost:5173',

    // Browser settings
    headless: process.env.CI ? true : false,
    viewport: { width: 1280, height: 720 },

    // Tracing and screenshots
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // Navigation settings
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },

  // Projects for different browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // Uncomment for cross-browser testing
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // Run local dev server before starting tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
