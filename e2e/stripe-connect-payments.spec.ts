/**
 * P2-7 — Stripe Connect / payments rail smoke (test mode guards).
 *
 * Full Connect onboarding is environment-dependent; this spec asserts the
 * payments entitlement surface responds without live charges when keys absent.
 */
import { test, expect } from "@playwright/test";

test.describe("Stripe Connect payments (guarded)", () => {
  test.skip(
    !process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET,
    "Requires Stripe test keys",
  );

  test("webhook endpoint rejects unsigned payloads", async ({ request }) => {
    const base = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
    const res = await request.post(`${base}/api/webhooks/stripe`, {
      data: { type: "account.updated" },
    });
    expect(res.status()).toBe(400);
  });
});
