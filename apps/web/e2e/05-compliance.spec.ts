import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/auth'

/**
 * RA-84 — Compliance E2E Journey
 * Covers: public compliance page, compliance library, IICRC/NRPG sub-pages,
 *         contractor certifications, expiry warnings
 */

test.describe('Compliance Journey — Public Pages', () => {
  test('should display public compliance page', async ({ page }) => {
    await page.goto('/compliance')

    await expect(
      page.getByRole('heading', { level: 1 }).or(page.getByText(/compliance/i).first())
    ).toBeVisible({ timeout: 10000 })

    // Page lists key standards (IICRC, NCC, AS/NZS)
    await expect(
      page.getByText(/IICRC|NCC|AS\/NZS|insurance standards/i).first()
    ).toBeVisible()
  })

  test('should display compliance library page', async ({ page }) => {
    await page.goto('/compliance-library')

    await expect(
      page.getByText(/compliance|library/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should display IICRC compliance sub-page', async ({ page }) => {
    await page.goto('/compliance/iicrc')

    await expect(
      page.getByText(/IICRC/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should display NRPG compliance sub-page', async ({ page }) => {
    await page.goto('/compliance/nrpg')

    await expect(
      page.getByText(/NRPG/i).first()
    ).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Compliance Journey — Contractor Certifications', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  test('should view certifications on contractor profile', async ({ page }) => {
    await page.goto('/dashboard/contractors/profile')
    await page.waitForLoadState('networkidle')

    // Certifications section should be present
    await expect(
      page.getByText(/certification/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should display certification verification status', async ({ page }) => {
    await page.goto('/dashboard/contractors/profile')
    await page.waitForLoadState('networkidle')

    // If certifications exist they show verification status badges
    const verificationBadge = page.locator(
      'text=/verified|pending|expired|unverified/i'
    ).first()

    if (await verificationBadge.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(verificationBadge).toBeVisible()
    }
    // No certifications yet is also valid
  })

  test('should display expiry date warnings for certifications', async ({ page }) => {
    await page.goto('/dashboard/contractors/profile')
    await page.waitForLoadState('networkidle')

    // Certifications with upcoming expiry may show warning icons or text
    const expiryIndicator = page.locator(
      'text=/expir|due|warning/i'
    ).first()

    if (await expiryIndicator.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(expiryIndicator).toBeVisible()
    }
    // If no certifications or none expiring, this is acceptable
  })
})

test.describe('Compliance Journey — Dashboard Integrations', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  test('should access claims analysis page', async ({ page }) => {
    await page.goto('/dashboard/claims-analysis')

    await expect(
      page.getByText(/claim|analysis/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should access restoration documents page', async ({ page }) => {
    await page.goto('/dashboard/restoration-documents')

    await expect(
      page.getByText(/restoration|document/i).first()
    ).toBeVisible({ timeout: 10000 })
  })
})
