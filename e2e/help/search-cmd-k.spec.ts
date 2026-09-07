import { test, expect } from "@playwright/test";
import { applySessionCookieFromResponse } from "../helpers/session-cookie";

test("Cmd-K opens search modal and finds a seed article", async ({ page, request, context }) => {
  test.fixme(); // same non-technician seed requirement; HelpSearchModal IS mounted and does bind Cmd-K

  const seed = await request.post("/api/test/seed-trial-user", { data: { daysUntilExpiry: 10 } });
  const { data } = await seed.json();
  // Signing in on `request` alone left `page` unauthenticated: they are
  // SEPARATE cookie jars, so every navigation below landed on /login and the
  // assertions failed as "element(s) not found", which reads like missing
  // content and is not. Same defect billing/webhook-race.spec.ts records.
  // `role` is also required by the helper route (400 without it).
  const signIn = await request.post("/api/test/sign-in-as", {
    // NOTE: the Cmd-K surface itself is NOT missing. HelpSearchModal binds
    // Meta/Ctrl+K (components/help/HelpSearchModal.tsx) and is mounted
    // unconditionally in DashboardShell, and GlobalSearch binds it too.
    // What this spec still lacks is a seeded account whose dashboard reaches
    // the state it asserts. seed-trial-user creates a USER, and asking
    // sign-in-as for a different role against that same email returns 409
    // (role mismatch), so the role cannot simply be raised here.
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
