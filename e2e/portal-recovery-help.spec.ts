/**
 * RA-7551 — client portal recovery + client-specific help at 1280×720.
 *
 * Public /portal/* surfaces only; no contractor dashboard or /login contractor path.
 * Complements unit coverage in portal-recovery-surfaces.test.tsx and the unknown-token smoke.
 */
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

const VIEWPORT = { width: 1280, height: 720 };

test.describe("RA-7551 portal recovery and client help", () => {
  test.use({ viewport: VIEWPORT });

  test("expired job link explains recovery and links to client help, not contractor auth", async ({
    page,
  }) => {
    const res = await page.goto(`/portal/smoke-${randomUUID()}`);
    expect(res, "navigation returned no response").not.toBeNull();
    expect(res!.status()).toBeLessThan(500);

    await expect(
      page.getByRole("heading", { name: /this job link has expired/i }),
    ).toBeVisible();

    const recovery = page.getByRole("link", { name: /request a new invite/i }).first();
    await expect(recovery).toHaveAttribute("href", "/portal/recovery");

    await expect(
      page.getByRole("link", { name: /how job links and accounts work/i }),
    ).toHaveAttribute("href", "/portal/help/access-and-recovery");

    await expect(page.locator('a[href="/login"]')).toHaveCount(0);
    await expect(page.locator('a[href^="/dashboard"]')).toHaveCount(0);
  });

  test("recovery page documents token vs account access and stays on /portal", async ({
    page,
  }) => {
    await page.goto("/portal/recovery");
    await expect(
      page.getByRole("heading", { name: /recover client portal access/i }),
    ).toBeVisible();
    await expect(page.getByText(/job link/i)).toBeVisible();
    await expect(page.getByText(/portal account/i)).toBeVisible();
    await expect(page.locator('a[href^="/dashboard"]')).toHaveCount(0);
  });

  test("client help index covers reports, approvals, invoices — not contractor tools", async ({
    page,
  }) => {
    await page.goto("/portal/help");
    await expect(
      page.getByRole("heading", { name: /client portal help/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/does not cover contractor tools/i),
    ).toBeVisible();

    await expect(
      page.getByRole("link", { name: /job links, portal accounts, and expired access/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /reading restoration reports/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /approving scope and authorities/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /invoices sent to the client/i }),
    ).toBeVisible();

    await expect(page.getByTestId("portal-help-media")).toBeVisible();
  });

  test("access-and-recovery article is readable anonymously with related media", async ({
    page,
  }) => {
    await page.goto("/portal/help/access-and-recovery");
    await expect(
      page.getByRole("heading", {
        name: /job links, portal accounts, and expired access/i,
      }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /^job link$/i })).toBeVisible();
    await expect(
      page.getByText(/never a contractor sign-in screen/i),
    ).toBeVisible();
    await expect(page.getByTestId("portal-help-media")).toBeVisible();
  });

  test("client login surfaces access explainer and client help, not contractor login", async ({
    page,
  }) => {
    await page.goto("/portal/login");
    await expect(
      page.getByRole("heading", { name: /sign in to your portal/i }),
    ).toBeVisible();
    await expect(page.getByText(/job link/i)).toBeVisible();
    await expect(
      page.getByRole("link", { name: /client help — reports, approvals, invoices/i }),
    ).toHaveAttribute("href", "/portal/help");
    await expect(page.locator('a[href="/login"]')).toHaveCount(0);
  });
});
