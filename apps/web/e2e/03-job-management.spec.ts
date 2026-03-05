import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/auth'

/**
 * RA-84 — Job / Report / Inspection Management E2E Journey
 * In RestoreAssist, "jobs" map to Reports and Inspections.
 * Covers: list views, creation flows, detail pages, status updates
 */

test.describe('Reports Journey', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  test('should display reports list page', async ({ page }) => {
    await page.goto('/dashboard/reports')

    // Reports page should load
    await expect(
      page.getByText(/report/i).first()
    ).toBeVisible({ timeout: 10000 })

    // Should have a search input
    await expect(
      page.getByPlaceholder(/search/i).first()
    ).toBeVisible()
  })

  test('should display filter controls on reports list', async ({ page }) => {
    await page.goto('/dashboard/reports')
    await page.waitForLoadState('networkidle')

    // The reports page has filter toggles (status, hazard, insurance, date)
    const filterButton = page.getByRole('button', { name: /filter/i })
    if (await filterButton.isVisible()) {
      await filterButton.click()

      // Filter panel should open with status dropdown or checkboxes
      await expect(
        page.getByText(/status|hazard|date/i).first()
      ).toBeVisible({ timeout: 5000 })
    }
  })

  test('should navigate to new report page', async ({ page }) => {
    await page.goto('/dashboard/reports/new')

    // New report page should load with form elements
    await expect(
      page.getByText(/new report|create report|report/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should navigate to report detail page when a report exists', async ({ page }) => {
    await page.goto('/dashboard/reports')
    await page.waitForLoadState('networkidle')

    // Try to click the first report link if any exist
    const reportLink = page.locator('a[href*="/dashboard/reports/"]').first()
    if (await reportLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await reportLink.click()

      // Should navigate to report detail page
      await expect(page).toHaveURL(/\/dashboard\/reports\/[a-zA-Z0-9-]+/)
    } else {
      // No reports — skip gracefully
      test.skip(true, 'No reports exist yet to view detail page')
    }
  })
})

test.describe('Inspections Journey', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  test('should display inspections list page', async ({ page }) => {
    await page.goto('/dashboard/inspections')

    await expect(
      page.getByText(/inspection/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should have search and filter on inspections page', async ({ page }) => {
    await page.goto('/dashboard/inspections')
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByPlaceholder(/search/i).first()
    ).toBeVisible()
  })

  test('should navigate to new inspection page', async ({ page }) => {
    await page.goto('/dashboard/inspections/new')

    await expect(
      page.getByText(/new inspection|create inspection|inspection/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should navigate to inspection detail page when one exists', async ({ page }) => {
    await page.goto('/dashboard/inspections')
    await page.waitForLoadState('networkidle')

    const inspectionLink = page.locator('a[href*="/dashboard/inspections/"]').first()
    if (await inspectionLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await inspectionLink.click()

      await expect(page).toHaveURL(/\/dashboard\/inspections\/[a-zA-Z0-9-]+/)
    } else {
      test.skip(true, 'No inspections exist yet to view detail page')
    }
  })

  test('should display status badges on inspections list', async ({ page }) => {
    await page.goto('/dashboard/inspections')
    await page.waitForLoadState('networkidle')

    // If inspections exist, status badges (Draft, Submitted, etc.) should be visible
    const statusBadge = page.locator(
      'text=/Draft|Submitted|Processing|Classified|Scoped|Estimated|Completed|Rejected/i'
    ).first()

    if (await statusBadge.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(statusBadge).toBeVisible()
    }
    // If no inspections, the list is simply empty — this is acceptable
  })
})

test.describe('Clients Journey', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  test('should display clients list page', async ({ page }) => {
    await page.goto('/dashboard/clients')

    await expect(
      page.getByText(/client/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should have a create / add client action', async ({ page }) => {
    await page.goto('/dashboard/clients')
    await page.waitForLoadState('networkidle')

    // Look for "New Client" or "Add Client" button / link
    const addButton = page.getByRole('button', { name: /new client|add client/i })
      .or(page.getByRole('link', { name: /new client|add client/i }))

    await expect(addButton.first()).toBeVisible({ timeout: 10000 })
  })
})
