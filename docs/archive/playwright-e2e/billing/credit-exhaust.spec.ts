import { test, expect } from "@playwright/test";
import { applySessionCookieFromResponse } from "../helpers/session-cookie";

test("credit-exhausted event opens CreditExhaustModal", async ({
  page,
  context,
  request,
}) => {
  const seed = await request.post("/api/test/seed-trial-user", { data: { daysUntilExpiry: 10 } });
  const { data } = await seed.json();
  // `request` is a SEPARATE cookie jar from `page`'s browser context, so
  // signing in through it left the page unauthenticated and every navigation
  // below landed on /login. The assertions then failed as "text not found",
  // which reads like missing copy and is not.
  const signIn = await request.post("/api/test/sign-in-as", {
    data: { role: "USER", email: data.email },
  });
  await applySessionCookieFromResponse(context, signIn);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("credit-exhausted")));

  await expect(page.getByText(/out of credits/i)).toBeVisible();
  const upgradeLink = page.getByRole("link", { name: /upgrade plan/i });
  await expect(upgradeLink).toHaveAttribute("href", "/billing/upgrade?reason=credits");
});
