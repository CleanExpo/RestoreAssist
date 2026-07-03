# Tasks: Billing correctness — safe to take money

> Derives from `plan.md`. Ordered by dependency. Test task precedes its implementation
> task. `[P]` = safe to parallelise (different files, no shared state). Each task ≤ half
> a day, names exact files, ends with a runnable verify command.
>
> **Parallelism map (for build subagents):** after Group A lands, **Group C** (floor-plan)
> and **Group D** (webhook fulfillment) are file-disjoint from A and from each other and
> may run concurrently. **Group B** and **Group E** touch files A edits, so they follow A.
> **Group F** follows D (same webhook file). **Group G** is final verification.
>
> Constitution guards binding every task: auth on every route, webhooks verify signature,
> migrations-only/additive (this cluster ships **zero migrations**), no live-subscription
> mutation (grandfathering C4), vitest not jest, `session.user.id` as identifier.

## Group A — Collapse to one $99 catalog (R1, R2, R3, C3; F1)

- [ ] A1. Test: single-catalog + no-client-price. Assert (a) `PRICING_CONFIG.pricing` has only `monthly` (no `yearly`); (b) `POST /api/create-checkout-session` with a `priceId` not in the allowlist returns 400 and creates no Stripe price/session (mock `stripe`). — files: `lib/__tests__/pricing-integrity.test.ts`, `app/api/create-checkout-session/__tests__/route.test.ts` (new) — verify: `npx vitest run lib/__tests__/pricing-integrity.test.ts app/api/create-checkout-session`
- [ ] A2. Remove `pricing.yearly` + `prices.yearly` from `PRICING_CONFIG`; keep `monthly`/`free`/`addons`. — files: `lib/pricing.ts` — verify: `npx vitest run lib/__tests__/pricing-integrity.test.ts && pnpm type-check`
- [ ] A3. Server price allowlist in create-checkout: reject `priceId` ∉ `{STRIPE_PRICE_MONTHLY}` (400); **delete** the dynamic `stripe.prices.create` fallback (lines ~146-204). — files: `app/api/create-checkout-session/route.ts` — verify: `npx vitest run app/api/create-checkout-session`
- [ ] A4. Delete the tier checkout route + its tests. — files: remove `app/api/billing/checkout/route.ts`, `app/api/billing/checkout/__tests__/` — verify: `test ! -e app/api/billing/checkout/route.ts && pnpm type-check`
- [ ] A5. Re-point the paywall UI to the single $99 plan: replace `TierGrid` 3-tier array with one Monthly card; `CheckoutCTA` POSTs `/api/create-checkout-session {priceId: PRICING_CONFIG.prices.monthly}`; drop the tier cast in `page.tsx`. — files: `app/billing/upgrade/TierGrid.tsx`, `app/billing/upgrade/CheckoutCTA.tsx`, `app/billing/upgrade/page.tsx` — verify: `pnpm type-check && npx vitest run app/billing/upgrade`

**Checkpoint A:** `grep -rn "STANDARD\|PREMIUM\|ENTERPRISE" app/billing/upgrade lib/pricing.ts` returns 0 sell-able hits; `grep -rn "prices.create" app/api/create-checkout-session` returns 0; `pnpm type-check` green; `npx vitest run lib/__tests__/pricing-integrity.test.ts app/api/create-checkout-session app/billing/upgrade` green.

## Group B — Report-limit backward compatibility (R8, R10, F3) · depends: A2

- [ ] B1. Test: grandfathered resolution. Seed ACTIVE users with `subscriptionPlan` = `"Yearly Plan"` → `baseLimit 70`, `"Lifetime"` → `999`, `"Monthly Plan"` → `50`, unknown/null → `50` (never a silent drop). — files: `lib/__tests__/report-limits.grandfathering.test.ts` (new) — verify: `npx vitest run lib/__tests__/report-limits.grandfathering.test.ts`
- [ ] B2. Introduce stable `PLAN_REPORT_LIMITS` (`Lifetime:999, "Yearly Plan":70, "Monthly Plan":50`, default 50); resolve `baseLimit` from it instead of `PRICING_CONFIG.pricing.yearly` (lines ~94-101). — files: `lib/report-limits.ts` — verify: `npx vitest run lib/__tests__/report-limits.grandfathering.test.ts && pnpm type-check`

**Checkpoint B:** `grep -n "PRICING_CONFIG.pricing.yearly" lib/report-limits.ts` returns 0; grandfathering test green; existing `lib/billing/__tests__/*` still green (`npx vitest run lib/billing`).

## Group C — Floor-plan feature hidden pending RA-6922 (R2, F2) · [P] with A/D

- [ ] C1. [P] Test: `hasFloorPlanUnderlay(...)` returns `false` for every input (PREMIUM/ENTERPRISE/STANDARD/null); `POST /api/properties/scrape` returns 402 for a would-be-Premium user. — files: `lib/billing/__tests__/floor-plan-entitlement.test.ts` (update) — verify: `npx vitest run lib/billing/__tests__/floor-plan-entitlement.test.ts`
- [ ] C2. [P] `hasFloorPlanUnderlay` returns `false` (deprecate the tier arg; comment → RA-6922). — files: `lib/billing/floor-plan-entitlement.ts` — verify: `npx vitest run lib/billing/__tests__/floor-plan-entitlement.test.ts`
- [ ] C3. [P] Remove the "Premium feature → /billing/upgrade" upsell block (lines ~303-319); stop rendering `FloorPlanUnderlayLoader` from both editors. — files: `components/sketch/FloorPlanUnderlayLoader.tsx`, `components/sketch/SketchEditor.tsx`, `components/sketch/SketchEditorV2.tsx` — verify: `grep -rn "billing/upgrade" components/sketch` returns 0; `pnpm type-check`
- [ ] C4. [P] Neutralise the tier claim in the feature-gate modal copy. — files: `components/billing/FeatureGateModal.tsx` — verify: `grep -n "PREMIUM and ENTERPRISE" components/billing/FeatureGateModal.tsx` returns 0; `pnpm type-check`

**Checkpoint C:** `grep -rn "PREMIUM\|ENTERPRISE" components/sketch components/billing/FeatureGateModal.tsx` returns 0 sell-able hits; entitlement test green; `pnpm type-check` green.

## Group D — Webhook-side one-time fulfillment + shared idempotency (R4, R5, R6; F4) · [P] with A/C

- [ ] D1. Test: browser-independent + idempotent fulfillment + no-400 PI. (a) synthetic `checkout.session.completed` `mode:"payment"` lifetime → `lifetimeAccess=true`, no verify call; (b) same for addon → `addonReports` credited + `AddonPurchase` row; (c) replay the same event id → applied exactly once (SKIPPED audit / P2002 no-op); (d) `payment_intent.succeeded` with `metadata.type:"addon"` and no `invoiceId` → 2xx. — files: `app/api/webhooks/stripe/__tests__/one-time-fulfillment.test.ts` (new), `app/api/webhooks/stripe/__tests__/payment-intent-succeeded.test.ts` (update) — verify: `npx vitest run app/api/webhooks/stripe`
- [ ] D2. Create shared helper `fulfillLifetimeFromSession(session)` + `fulfillAddonFromSession(session)`: idempotent via `AddonPurchase.stripeSessionId @unique` (addons) and absolute writes (lifetime); returns applied/deduped. — files: `lib/billing/fulfill-one-time.ts` (new) — verify: `npx vitest run app/api/webhooks/stripe && pnpm type-check`
- [ ] D3. Wire `handleCheckoutCompleted`: replace the `mode!=="subscription"` early-return (~397) with lifetime/addon branches calling the helper; keep the existing subscription path. — files: `app/api/webhooks/stripe/route.ts` — verify: `npx vitest run app/api/webhooks/stripe`
- [ ] D4. `payment_intent.succeeded` (R6): return 2xx when `metadata.type ∈ {addon,lifetime}` or `userId` present without `invoiceId`; keep 400 only for genuine invoice PIs. — files: `app/api/webhooks/stripe/route.ts` — verify: `npx vitest run app/api/webhooks/stripe/__tests__/payment-intent-succeeded.test.ts`
- [ ] D5. Delegate the browser verify paths to the shared helper (redundant self-heal). — files: `app/api/verify-subscription/route.ts`, `app/api/addons/verify/route.ts` — verify: `npx vitest run app/api/verify-subscription app/api/addons/verify`

**Checkpoint D:** `npx vitest run app/api/webhooks/stripe app/api/verify-subscription app/api/addons/verify` green; both webhook and verify paths call `fulfill-one-time` (`grep -rln fulfill-one-time app/api`); replaying an event credits exactly once.

## Group E — Double-subscription guard reads Stripe (R7; F4) · depends: A3

- [ ] E1. Test: seed a user whose local `subscriptionStatus` is ACTIVE / TRIAL / PAST_DUE but whose mocked `stripe.subscriptions.list` returns a live `active`/`trialing` sub → new checkout is blocked (409), no `checkout.sessions.create`, response carries the portal URL. — files: `app/api/create-checkout-session/__tests__/route.test.ts` (extend) — verify: `npx vitest run app/api/create-checkout-session`
- [ ] E2. In create-checkout, before session create: `stripe.subscriptions.list({customer, status:"all"})`; if any `active`/`trialing` → 409 `{ error, portalRequired:true, url }` (build URL via the portal route / `billingPortal.sessions.create`). — files: `app/api/create-checkout-session/route.ts` — verify: `npx vitest run app/api/create-checkout-session`

**Checkpoint E:** double-sub test green; manual trace — an ACTIVE subscriber clicking the $99 CTA is routed to `/api/subscription/portal`, no second Stripe subscription created.

## Group F — Scoped refund revocation (R11) · depends: D (same webhook file)

- [ ] F1. Test: `charge.refunded` for a one-time addon charge (no subscription linkage) on a customer with an ACTIVE subscription → `subscriptionStatus` stays ACTIVE; a subscription-invoice charge refund → CANCELED. — files: `app/api/webhooks/stripe/__tests__/charge-refunded.test.ts` (new) — verify: `npx vitest run app/api/webhooks/stripe/__tests__/charge-refunded.test.ts`
- [ ] F2. `charge.refunded` (~313-328): revoke only when the charge is subscription-linked (via `invoice`/`subscription` on the charge); leave status untouched for addon/lifetime charges. — files: `app/api/webhooks/stripe/route.ts` — verify: `npx vitest run app/api/webhooks/stripe`

**Checkpoint F:** `npx vitest run app/api/webhooks/stripe` green including the new refund scoping.

## Group G — Regression guard: GST + auth preserved (R9, R12) · final

- [ ] G1. Test: assert every surviving checkout route creates a Stripe session with `automatic_tax.enabled`, `tax_behavior:"inclusive"`, `tax_id_collection.enabled`, and requires auth (`getServerSession`). — files: `app/api/__tests__/checkout-gst-guard.test.ts` (new) — verify: `npx vitest run app/api/__tests__/checkout-gst-guard.test.ts`
- [ ] G2. Full suite + type + lint. — files: — verify: `pnpm type-check && pnpm lint && npx vitest run`

**Checkpoint G:** `pnpm type-check && pnpm lint && npx vitest run` all green; the deleted tier route no longer appears in any route/test; single-PR diff ready for founder gate.

## Coverage (filled at phase 6 — Analyze)

| Acceptance criterion (spec) | Verifying task/checkpoint |
|---|---|
| AC1 — one catalog, no page offers a removed plan | A1, A2, A5 + Checkpoint A |
| AC2 — no client-set price / no dynamic price | A1, A3 + Checkpoint A |
| AC3 — browser-independent one-time fulfillment | D1, D2, D3 + Checkpoint D |
| AC4 — idempotent fulfillment (deliver twice → once) | D1, D2 + Checkpoint D |
| AC5 — no 400 on legitimate one-time PIs | D1, D4 + Checkpoint D |
| AC6 — no double subscription (ACTIVE → routed to portal) | E1, E2 + Checkpoint E |
| AC7 — entitlement provisioned by payment (limit resolver correct, incl. grandfathered) | B1, B2, D2 + Checkpoints B, D |
| AC8 — GST on every path (incl. previously-bare tier route) | A4 (deletes bare route), G1 + Checkpoint G |
| AC9 — scoped refund revocation | F1, F2 + Checkpoint F |
| F1 — expired trial lands on purchasable $99 CTA | A5 (+ middleware whitelist/redirect verified) + Checkpoint A |
| F2 — floor-plan gated behind RA-6922, CTA hidden | C1-C4 + Checkpoint C |
| F3 — report-limit backward compat, never silent 50 | B1, B2 + Checkpoint B |
| F4 — shared cross-path idempotency + Stripe-list double-sub guard | D2, D5, E1, E2 + Checkpoints D, E |

Orphans found (requirement with no task, task with no requirement): none. Every R1–R12 maps to a task; every task maps to a requirement/finding. R5 is covered by the existing dedupe (verified, not re-built) plus D1/D2 for the new one-time path; R9/R12 are guarded by G1 rather than new feature code (deletion of the bare tier route is the substantive fix).

## Converge log (phase 8 — appended post-implementation)

| Date | Gap found (code vs spec) | Disposition (new task / spec amendment) |
|---|---|---|
