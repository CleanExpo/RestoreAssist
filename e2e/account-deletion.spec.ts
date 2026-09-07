import { test, expect } from "@playwright/test";
import { AUTH_FILE } from "./auth-paths";

test.describe("Delete Account", () => {
  test.use({ storageState: AUTH_FILE });

  test("Delete Account button opens confirmation modal", async ({ page }) => {
    await page.goto("/dashboard/settings");

    // Button must be present and clickable
    const deleteBtn = page.getByRole("button", { name: /delete account/i });
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // Modal should open
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });

    await expect(
      page.getByText(/permanently deletes your account/i),
    ).toBeVisible();
  });

  test("confirm button is disabled until exact phrase is typed", async ({
    page,
  }) => {
    await page.goto("/dashboard/settings");
    await page.getByRole("button", { name: /delete account/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const confirmBtn = page
      .getByRole("button", { name: /^delete account$/i })
      .last();

    // Should be disabled before typing
    await expect(confirmBtn).toBeDisabled();

    // Partial phrase — still disabled
    const input = page.getByPlaceholder("DELETE MY ACCOUNT");
    await input.fill("DELETE");
    await expect(confirmBtn).toBeDisabled();

    // Exact phrase — enabled
    await input.fill("DELETE MY ACCOUNT");
    await expect(confirmBtn).toBeEnabled();
  });

  test("cancel closes the modal", async ({ page }) => {
    await page.goto("/dashboard/settings");
    await page.getByRole("button", { name: /delete account/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });
});
