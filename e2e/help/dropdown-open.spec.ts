import { test, expect } from "@playwright/test";
import { applySessionCookieFromResponse } from "../helpers/session-cookie";

test("Help dropdown opens and lists 8 categories", async ({ page, request, context }) => {
  test.fixme(); // needs a NON-technician seed: DashboardShell renders HowToDropdown only when role !== USER, and seed-trial-user creates a USER

  // Seed any active user (the dropdown is universal)
  const seed = await request.post("/api/test/seed-trial-user", { data: { daysUntilExpiry: 10 } });
  const { data } = await seed.json();
  // Signing in on `request` alone left `page` unauthenticated: they are
  // SEPARATE cookie jars, so every navigation below landed on /login and the
  // assertions failed as "element(s) not found", which reads like missing
  // content and is not. Same defect billing/webhook-race.spec.ts records.
  // `role` is also required by the helper route (400 without it).
  const signIn = await request.post("/api/test/sign-in-as", {
    // NOTE: this spec cannot pass with the account seed-trial-user
    // creates. DashboardShell derives
    // `isTechnician = session?.user?.role === "USER"` and renders the How To
    // dropdown as `{!isTechnician && <HowToDropdown />}`, so a USER-role
    // account never sees it. seed-trial-user creates a USER, and asking
    // sign-in-as for MANAGER against that same email returns 409 (role
    // mismatch), so the role cannot simply be raised here. It needs a
    // non-technician seed. The spec comment calling the dropdown
    // "universal" is wrong; the component is mounted, just role-gated.
    data: { role: "USER", email: data.email },
  });
  await applySessionCookieFromResponse(context, signIn);

  await page.goto("/dashboard");
  await page.getByRole("button", { name: /how to/i }).click();

  await expect(page.getByText(/getting started/i)).toBeVisible();
  await expect(page.getByText(/inspections/i)).toBeVisible();
  await expect(page.getByText(/reports/i)).toBeVisible();
  await expect(page.getByText(/clients & portal/i)).toBeVisible();
  await expect(page.getByText(/billing/i)).toBeVisible();
  await expect(page.getByText(/team/i)).toBeVisible();
  await expect(page.getByText(/integrations/i)).toBeVisible();
  await expect(page.getByText(/compliance/i)).toBeVisible();
});
