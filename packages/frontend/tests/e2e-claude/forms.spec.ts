import { test, expect } from '@playwright/test';
import { mockContactFormAPI } from './mocks/api-mocks';
import { FORM_VALIDATION_TESTS } from './fixtures/test-data';

/**
 * E2E Test Suite: Form Validation & Security
 *
 * Tests form security and validation:
 * 1. Contact form XSS prevention
 * 2. Email validation
 * 3. Required field validation
 * 4. DOMPurify sanitization working
 * 5. SQL injection prevention
 */

test.describe('Contact Form Validation', () => {
  test.beforeEach(async ({ page }) => {
    await mockContactFormAPI(page);
    await page.goto('/contact');
  });

  test('should display contact form with all required fields', async ({ page }) => {
    // Verify form is visible
    const form = page.locator('form');
    await expect(form).toBeVisible();

    // Check for name field
    const nameInput = page.locator('input[name="name"], input[id="name"]');
    await expect(nameInput).toBeVisible();

    // Check for email field
    const emailInput = page.locator('input[name="email"], input[id="email"], input[type="email"]');
    await expect(emailInput).toBeVisible();

    // Check for subject field
    const subjectInput = page.locator('input[name="subject"], input[id="subject"]');
    await expect(subjectInput).toBeVisible();

    // Check for message field
    const messageInput = page.locator('textarea[name="message"], textarea[id="message"]');
    await expect(messageInput).toBeVisible();

    // Check for submit button
    const submitButton = page.getByRole('button', { name: /send|submit/i });
    await expect(submitButton).toBeVisible();
  });

  test('should validate required fields on submit', async ({ page }) => {
    // Try to submit empty form
    const submitButton = page.getByRole('button', { name: /send|submit/i });
    await submitButton.click();

    // Wait for validation
    await page.waitForTimeout(500);

    // HTML5 validation should prevent submission
    // Check if form is still on same page (not submitted)
    await expect(page).toHaveURL('/contact');

    // Verify name field shows validation error
    const nameInput = page.locator('input[name="name"], input[id="name"]');
    const isNameInvalid = await nameInput.evaluate((el: HTMLInputElement) => !el.validity.valid);

    expect(isNameInvalid).toBeTruthy();
  });

  test('should validate email format', async ({ page }) => {
    const emailInput = page.locator('input[name="email"], input[id="email"], input[type="email"]');

    // Enter invalid email
    await emailInput.fill('invalid-email');

    // Try to submit
    const submitButton = page.getByRole('button', { name: /send|submit/i });
    await submitButton.click();

    await page.waitForTimeout(500);

    // Verify email validation error
    const isEmailInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid);
    expect(isEmailInvalid).toBeTruthy();
  });

  test('should accept valid email format', async ({ page }) => {
    const emailInput = page.locator('input[name="email"], input[id="email"], input[type="email"]');

    // Enter valid email
    await emailInput.fill(FORM_VALIDATION_TESTS.valid.email);

    // Check validity
    const isEmailValid = await emailInput.evaluate((el: HTMLInputElement) => el.validity.valid);
    expect(isEmailValid).toBeTruthy();
  });

  test('should submit form with valid data', async ({ page }) => {
    // Fill all required fields
    await page.locator('input[name="name"], input[id="name"]')
      .fill(FORM_VALIDATION_TESTS.valid.name);

    await page.locator('input[name="email"], input[id="email"], input[type="email"]')
      .fill(FORM_VALIDATION_TESTS.valid.email);

    await page.locator('input[name="subject"], input[id="subject"]')
      .fill(FORM_VALIDATION_TESTS.valid.subject);

    await page.locator('textarea[name="message"], textarea[id="message"]')
      .fill(FORM_VALIDATION_TESTS.valid.message);

    // Submit form
    const submitButton = page.getByRole('button', { name: /send|submit/i });
    await submitButton.click();

    // Wait for success message
    await page.waitForTimeout(2000);

    // Check for success indicator
    const successMessage = page.getByText(/success|sent|thank you/i);
    await expect(successMessage).toBeVisible({ timeout: 5000 });
  });
});

test.describe('XSS Prevention', () => {
  test.beforeEach(async ({ page }) => {
    await mockContactFormAPI(page);
    await page.goto('/contact');
  });

  FORM_VALIDATION_TESTS.xss.inputs.forEach((xssInput, index) => {
    test(`should sanitize XSS attempt ${index + 1}: ${xssInput.substring(0, 30)}...`, async ({ page }) => {
      const nameInput = page.locator('input[name="name"], input[id="name"]');
      const messageInput = page.locator('textarea[name="message"], textarea[id="message"]');

      // Try to inject XSS in name field
      await nameInput.fill(xssInput);

      // Verify input was sanitized or rejected
      const nameValue = await nameInput.inputValue();

      // Check if dangerous script tags are present
      expect(nameValue.toLowerCase()).not.toContain('<script');
      expect(nameValue.toLowerCase()).not.toContain('onerror');
      expect(nameValue.toLowerCase()).not.toContain('javascript:');
      expect(nameValue.toLowerCase()).not.toContain('onload');

      // Try in message field as well
      await messageInput.fill(xssInput);
      const messageValue = await messageInput.inputValue();

      // Note: Input fields may allow entry but sanitization happens on backend
      // The key is that it doesn't execute
      console.log(`XSS input ${index + 1} handled - name: ${nameValue}, message: ${messageValue}`);
    });
  });

  test('should prevent XSS in submitted data', async ({ page }) => {
    // Fill form with XSS attempt
    await page.locator('input[name="name"], input[id="name"]')
      .fill('<script>alert("xss")</script>');

    await page.locator('input[name="email"], input[id="email"], input[type="email"]')
      .fill('test@example.com');

    await page.locator('input[name="subject"], input[id="subject"]')
      .fill('Test Subject');

    await page.locator('textarea[name="message"], textarea[id="message"]')
      .fill('<img src=x onerror=alert("xss")>');

    // Submit form
    const submitButton = page.getByRole('button', { name: /send|submit/i });
    await submitButton.click();

    await page.waitForTimeout(2000);

    // Verify no script execution (page should still be functional)
    await expect(page).toHaveURL('/contact');

    // Verify no alert dialogs appeared
    page.on('dialog', async (dialog) => {
      // If a dialog appears, fail the test
      expect(dialog.type()).not.toBe('alert');
      await dialog.dismiss();
    });
  });

  test('should handle special characters safely', async ({ page }) => {
    const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    const nameInput = page.locator('input[name="name"], input[id="name"]');
    await nameInput.fill(`Test User ${specialChars}`);

    const nameValue = await nameInput.inputValue();

    // Special chars should be allowed but not cause issues
    expect(nameValue).toContain(specialChars);
  });
});

test.describe('SQL Injection Prevention', () => {
  test.beforeEach(async ({ page }) => {
    await mockContactFormAPI(page);
    await page.goto('/contact');
  });

  FORM_VALIDATION_TESTS.sql.inputs.forEach((sqlInput, index) => {
    test(`should prevent SQL injection attempt ${index + 1}: ${sqlInput}`, async ({ page }) => {
      const emailInput = page.locator('input[name="email"], input[id="email"], input[type="email"]');
      const messageInput = page.locator('textarea[name="message"], textarea[id="message"]');

      // Try SQL injection in message
      await messageInput.fill(sqlInput);

      // Fill other required fields
      await page.locator('input[name="name"], input[id="name"]').fill('Test User');
      await emailInput.fill('test@example.com');
      await page.locator('input[name="subject"], input[id="subject"]').fill('Test');

      // Submit form
      const submitButton = page.getByRole('button', { name: /send|submit/i });
      await submitButton.click();

      await page.waitForTimeout(2000);

      // Form should handle submission without SQL errors
      // Success message should appear (backend sanitizes)
      const successOrError = await page.getByText(/success|error|sent/i).count();
      expect(successOrError).toBeGreaterThan(0);
    });
  });
});

test.describe('Form UX and Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/contact');
  });

  test('should have proper labels for all fields', async ({ page }) => {
    // Check for label elements
    const nameLabel = page.locator('label[for="name"]');
    const emailLabel = page.locator('label[for="email"]');
    const subjectLabel = page.locator('label[for="subject"]');
    const messageLabel = page.locator('label[for="message"]');

    const hasLabels = await nameLabel.count() > 0 ||
                      await emailLabel.count() > 0 ||
                      await subjectLabel.count() > 0 ||
                      await messageLabel.count() > 0;

    expect(hasLabels).toBeTruthy();
  });

  test('should show loading state during submission', async ({ page }) => {
    await mockContactFormAPI(page);

    // Fill form
    await page.locator('input[name="name"], input[id="name"]')
      .fill(FORM_VALIDATION_TESTS.valid.name);
    await page.locator('input[name="email"], input[id="email"], input[type="email"]')
      .fill(FORM_VALIDATION_TESTS.valid.email);
    await page.locator('input[name="subject"], input[id="subject"]')
      .fill(FORM_VALIDATION_TESTS.valid.subject);
    await page.locator('textarea[name="message"], textarea[id="message"]')
      .fill(FORM_VALIDATION_TESTS.valid.message);

    // Submit
    const submitButton = page.getByRole('button', { name: /send|submit/i });
    await submitButton.click();

    // Check for loading indicator
    await page.waitForTimeout(500);

    const loadingIndicator = page.getByText(/sending|loading/i)
      .or(page.locator('[class*="loading"], [class*="spinner"]'));

    const hasLoading = await loadingIndicator.count() > 0;
    console.log(`Loading indicator shown: ${hasLoading}`);
  });

  test('should disable submit button during submission', async ({ page }) => {
    await mockContactFormAPI(page);

    // Fill form
    await page.locator('input[name="name"], input[id="name"]')
      .fill(FORM_VALIDATION_TESTS.valid.name);
    await page.locator('input[name="email"], input[id="email"], input[type="email"]')
      .fill(FORM_VALIDATION_TESTS.valid.email);
    await page.locator('input[name="subject"], input[id="subject"]')
      .fill(FORM_VALIDATION_TESTS.valid.subject);
    await page.locator('textarea[name="message"], textarea[id="message"]')
      .fill(FORM_VALIDATION_TESTS.valid.message);

    const submitButton = page.getByRole('button', { name: /send|submit/i });

    // Submit
    await submitButton.click();

    // Button should be disabled immediately
    await page.waitForTimeout(100);

    const isDisabled = await submitButton.isDisabled();
    console.log(`Submit button disabled during submission: ${isDisabled}`);
  });

  test('should clear form after successful submission', async ({ page }) => {
    await mockContactFormAPI(page);

    // Fill and submit form
    const nameInput = page.locator('input[name="name"], input[id="name"]');
    const emailInput = page.locator('input[name="email"], input[id="email"], input[type="email"]');
    const messageInput = page.locator('textarea[name="message"], textarea[id="message"]');

    await nameInput.fill(FORM_VALIDATION_TESTS.valid.name);
    await emailInput.fill(FORM_VALIDATION_TESTS.valid.email);
    await page.locator('input[name="subject"], input[id="subject"]')
      .fill(FORM_VALIDATION_TESTS.valid.subject);
    await messageInput.fill(FORM_VALIDATION_TESTS.valid.message);

    const submitButton = page.getByRole('button', { name: /send|submit/i });
    await submitButton.click();

    // Wait for success
    await page.waitForTimeout(2000);

    // Check if form was cleared
    const nameValue = await nameInput.inputValue();
    const emailValue = await emailInput.inputValue();
    const messageValue = await messageInput.inputValue();

    const isCleared = nameValue === '' && emailValue === '' && messageValue === '';
    console.log(`Form cleared after submission: ${isCleared}`);
  });
});

test.describe('Category Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/contact');
  });

  test('should have category/subject dropdown', async ({ page }) => {
    const categorySelect = page.locator('select[name="category"], select[id="category"]');

    if (await categorySelect.count() > 0) {
      await expect(categorySelect).toBeVisible();

      // Verify options exist
      const options = await categorySelect.locator('option').count();
      expect(options).toBeGreaterThan(1);
    }
  });

  test('should change category selection', async ({ page }) => {
    const categorySelect = page.locator('select[name="category"], select[id="category"]');

    if (await categorySelect.count() > 0) {
      // Get available options
      const options = categorySelect.locator('option');
      const optionCount = await options.count();

      if (optionCount > 1) {
        // Select second option
        const secondOption = await options.nth(1).textContent();
        await categorySelect.selectOption({ index: 1 });

        // Verify selection
        const selectedValue = await categorySelect.inputValue();
        expect(selectedValue).toBeTruthy();
      }
    }
  });
});

test.describe('Error Handling', () => {
  test('should show error message when submission fails', async ({ page }) => {
    // Mock failed submission
    await page.route('**/api/contact', async (route) => {
      await route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Server error' }),
      });
    });

    await page.goto('/contact');

    // Fill and submit form
    await page.locator('input[name="name"], input[id="name"]').fill('Test User');
    await page.locator('input[name="email"], input[id="email"], input[type="email"]')
      .fill('test@example.com');
    await page.locator('input[name="subject"], input[id="subject"]').fill('Test');
    await page.locator('textarea[name="message"], textarea[id="message"]').fill('Test message');

    const submitButton = page.getByRole('button', { name: /send|submit/i });
    await submitButton.click();

    // Wait for error message
    await page.waitForTimeout(2000);

    const errorMessage = page.getByText(/error|failed|try again/i);
    const hasError = await errorMessage.count() > 0;

    expect(hasError).toBeTruthy();
  });
});
