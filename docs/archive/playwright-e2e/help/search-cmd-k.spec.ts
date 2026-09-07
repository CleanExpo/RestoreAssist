import { test, expect } from "@playwright/test";
import { applySessionCookieFromResponse } from "../helpers/session-cookie";

test("Cmd-K opens search modal and finds a seed article", async ({ page, request, context }) => {
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
  await page.keyboard.press("Meta+k");

  const input = page.getByPlaceholder(/search/i);
  await expect(input).toBeVisible();
  await input.fill("photo");

  await expect(page.getByText(/photo chain-of-custody/i)).toBeVisible({ timeout: 5_000 });
});
