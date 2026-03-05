import { type Page, expect } from '@playwright/test'

/**
 * Test credentials — sourced from environment variables with sensible test defaults.
 * In CI, set PLAYWRIGHT_TEST_EMAIL / PLAYWRIGHT_TEST_PASSWORD as secrets.
 */
const TEST_CREDENTIALS = {
  admin: {
    email: process.env.PLAYWRIGHT_TEST_ADMIN_EMAIL || 'admin@test.restoreassist.com',
    password: process.env.PLAYWRIGHT_TEST_ADMIN_PASSWORD || 'TestAdmin123!',
  },
  manager: {
    email: process.env.PLAYWRIGHT_TEST_MANAGER_EMAIL || 'manager@test.restoreassist.com',
    password: process.env.PLAYWRIGHT_TEST_MANAGER_PASSWORD || 'TestManager123!',
  },
  user: {
    email: process.env.PLAYWRIGHT_TEST_USER_EMAIL || 'user@test.restoreassist.com',
    password: process.env.PLAYWRIGHT_TEST_USER_PASSWORD || 'TestUser123!',
  },
} as const

export type TestRole = keyof typeof TEST_CREDENTIALS

/**
 * Log in as the given role via the /login page.
 * Waits until the dashboard URL is reached before returning.
 */
export async function loginAs(page: Page, role: TestRole = 'admin') {
  const { email, password } = TEST_CREDENTIALS[role]

  await page.goto('/login')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()

  // Wait for navigation to dashboard (auth redirect)
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 })
}

/**
 * Assert the page has been redirected to the login page.
 */
export async function expectRedirectedToLogin(page: Page) {
  await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
}
