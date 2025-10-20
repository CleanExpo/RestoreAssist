import { test, expect } from '@playwright/test';

test('home page renders', async ({ page }) => {
  await page.goto(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000');
  await expect(page).toHaveTitle(/.+/);
});
