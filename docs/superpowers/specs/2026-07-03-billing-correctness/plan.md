# Plan: Billing correctness — safe to take money

> Derives from `spec.md` — every section maps to a requirement there; cite it (R#).
> Resolves judge findings F1–F4 concretely (see each Tech-decision row + the F-tagged
> touch-points). Adopts clarifications C1 (collapse to $99 base), C2 (keep Monthly-Plan
> 50-report entitlement as-is), C3 (retire Yearly $1188), C4 (grandfather live subscribers).

## Tech decisions

| Decision | Choice | Rationale (cite constitution rule / spec R# / research) |
|---|---|---|
| Single source-of-truth catalog | Collapse to the **$99/month "Monthly Plan"** already in `PRICING_CONFIG.pricing.monthly`; remove `pricing.yearly` + `prices.yearly`; retire the STANDARD/PREMIUM/ENTERPRISE tier catalog. | R1, R2, C1, C3. `PRICING_CONFIG.pricing` is the only catalog the public + dashboard pages iterate [VERIFIED app/pricing/page.tsx:54, app/dashboard/pricing/page.tsx:84], so deleting `yearly` collapses both to one card automatically. The tier catalog is a hard-coded array with no server source [VERIFIED app/billing/upgrade/TierGrid.tsx:14-34]. |
| Retire tiers **without a schema drop** | Delete tier catalog DATA + the tier `billing/checkout` route + the tier UI; **keep** `SubscriptionTier` model, `SubscriptionTierLevel` enum, and the `subscriptionTierId` column as an inert nullable field. | R2, CLAUDE.md rule 4 (migrations only, additive; no destructive drops). The model + enum are load-bearing for the interview subsystem [VERIFIED prisma/schema.prisma:196,199-200,3781-3801; app/api/forms/interview/start/route.ts:39,90]. Dropping them would break interview; the constitution forbids the destructive migration anyway. An unwritten nullable column is harmless. |
| F1 — keep `/billing/upgrade` alive | Keep the route + middleware whitelist + redirect target; re-point its CTA from the tier grid to the single $99 checkout. | F1, R1, R12. Middleware redirects expired trials to `/billing/upgrade?reason=trial-expired` [VERIFIED middleware.ts:225] and whitelists `/billing/upgrade` + `/api/billing` from the hard paywall [VERIFIED middleware.ts:103-115,221-228]. Retiring the route would strand every expired-trial user on a 404. |
| F2 — floor-plan access after tier deletion | Gate behind the future RA-6922 add-on; **hide the CTA now**. `hasFloorPlanUnderlay` returns `false` (no entitlement source until RA-6922), server keeps its fail-closed 402, the client "Premium" upsell + panel are hidden. | F2, spec Non-goal (RA-6922 is the add-on layer, out of scope). The gate reads `subscriptionTier.tierName` which **no path writes** [VERIFIED app/api/properties/scrape/route.ts:183; grep subscriptionTierId writes = 0], so the feature is already unreachable for every user — this makes that explicit and stops selling a nonexistent "Premium" plan [VERIFIED components/sketch/FloorPlanUnderlayLoader.tsx:303-319]. |
| F3 — report-limit backward compatibility | Decouple the 70/999 constants from the retired `pricing.yearly` object into a stable, self-contained `PLAN_REPORT_LIMITS` map (`"Lifetime"→999`, `"Yearly Plan"→70`, `"Monthly Plan"/default→50`). Grandfathered strings still resolve; never a silent drop to 50. | F3, R8, R10, C4. Today the resolver reads `PRICING_CONFIG.pricing.yearly` [VERIFIED lib/report-limits.ts:97-99]; deleting `yearly` (Tech-decision 1) would make that `undefined` and silently drop grandfathered Yearly users to 50. A stable map survives the catalog collapse. |
| F4 — cross-path one-time fulfillment + shared marker | Extract `lib/billing/fulfill-one-time.ts` (lifetime + addon), called by BOTH the webhook `checkout.session.completed` handler AND the browser verify endpoints. Idempotency marker = existing `AddonPurchase.stripeSessionId @unique` for addons; lifetime writes are absolute (idempotent by construction). No new table. | F4, R4, R5. `withIdempotency` keys on the request header per-user [VERIFIED lib/idempotency.ts:107-108,322-324] — it does NOT dedupe a Stripe session across the two paths. `AddonPurchase.stripeSessionId` IS a shared cross-path marker [VERIFIED app/api/addons/verify/route.ts:145,157]. |
| F4 — double-subscription guard reads Stripe, not local state | Before creating a subscription checkout, call `stripe.subscriptions.list({ customer, status: "all" })`; if a live `active`/`trialing` subscription exists, return a 409 routing the user to `/api/subscription/portal`. | F4, R7. Local `subscriptionStatus` drifts (the incident behind the reconcile script, spec Risks); a TRIAL/PAST_DUE row can still have a live Stripe sub. Portal route already exists [VERIFIED app/api/subscription/portal/route.ts:16-61]. |
| R3 — kill client-set + dynamic prices | Server validates `priceId` against a fixed allowlist (`STRIPE_PRICE_MONTHLY`); remove the `stripe.prices.create` dynamic fallback entirely; reject unknown ids 400. | R3, AC2. Today the client `priceId` is passed straight to Stripe and any id containing `MONTHLY`/`YEARLY` triggers a dynamic price create [VERIFIED app/api/create-checkout-session/route.ts:74,146-200]. |
| R6 — one-time PIs must not 400 | In `payment_intent.succeeded`, treat a PI carrying `metadata.type ∈ {addon,lifetime}` (or `userId` without `invoiceId`) as a one-time-product payment → return 2xx (fulfilled via `checkout.session.completed`), reserving the 400 for genuine RestoreAssist-invoice PIs. | R6, AC5. Today any PI without `invoiceId` returns 400 → Stripe retry-loop [VERIFIED app/api/webhooks/stripe/route.ts:209-222]. |
| R11 — scoped refund revocation | In `charge.refunded`, only set `CANCELED` when the refunded charge is linked to a subscription invoice; a one-time addon/lifetime charge refund leaves `subscriptionStatus` untouched. | R11, AC9. Today it matches on `customer` only [VERIFIED app/api/webhooks/stripe/route.ts:313-328]. |
| R9 — GST on every remaining path | No new GST code: deleting the bare tier `billing/checkout` route removes the only GST-less checkout; the three surviving paths already carry `automatic_tax` + `tax_behavior:"inclusive"` + `tax_id_collection`. | R9, AC8, CLAUDE.md rule 13. Present on create-checkout-session/checkout-lifetime/addons [VERIFIED create-checkout-session:142-144, checkout-lifetime:130-132, addons/checkout:188-190]; absent only on the tier route we delete [VERIFIED app/api/billing/checkout/route.ts:87-95]. |
| Test runner | `vitest` (not jest); synthetic Stripe events fired at exported handlers. | RestoreAssist CI gate (vitest); existing pattern [VERIFIED vitest.config.js; app/api/webhooks/stripe/__tests__/checkout-completed.test.ts]. |

## Architecture touch-points

Every file to create/modify, each `[VERIFIED]` by reading it first:

| File | Change | Serves | Evidence |
|---|---|---|---|
| `lib/pricing.ts` | Remove `pricing.yearly` and `prices.yearly`; keep `monthly`, `free`, `addons`. | R1, C3 | [VERIFIED lib/pricing.ts:47-96] two SKUs today |
| `app/api/create-checkout-session/route.ts` | Add server price allowlist (reject client `priceId` ∉ allowlist, 400); DELETE dynamic `prices.create` fallback (146-204); add Stripe-list double-sub guard → 409 with portal URL. | R3, R7, F4, AC2, AC6 | [VERIFIED :74,120-204] |
| `app/api/billing/checkout/route.ts` | **DELETE** the tier checkout route (+ its `__tests__`). | R1, R2, F1, AC1 | [VERIFIED whole file: STANDARD/PREMIUM/ENTERPRISE, no GST] |
| `app/billing/upgrade/TierGrid.tsx` | Replace the 3-tier grid with a single $99 Monthly plan card. | R1, R2, F1, AC1 | [VERIFIED :14-34 DEFAULT_TIERS] |
| `app/billing/upgrade/CheckoutCTA.tsx` | Re-point `fetch` from `/api/billing/checkout {tier}` to `/api/create-checkout-session {priceId: monthly}`. | R1, F1 | [VERIFIED :13-20] |
| `app/billing/upgrade/page.tsx` | Drop the `subscriptionPlan`→tier cast (36-39); render the single-plan CTA. | R1, R2, F1 | [VERIFIED :30-49] |
| `middleware.ts` | No code change; **verify** whitelist (103-111) + redirect (225) still deliver an expired-trial user to a purchasable $99 CTA (covered by a test, not an edit). | R12, F1 | [VERIFIED :103-115,221-228] |
| `lib/report-limits.ts` | Introduce stable `PLAN_REPORT_LIMITS` map; resolve limits from it instead of `PRICING_CONFIG.pricing.yearly` (94-99); grandfathered `"Yearly Plan"→70` / `"Lifetime"→999` preserved. | R8, R10, F3, AC7 | [VERIFIED :94-101] |
| `lib/billing/floor-plan-entitlement.ts` | `hasFloorPlanUnderlay` returns `false` (no entitlement source until RA-6922); mark tier arg deprecated. | R2, F2 | [VERIFIED :14-23] |
| `app/api/properties/scrape/route.ts` | No logic change — keep the fail-closed 402 (now always closed). Verify only. | R2, F2 | [VERIFIED :179-189] |
| `components/sketch/FloorPlanUnderlayLoader.tsx` | Remove the "Premium feature → /billing/upgrade" upsell block (303-319); render nothing when unentitled. | F2 | [VERIFIED :303-319] |
| `components/sketch/SketchEditor.tsx` · `SketchEditorV2.tsx` | Stop rendering `FloorPlanUnderlayLoader` (feature hidden). | F2 | [VERIFIED SketchEditor.tsx:710; SketchEditorV2.tsx:1416] |
| `components/billing/FeatureGateModal.tsx` | Neutralise the "included in PREMIUM and ENTERPRISE plans" dead-sell copy. | F2 | [VERIFIED :15-17] |
| `app/api/webhooks/stripe/route.ts` | (a) `handleCheckoutCompleted`: replace the `mode!=="subscription"` early-return (397) with lifetime/addon fulfillment via the shared helper; (b) `payment_intent.succeeded`: 2xx for one-time PIs (209-222); (c) `charge.refunded`: subscription-scoped revocation (313-328). | R4, R5, R6, R11, AC3-5, AC9 | [VERIFIED :200-222,313-328,395-397] |
| `lib/billing/fulfill-one-time.ts` | **NEW** — `fulfillLifetimeFromSession(session)` + `fulfillAddonFromSession(session)`; idempotent (AddonPurchase unique marker; absolute lifetime writes). Single source both paths call. | R4, F4, AC3-4 | new; mirrors [VERIFIED verify-subscription:98-118; addons/verify:146-184] |
| `app/api/verify-subscription/route.ts` | Lifetime branch delegates to `fulfillLifetimeFromSession` (redundant self-heal, not primary). | R4, F4 | [VERIFIED :93-118] |
| `app/api/addons/verify/route.ts` | Addon branch delegates to `fulfillAddonFromSession`. | R4, F4 | [VERIFIED :137-184] |
| `lib/__tests__/pricing-integrity.test.ts` | Update assertions for the single-SKU catalog (yearly removed). | R1 | [VERIFIED exists] |
| `lib/billing/__tests__/floor-plan-entitlement.test.ts` | Update for `false`-always entitlement. | F2 | [VERIFIED exists] |

## Data model deltas

**None.** This cluster ships with **zero schema migrations**:

- The retired tier catalog is code/data only; `SubscriptionTier`, `SubscriptionTierLevel`, and `User.subscriptionTierId` stay (interview-coupled + additive-only rule). The column is left inert and nullable — no write path, no read after F2 — which is CLAUDE.md-rule-4-compliant (no destructive drop).
- One-time fulfillment reuses existing fields/tables: `AddonPurchase` (with its `stripeSessionId @unique` cross-path marker) [VERIFIED schema.prisma:1592, addons/verify:145,157], `User.lifetimeAccess`/`subscriptionStatus`/`subscriptionPlan`/`addonReports` [VERIFIED schema.prisma:108-126]. No new columns → **no RLS obligation (RA-6677) triggered**.
- **Migration-safety story:** nothing to migrate; deploy = code deploy. No two-step renames, no index builds, no locking. Rollback = revert the PR (Rollout below).

## API contracts

- **`DELETE` `POST /api/billing/checkout`** — route removed. The expired-trial paywall now checks out via the canonical route below. (Middleware `/api/billing` whitelist entry becomes moot but is left in place — harmless.)
- **`POST /api/create-checkout-session`** — unchanged auth (`getServerSession`), CSRF, rate-limit, idempotency [VERIFIED :19-42]. New behaviour: `priceId` MUST be in the server allowlist (`{ STRIPE_PRICE_MONTHLY }`), else `400 { error }`. If `stripe.subscriptions.list` shows a live `active`/`trialing` sub → `409 { error, portalRequired: true, url }` (url from the portal route). Success shape unchanged (`{ sessionId, url, customerId }`). No dynamic price creation.
- **`POST /api/webhooks/stripe`** — unchanged signature verify + event dedupe [VERIFIED :47-115]. `checkout.session.completed` now additionally fulfils `mode:"payment"` lifetime/addon sessions; `payment_intent.succeeded` returns 2xx for one-time PIs; `charge.refunded` revokes only subscription-linked charges. Response idiom `{ received: true }` preserved.
- **`POST /api/verify-subscription`**, **`POST /api/addons/verify`** — same auth + idempotency wrapper; internally delegate to the shared fulfillment helper. Response shapes unchanged. They remain as redundant self-heal, not the primary fulfillment path.

## Rollout & reversibility

- **One PR, founder-gated** (adopted clarifications C1–C4 confirmed at PR review). No feature flag, no env var added (see Explicitly rejected).
- **No migration** → deploy order is trivial (code only); no migrate-before/after-deploy sequencing.
- **Grandfathering (C4):** the change mutates **no live subscription rows**. Legacy `subscriptionPlan` strings (`"Monthly Plan"`, `"Yearly Plan"`, `"Lifetime"`) keep resolving via `PLAN_REPORT_LIMITS`; only *new* checkouts use the collapsed catalog. Existing Stripe subscriptions (including any on a retired tier price) continue billing untouched.
- **One-step rollback:** `git revert` the PR. Because there is no schema change and the webhook additions are idempotent + additive (they never remove the browser self-heal), reverting cannot strand data. During rollout the verify endpoints remain the redundant path, so a webhook-fulfillment regression self-heals on the next success-page load.
- **Env dependency:** `STRIPE_PRICE_MONTHLY` must be a real `price_…` id (the allowlist fails closed if unset, matching the existing tier-route guard pattern [VERIFIED app/api/billing/checkout/route.ts:25-29]).

## Explicitly rejected (over-engineering guard)

- **A new `ProcessedCheckoutSession` idempotency table.** F4 is satisfied by the existing `AddonPurchase.stripeSessionId @unique` marker (addons) + absolute lifetime writes; a new table would trigger the RLS obligation and add schema surface the spec doesn't need. [VERIFIED addons/verify:145,157]
- **Dropping `SubscriptionTier` / `subscriptionTierId`.** Interview-coupled + destructive-migration-gated; leaving the column inert is simpler and rule-4-compliant.
- **A `FLOOR_PLAN_UNDERLAY_ENABLED` env flag.** F2 says hide now, gate behind RA-6922 later; a runtime flag is unrequired ceremony — a `false` return + hidden CTA is the whole ask.
- **Building the five $11 add-ons / `FeatureEntitlement` / `requireAddon()`.** Explicit Non-goal (RA-6922).
- **A discounted annual SKU.** C3 retires Yearly; "a real discounted annual can return later" — not this cluster.
- **Migrating grandfathered users to stable plan IDs.** C2 keeps the Monthly-Plan entitlement as-is; the stable-map resolver is enough — a data backfill is out of scope and risks live rows.
- **Wiring the reconcile cron.** Spec lists it as an explicit tracked follow-up, not a blocker; the webhook-side fulfillment (R4) removes the primary silent-loss vector.

## Research notes

- **Two catalogs confirmed divergent at the code level:** `PRICING_CONFIG` sells Monthly $99 / Yearly $1188 [VERIFIED lib/pricing.ts:54-96]; `TierGrid` sells STANDARD/PREMIUM/ENTERPRISE against `STRIPE_PRICE_*` env [VERIFIED TierGrid.tsx:14-34, app/api/billing/checkout/route.ts:15-31]. Public + dashboard pages iterate `PRICING_CONFIG.pricing` [VERIFIED app/pricing/page.tsx:54, app/dashboard/pricing/page.tsx:84], so removing `yearly` collapses them with no per-page edit.
- **`subscriptionTierId` has zero writers** — the floor-plan gate reads `subscriptionTier.tierName` which is never populated [VERIFIED app/api/properties/scrape/route.ts:183], so the Premium feature is already unreachable; F2 formalises that.
- **`withIdempotency` is header-scoped, per-user** [VERIFIED lib/idempotency.ts:26-30,107-108,322-324] — it cannot dedupe a Stripe session across the webhook and browser paths, which is exactly why F4 needs a session-keyed marker; `AddonPurchase.stripeSessionId @unique` already is one.
- **Webhook already has robust dedupe** (`StripeWebhookEvent` unique insert + `recordSubscriptionEvent`) [VERIFIED webhooks/stripe/route.ts:80-115,426-437], so the new one-time fulfillment inherits replay-safety for the webhook path; the cross-path guarantee comes from the shared marker.
- **Lifetime is `subscriptionStatus=ACTIVE` + `lifetimeAccess=true` + `subscriptionPlan="Lifetime"`**, not an enum value [VERIFIED verify-subscription:98-109; schema.prisma:108-126] — the collapsed catalog + resolver preserve this representation.
- **All existing billing tests are vitest** and fire synthetic events at exported handlers [VERIFIED app/api/webhooks/stripe/__tests__/checkout-completed.test.ts] — the new fulfillment/refund/PI tests follow the same harness.
