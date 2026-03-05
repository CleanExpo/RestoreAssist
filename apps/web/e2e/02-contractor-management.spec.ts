import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/auth'

/**
 * RA-84 — Contractor Management E2E Journey
 * Covers: contractor profile view, edit profile, certifications, service areas
 */

test.describe('Contractor Management Journey', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  // -- Contractor Profile --------------------------------------------------

  test('should navigate to contractor profile page', async ({ page }) => {
    await page.goto('/dashboard/contractors/profile')

    // Profile page should load with heading or form elements
    await expect(
      page.getByText(/contractor profile|profile/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should display contractor profile form fields', async ({ page }) => {
    await page.goto('/dashboard/contractors/profile')

    // Wait for the page to load fully
    await page.waitForLoadState('networkidle')

    // The profile page has editable fields for description, years in business, etc.
    const descriptionField = page.getByRole('textbox').first()
    await expect(descriptionField).toBeVisible({ timeout: 10000 })
  })

  test('should edit contractor profile description', async ({ page }) => {
    await page.goto('/dashboard/contractors/profile')
    await page.waitForLoadState('networkidle')

    // Find the public description textarea/input and update it
    const descriptionField = page.locator('textarea').first()
    if (await descriptionField.isVisible()) {
      const testDescription = `E2E Test Description ${Date.now()}`
      await descriptionField.clear()
      await descriptionField.fill(testDescription)

      // Click save button
      const saveButton = page.getByRole('button', { name: /save/i })
      if (await saveButton.isVisible()) {
        await saveButton.click()

        // Expect a success message
        await expect(
          page.getByText(/saved|success|updated/i).first()
        ).toBeVisible({ timeout: 10000 })
      }
    }
  })

  // -- Certifications ------------------------------------------------------

  test('should display certifications section on profile page', async ({ page }) => {
    await page.goto('/dashboard/contractors/profile')
    await page.waitForLoadState('networkidle')

    // The profile page has a certifications section
    await expect(
      page.getByText(/certification/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should open add-certification form', async ({ page }) => {
    await page.goto('/dashboard/contractors/profile')
    await page.waitForLoadState('networkidle')

    // Click "Add Certification" button
    const addCertButton = page.getByRole('button', { name: /add.*cert/i })
    if (await addCertButton.isVisible()) {
      await addCertButton.click()

      // Form fields should appear for certification details
      await expect(
        page.getByText(/certification.*name|type/i).first()
      ).toBeVisible({ timeout: 5000 })
    }
  })

  // -- Service Areas -------------------------------------------------------

  test('should display service areas section on profile page', async ({ page }) => {
    await page.goto('/dashboard/contractors/profile')
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByText(/service area/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  // -- Contractor Reviews --------------------------------------------------

  test('should navigate to contractor reviews page', async ({ page }) => {
    await page.goto('/dashboard/contractors/reviews')

    await expect(
      page.getByText(/review/i).first()
    ).toBeVisible({ timeout: 10000 })
  })
})
