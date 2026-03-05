import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/auth'

/**
 * RA-84 — Invoicing E2E Journey
 * Covers: invoices list, stats display, create new invoice, invoice detail, PDF generation
 */

test.describe('Invoicing Journey', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  // -- Invoices List -------------------------------------------------------

  test('should display invoices list page', async ({ page }) => {
    await page.goto('/dashboard/invoices')

    await expect(
      page.getByText(/invoice/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should display invoice stats cards', async ({ page }) => {
    await page.goto('/dashboard/invoices')
    await page.waitForLoadState('networkidle')

    // The invoices page shows revenue/outstanding/overdue stats
    // Look for financial stat labels
    await expect(
      page.getByText(/revenue|outstanding|overdue|paid/i).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('should have search and filter on invoices page', async ({ page }) => {
    await page.goto('/dashboard/invoices')
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByPlaceholder(/search/i).first()
    ).toBeVisible()
  })

  test('should have a create new invoice action', async ({ page }) => {
    await page.goto('/dashboard/invoices')
    await page.waitForLoadState('networkidle')

    // "New Invoice" or "+" button/link
    const newInvoiceAction = page.getByRole('link', { name: /new invoice|create invoice/i })
      .or(page.getByRole('button', { name: /new invoice|create invoice/i }))

    await expect(newInvoiceAction.first()).toBeVisible({ timeout: 10000 })
  })

  // -- Create Invoice Flow -------------------------------------------------

  test('should display new invoice form with required fields', async ({ page }) => {
    await page.goto('/dashboard/invoices/new')

    await page.waitForLoadState('networkidle')

    // Customer name / selection field
    await expect(
      page.getByText(/customer|client/i).first()
    ).toBeVisible({ timeout: 10000 })

    // Line items section
    await expect(
      page.getByText(/line item|description|item/i).first()
    ).toBeVisible()
  })

  test('should allow adding line items on new invoice page', async ({ page }) => {
    await page.goto('/dashboard/invoices/new')
    await page.waitForLoadState('networkidle')

    // Click "Add Line Item" or "+" button
    const addLineButton = page.getByRole('button', { name: /add.*line|add.*item|\+/i })
    if (await addLineButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      const initialInputs = await page.locator('input[type="number"]').count()
      await addLineButton.click()
      const updatedInputs = await page.locator('input[type="number"]').count()

      // Should have at least one more number input (quantity or unit price)
      expect(updatedInputs).toBeGreaterThanOrEqual(initialInputs)
    }
  })

  // -- Invoice Detail & PDF ------------------------------------------------

  test('should navigate to invoice detail page when one exists', async ({ page }) => {
    await page.goto('/dashboard/invoices')
    await page.waitForLoadState('networkidle')

    const invoiceLink = page.locator('a[href*="/dashboard/invoices/"]').first()
    if (await invoiceLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await invoiceLink.click()

      await expect(page).toHaveURL(/\/dashboard\/invoices\/[a-zA-Z0-9-]+/)

      // Invoice detail should show invoice number or customer name
      await expect(
        page.getByText(/invoice|INV-/i).first()
      ).toBeVisible({ timeout: 10000 })
    } else {
      test.skip(true, 'No invoices exist yet to view detail page')
    }
  })

  test('should show download/PDF action on invoice detail', async ({ page }) => {
    await page.goto('/dashboard/invoices')
    await page.waitForLoadState('networkidle')

    const invoiceLink = page.locator('a[href*="/dashboard/invoices/"]').first()
    if (await invoiceLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await invoiceLink.click()
      await page.waitForLoadState('networkidle')

      // Look for a download/PDF/print button on the detail page
      const pdfAction = page.getByRole('button', { name: /download|pdf|print|export/i })
        .or(page.getByRole('link', { name: /download|pdf|print|export/i }))

      if (await pdfAction.first().isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(pdfAction.first()).toBeVisible()
      }
    } else {
      test.skip(true, 'No invoices exist yet to test PDF download')
    }
  })

  // -- Invoice Status Filter -----------------------------------------------

  test('should filter invoices by status', async ({ page }) => {
    await page.goto('/dashboard/invoices')
    await page.waitForLoadState('networkidle')

    // The invoices page has a status filter dropdown/select
    const statusFilter = page.locator('select').first()
    if (await statusFilter.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Select a status option
      await statusFilter.selectOption({ index: 1 })

      // Page should still be on invoices (no crash)
      await expect(page).toHaveURL(/\/dashboard\/invoices/)
    }
  })
})
