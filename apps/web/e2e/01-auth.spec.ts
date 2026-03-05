import { test, expect } from '@playwright/test'
import { loginAs, expectRedirectedToLogin } from './helpers/auth'

/**
 * RA-84 — Authentication E2E Journey
 * Covers: login, invalid credentials, protected route redirect, logout
 */

test.describe('Authentication Journey', () => {
  test('should display login page with required form elements', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })

  test('should redirect unauthenticated users from /dashboard to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await expectRedirectedToLogin(page)
  })

  test('should redirect unauthenticated users from /dashboard/reports to /login', async ({ page }) => {
    await page.goto('/dashboard/reports')
    await expectRedirectedToLogin(page)
  })

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel(/email/i).fill('invalid@example.com')
    await page.getByLabel(/password/i).fill('WrongPassword123!')
    await page.getByRole('button', { name: /sign in/i }).click()

    // The login page shows "Invalid email or password" on failure
    await expect(
      page.getByText(/invalid|incorrect|failed/i)
    ).toBeVisible({ timeout: 10000 })

    // Should remain on the login page
    await expect(page).toHaveURL(/\/login/)
  })

  test('should login with valid credentials and land on dashboard', async ({ page }) => {
    await loginAs(page, 'admin')

    // Dashboard page should show key elements
    await expect(page.getByText(/dashboard/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('should logout and redirect to homepage or login', async ({ page }) => {
    await loginAs(page, 'admin')

    // The sidebar has a Logout button
    const logoutButton = page.getByRole('button', { name: /logout/i })

    // On mobile the sidebar may be hidden — try clicking the mobile menu first
    if (!(await logoutButton.isVisible())) {
      const menuButton = page.getByRole('button', { name: /open menu/i })
      if (await menuButton.isVisible()) {
        await menuButton.click()
      }
    }

    await logoutButton.click()

    // After signOut the app redirects to "/" (callbackUrl)
    await expect(page).toHaveURL(/^\/$|\/login/, { timeout: 10000 })
  })

  test('should display forgot-password page', async ({ page }) => {
    await page.goto('/forgot-password')

    await expect(page.getByRole('heading', { name: /forgot|reset/i })).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /reset|send/i })).toBeVisible()
  })

  test('should display signup page', async ({ page }) => {
    await page.goto('/signup')

    await expect(page.getByRole('heading', { name: /sign up|create|register/i })).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()
  })
})
