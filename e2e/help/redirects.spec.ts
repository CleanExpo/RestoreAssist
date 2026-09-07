import { test, expect } from "@playwright/test";

test("/faq redirects to /help", async ({ page }) => {
  const response = await page.goto("/faq");
  expect(response?.status()).toBe(200); // Final destination
  expect(page.url()).toContain("/help");
});
