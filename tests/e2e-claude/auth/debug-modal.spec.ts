import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test('Debug: Check what happens when clicking Get Started', async ({ page }) => {
  // Navigate to landing page
  await page.goto(BASE_URL);
  await page.waitForLoadState('domcontentloaded');

  console.log('========== STEP 1: Initial page load ==========');

  // Wait a bit for any dynamic content
  await page.waitForTimeout(2000);

  // Check for "Get Started" or "Start Free Trial" buttons
  const ctaButtons = page.locator('button:has-text("Get Started"), button:has-text("Start Free Trial")');
  const buttonCount = await ctaButtons.count();
  console.log(`Found ${buttonCount} CTA buttons`);

  for (let i = 0; i < buttonCount; i++) {
    const buttonText = await ctaButtons.nth(i).textContent();
    const isVisible = await ctaButtons.nth(i).isVisible();
    console.log(`Button ${i}: "${buttonText}" - Visible: ${isVisible}`);
  }

  // Click the first visible button
  const getStartedButton = ctaButtons.first();
  await expect(getStartedButton).toBeVisible();
  console.log('Clicking first CTA button...');
  await getStartedButton.click({ force: false });

  console.log('========== STEP 2: After clicking CTA button ==========');

  // Wait a bit for any changes
  await page.waitForTimeout(2000);

  // Check if modal appeared
  const modalHeading = page.locator('h2:has-text("Welcome to RestoreAssist")');
  const modalExists = await modalHeading.count() > 0;
  const modalVisible = await modalHeading.isVisible().catch(() => false);

  console.log(`Modal heading exists: ${modalExists}`);
  console.log(`Modal heading visible: ${modalVisible}`);

  // Check for Google button
  const googleButton = page.locator('button:has-text("Sign up with Google"), button:has-text("Sign in with Google"), button:has-text("Continue with Google")');
  const googleButtonCount = await googleButton.count();
  console.log(`Found ${googleButtonCount} Google auth buttons`);

  for (let i = 0; i < googleButtonCount; i++) {
    const buttonText = await googleButton.nth(i).textContent();
    const isVisible = await googleButton.nth(i).isVisible().catch(() => false);
    console.log(`Google button ${i}: "${buttonText}" - Visible: ${isVisible}`);
  }

  // Try clicking Get Started again if modal didn't appear
  if (!modalVisible) {
    console.log('========== STEP 3: Modal not visible, clicking CTA again ==========');
    await getStartedButton.click({ force: false });
    await page.waitForTimeout(2000);

    const modalVisible2 = await modalHeading.isVisible().catch(() => false);
    console.log(`Modal visible after second click: ${modalVisible2}`);

    const googleButtonCount2 = await googleButton.count();
    console.log(`Found ${googleButtonCount2} Google auth buttons after second click`);

    for (let i = 0; i < googleButtonCount2; i++) {
      const isVisible = await googleButton.nth(i).isVisible().catch(() => false);
      console.log(`Google button ${i} visible: ${isVisible}`);
    }
  }

  // Check all buttons in the modal
  console.log('========== STEP 4: Check ALL buttons in modal ==========');
  const allButtons = page.locator('button');
  const allButtonCount = await allButtons.count();
  console.log(`Total buttons on page: ${allButtonCount}`);

  for (let i = 0; i < Math.min(allButtonCount, 20); i++) {
    const buttonText = await allButtons.nth(i).textContent().catch(() => 'N/A');
    const isVisible = await allButtons.nth(i).isVisible().catch(() => false);
    if (isVisible) {
      console.log(`Button ${i}: "${buttonText}"`);
    }
  }

  // Check for iframes
  console.log('========== STEP 5: Check for iframes ==========');
  const iframes = page.locator('iframe');
  const iframeCount = await iframes.count();
  console.log(`Found ${iframeCount} iframes`);

  for (let i = 0; i < iframeCount; i++) {
    const src = await iframes.nth(i).getAttribute('src').catch(() => 'N/A');
    const id = await iframes.nth(i).getAttribute('id').catch(() => 'N/A');
    console.log(`Iframe ${i}: id="${id}", src="${src}"`);
  }

  // Take a screenshot for debugging
  await page.screenshot({ path: 'test-results/debug-modal-state.png', fullPage: true });
  console.log('Screenshot saved to test-results/debug-modal-state.png');
});
