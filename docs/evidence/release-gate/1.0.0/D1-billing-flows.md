---
criterion: D1-billing-flows
status: deferred
verified: 2026-05-28
tracking_ticket: RA-5628
---

# D1 - Billing Flows (5 pts)

**Status:** DEFERRED
**Tracking:** RA-5628
**Verified by:** Codex release-gate PM sweep

## Criterion

Stripe and Apple IAP sandbox purchase, renewal, and cancellation flows are verified with current evidence.

## Current Evidence

Machine billing coverage is green through `D2-paywall-tests`:

```bash
npx vitest run lib/billing/__tests__/ app/api/webhooks/stripe/__tests__/
```

Latest clean audit on `origin/main@10452554` passed: 4 files passed, 3 skipped; 23 tests passed, 8 skipped.

That proves code-level billing/webhook behaviour, but it does not prove a live owner-run purchase, renewal, and cancellation journey.

## Scope correction: Apple IAP is NOT APPLICABLE (read this first)

The criterion text says "Stripe **and Apple IAP**". **RestoreAssist does not ship Apple In-App Purchase**, so there is no Apple IAP sandbox flow to walk. This is a deliberate, locked product decision, not a gap:

- `lib/ios-billing-guard.ts:1-22` - RA-1842 "Path B", locked 2026-05-02 after App Review rejected build 1.0(3) on guideline 3.1.1. The decision: **keep iOS free, sell only on the website.**
- Every billing/checkout/subscription route calls `rejectIfIOSCapacitor()` and returns **403** when the request carries `X-Capacitor-Platform: ios`. See `app/api/create-checkout-session/route.ts:24-26`.
- There is no StoreKit, no RevenueCat, and no IAP product in the repo.

**What this means for you:** walk **Stripe only** (Part A below), then tick the one-line Apple scope-out in Part B. Do not go looking for an IAP sandbox purchase - there isn't one, and hunting for it is the single biggest time sink in this item.

## Part A - Stripe walk script (about 15 minutes)

There is exactly **one** purchasable product: the **$99 Monthly Plan**, held in `STRIPE_PRICE_MONTHLY`. The checkout route enforces a server-side allowlist of that single price ID (`app/api/create-checkout-session/route.ts:18-20`), so there is nothing else to test.

Do this in **Stripe test mode** against the **sandbox** app. Never run this against prod Stripe.

- Sandbox app: **https://restoreassist-sandbox.vercel.app**
- Stripe test dashboard: **https://dashboard.stripe.com/test/dashboard**
- Test card: **4242 4242 4242 4242**, any future expiry, any CVC, any postcode.

### A1. Purchase (about 4 min)

1. Open **https://restoreassist-sandbox.vercel.app/pricing** in a normal desktop browser (not the iOS app - iOS is 403 by design).
2. Sign in, or register a throwaway account. Record the email you used.
3. Click the Monthly Plan buy button. You should land on a Stripe Checkout page for the $99 monthly price.
4. Pay with `4242 4242 4242 4242`.
5. Confirm you are returned to the app and the account now shows an active subscription (**https://restoreassist-sandbox.vercel.app/dashboard/billing**).
6. Open **https://dashboard.stripe.com/test/customers**, find the customer by that email, and record the **subscription ID** (`sub_...`) and **customer ID** (`cus_...`).

### A2. Renewal (about 6 min - use a test clock, do not wait a month)

1. Open **https://dashboard.stripe.com/test/test-clocks** and click **New test clock**. Set the start time to today.
2. Create a customer **on that clock**, then create a subscription for that customer on the same $99 monthly price (Stripe's UI walks this; the clock customer is separate from the A1 customer - that is expected).
3. Advance the clock by **1 month** and wait for it to finish processing.
4. Confirm a second `invoice.payment_succeeded` fires for that subscription and the subscription is still `active`. Check **https://dashboard.stripe.com/test/events** and filter by that `sub_...`.
5. Record the two invoice IDs (`in_...`) - the original and the renewal.

### A3. Cancellation (about 3 min)

1. Back in the sandbox app as the A1 user, go to **https://restoreassist-sandbox.vercel.app/dashboard/billing** and cancel the subscription.
2. Confirm the app's entitlement state flips (paid features gated again, or the plan shows as cancelling at period end - record which behaviour you see).
3. In **https://dashboard.stripe.com/test/customers**, confirm the subscription now shows `canceled` or `cancel_at_period_end: true`.

### A4. Webhooks landed (about 2 min)

1. Open **https://dashboard.stripe.com/test/webhooks** and select the endpoint pointing at the sandbox host.
2. Confirm the events from A1-A3 show **HTTP 200** delivery, not failures or retries.
3. Note the count of failed deliveries in the last 24 hours. It should be **0**.

## Part B - Capture checklist

Fill every row. A blank cell means the item is not verified.

| # | Item | Value to record | Captured |
|---|---|---|---|
| 1 | Date and time of the walk (with timezone) | | |
| 2 | Environment | `restoreassist-sandbox.vercel.app` + Stripe **test** mode | |
| 3 | Test account email used | | |
| 4 | A1 purchase: `cus_...` / `sub_...` | | |
| 5 | A1 purchase: app shows active subscription (yes/no) | | |
| 6 | A2 renewal: test clock ID | | |
| 7 | A2 renewal: original + renewal invoice IDs (`in_...`) | | |
| 8 | A2 renewal: subscription still `active` after clock advance (yes/no) | | |
| 9 | A3 cancellation: observed app entitlement behaviour | | |
| 10 | A3 cancellation: Stripe state (`canceled` or `cancel_at_period_end`) | | |
| 11 | A4 webhooks: all events HTTP 200 (yes/no); failed deliveries in 24h | | |
| 12 | Apple IAP scope-out acknowledged (Path B, RA-1842) - initial here | | |
| 13 | Screenshot links or filenames for A1, A2, A3 | | |

<!-- PASTE EVIDENCE HERE: the completed table above, plus any screenshot links -->

## PM Decision

Keep this criterion fail-closed until owner evidence is attached. Do not use unit/webhook tests alone as ship approval for paying-customer readiness.

To mark PASS: set frontmatter `status: pass` and `verified: <YYYY-MM-DD>` **only after** the table above is filled in with real values. Commit the same day - the scorer requires the file mtime to be within 14 days.
