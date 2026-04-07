/**
 * Playwright Auth Setup — RA2-055 (RA-125)
 *
 * Logs in once and serialises the browser storage state to
 * playwright/.auth/user.json so the V2 workflow tests can skip the
 * login page entirely.
 *
 * Credentials are supplied via env vars:
 *   E2E_USER_EMAIL    (default: test@restoreassist.app)
 *   E2E_USER_PASSWORD (default: Test1234!)
 */

import { test as setup, expect } from "@playwright/test";
import path from "path";

export const AUTH_FILE = path.join(__dirname, "../playwright/.auth/user.json");

setup("authenticate", async ({ page }) => {
  const email = process.env.E2E_USER_EMAIL ?? "test@restoreassist.app";
  const password = process.env.E2E_USER_PASSWORD ?? "Test1234!";

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();

  // Wait for successful redirect to dashboard
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

  // Save auth state for other test files
  await page.context().storageState({ path: AUTH_FILE });
});
