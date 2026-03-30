import { test, expect } from '@playwright/test'

/**
 * Warehouse / Inventory E2E Tests (RA-213)
 * Tests invoice, cost-library, and estimate API auth guards
 * plus dashboard navigation redirects for unauthenticated users
 */

test.describe('Warehouse API Authentication', () => {
  test('should require authentication for GET /api/invoices', async ({ request }) => {
    const response = await request.get('/api/invoices')

    // Should return 401 Unauthorized
    expect(response.status()).toBe(401)
  })

  test('should require authentication for GET /api/cost-libraries', async ({ request }) => {
    const response = await request.get('/api/cost-libraries')

    // Should return 401 Unauthorized
    expect(response.status()).toBe(401)
  })

  test('should require authentication for GET /api/estimates', async ({ request }) => {
    const response = await request.get('/api/estimates')

    // Should return 401 Unauthorized
    expect(response.status()).toBe(401)
  })
})

test.describe('Warehouse Dashboard Navigation', () => {
  test('should redirect unauthenticated users from /dashboard to login', async ({ page }) => {
    await page.goto('/dashboard')

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/)
  })

  test('should redirect unauthenticated users from /dashboard/invoices to login', async ({ page }) => {
    await page.goto('/dashboard/invoices')

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/)
  })

  test('should redirect unauthenticated users from /dashboard/cost-libraries to login', async ({ page }) => {
    await page.goto('/dashboard/cost-libraries')

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/)
  })
})
