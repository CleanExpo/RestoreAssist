import { test, expect } from '@playwright/test'

/**
 * Procurement & Approval E2E Tests (RA-217)
 * Tests procurement and approval-related API endpoints and dashboard routes
 */

test.describe('Procurement API Authentication', () => {
  test('should require authentication for procurement endpoints', async ({ request }) => {
    // Test procurement-related protected endpoints return 401
    const protectedEndpoints = [
      '/api/contractors',
      '/api/team',
      '/api/notifications',
      '/api/integrations',
    ]

    for (const endpoint of protectedEndpoints) {
      const response = await request.get(endpoint)
      // Should return 401 Unauthorized
      expect(response.status()).toBe(401)
    }
  })
})

test.describe('Procurement Dashboard Routes', () => {
  test('should redirect /dashboard/contractors to login without auth', async ({ page }) => {
    await page.goto('/dashboard/contractors')

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/)
  })

  test('should redirect /dashboard/team to login without auth', async ({ page }) => {
    await page.goto('/dashboard/team')

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/)
  })

  test('should redirect /dashboard/integrations to login without auth', async ({ page }) => {
    await page.goto('/dashboard/integrations')

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/)
  })
})
