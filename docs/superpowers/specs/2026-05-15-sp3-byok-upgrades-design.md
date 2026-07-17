# SP-3 — Subscription upgrade paths (Trial → Paid → BYOK)

> **Sub-project #3** of the sign-in → job-close audit (SP-5 §15). Primary motion: convert TRIAL users to ACTIVE. Secondary motions (Wave 2): add-BYOK optimisation, add-on credit top-up.

**Status:** brainstormed 2026-05-15 · awaiting Phill spec review → writing-plans handoff.

---

## 1. Context

RestoreAssist already has a rich subscription substrate — Stripe customers, `SubscriptionTier` (STANDARD / PREMIUM / ENTERPRISE), `SubscriptionStatus` (TRIAL / ACTIVE / CANCELED / EXPIRED / PAST_DUE), credit-based `creditsRemaining`, `AiUsageLog`, and a task-based `lib/ai/model-router.ts` that splits work between platform Gemma (basic tasks, ~$0.01/inspection) and BYOK (premium tasks, $0.08-1.10/inspection).

What's missing is the **upgrade journey** — there's no in-app surface that nudges a TRIAL user toward ACTIVE, no hard wall at trial expiry, no BYOK upgrade path post-conversion. The setup wizard (sub-project #1) lets new users start without BYOK; SP-3 builds the on-ramp from "started free" to "paying customer (with optional BYOK)".

**Brief from SP-5 audit:** *"AI keys: [WARN] partial (OpenAI/Anthropic/Gemini fields exist; routing patchy) — SP-3 (existing brainstorm queue)"*. From the onboarding-redesign spec: *"BYOK upgrade paths (post-setup 'upgrade your AI' experience; platform-managed keys for paid plans)"*.

**Coupled decision (this spec also ships):** trial duration drops from 30 days to **15 days** for new signups; existing TRIAL users grandfathered.

---

## 2. Scope

### 2.1 In scope (Wave 1 — Trial → ACTIVE conversion)

- **`/billing/upgrade`** authed conversion surface (new page)
- **Four trigger surfaces:**
  1. `<TrialCountdownBanner>` — top of dashboard, renders when `0 < daysRemaining ≤ 3`
  2. `<CreditExhaustModal>` — fires when any `/api/ai/*` route returns 402 + code `CREDITS_EXHAUSTED`
  3. `<FeatureGateModal>` — wraps premium feature controls; intercepts click on free tier
  4. **Hard-paywall middleware redirect** — `trialExpired && status !== ACTIVE` → `/billing/upgrade?reason=trial-expired`
- **Stripe Checkout subscription mode** (extends existing webhook handler)
- **`SubscriptionEvent` new model** — append-only event log keyed on `stripeEventId @unique` for webhook idempotency + history
- **Trial duration reduction** — 30 → 15 days, centralised in `lib/billing/constants.ts`, grandfather existing TRIAL users
- **Drift fix** — welcome email currently reads `trialDays: 14` while actual trial was 30; align to 15
- **`/billing/success` thin landing** — defensive Stripe-direct retrieve + 30s auto-poll while webhook lands

### 2.2 In scope (Wave 2 — covered by this spec, sequenced after Wave 1)

- **Active → add-BYOK upgrade** — extend `/dashboard/settings/ai-providers` with a "Save 60-80% on premium AI" panel; reuse trigger components
- **Active → add-on credits** — `<BuyCreditsModal>` from credit-exhaust trigger as a sibling CTA to "Upgrade plan"

### 2.3 Out of scope (separate sub-projects / Wave 2.x deferrals)

- Stripe Customer Portal cancellation UX (deferred)
- Tier downgrade flow (deferred)
- `<PaymentFailedBanner>` for PAST_DUE state (deferred)
- Multi-tenancy / per-organisation billing (out of scope)
- Annual plan / discount codes (separate pricing decision)
- SP-6 Email-provider BYOK (own brainstorm)

---

## 3. Approach (locked: Approach A — Unified upgrade page + modular trigger components)

Single authed page `/billing/upgrade` is the canonical conversion surface. Four trigger components funnel here with a `?reason=` query carrying entry state. Middleware enforces the hard wall server-side. `/pricing` stays as the marketing/anonymous surface (unchanged).

Wave 2 BYOK upgrade lives at `/dashboard/settings/ai-providers` and reuses the same trigger components with different copy.

---

## 4. Architecture

### 4.1 Routing topology

```
/billing/upgrade                  ← Wave 1 — authed conversion (NEW)
/billing/success                  ← post-Stripe defensive landing (NEW)
/pricing                          ← unchanged, marketing/anonymous
/dashboard/settings/ai-providers  ← Wave 2 — BYOK upgrade extension
/api/billing/checkout             ← Stripe Checkout session creation (NEW)
/api/billing/trial-status         ← thin wrapper for useTrialStatus hook (NEW)
/api/webhooks/stripe              ← existing; extend with 3 subscription event handlers
```

### 4.2 Middleware enforcement

In `middleware.ts`, after the existing auth + `setupCompletedAt` checks:

```ts
const trialStatus = await getTrialStatus(session.user.id);
if (trialStatus.hasTrialExpired && trialStatus.subscriptionStatus !== "ACTIVE") {
  const whitelist = [
    "/billing/upgrade", "/billing/success",
    "/api/billing", "/api/webhooks/stripe",
    "/api/auth", "/logout", "/pricing",
  ];
  if (!whitelist.some(p => req.nextUrl.pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/billing/upgrade?reason=trial-expired", req.url));
  }
}
```

LIFETIME bypass is implicit (already not in the TRIAL→expired path).

### 4.3 Page composition

```tsx
// /billing/upgrade/page.tsx — Server Component
<UpgradePage>
  <UpgradeHeader reason={searchParams.reason} status={trialStatus} />
  <TierGrid plans={PRICING_CONFIG.pricing} currentTier={user.subscriptionTier} />
  <CheckoutCTA onSelect={…} />
  <FAQAccordion />
</UpgradePage>
```

### 4.4 State hook

`lib/billing/use-trial-status.ts` (client) + `getTrialStatus` (server util, extends existing `lib/trial-handling.ts`):

```ts
type TrialStatus = {
  isTrialActive: boolean;
  hasTrialExpired: boolean;
  daysRemaining: number;
  trialEndsAt: Date | null;
  subscriptionStatus: SubscriptionStatus | null;
  creditsRemaining: number | null;
  showCountdownBanner: boolean;   // 0 < daysRemaining ≤ 3
  showHardWall: boolean;          // expired && not ACTIVE
};
```

Client hook SWR-backed, revalidates every 60s. Multi-tab safe.

---

## 5. Components

### 5.1 New files

| File | Purpose |
|---|---|
| `lib/billing/constants.ts` | `TRIAL_DAYS = 15` · `T_MINUS_BANNER_DAYS = 3` |
| `lib/billing/use-trial-status.ts` | Client SWR hook |
| `components/billing/TrialCountdownBanner.tsx` | Dashboard top, dismissible per session |
| `components/billing/CreditExhaustModal.tsx` | Listens for `credit-exhausted` global event |
| `components/billing/FeatureGateModal.tsx` + `<FeatureGate>` | Wrapper component + modal |
| `app/billing/upgrade/page.tsx` | Server Component |
| `app/billing/upgrade/UpgradeHeader.tsx` | `?reason=`-aware copy |
| `app/billing/upgrade/TierGrid.tsx` | Renders PRICING_CONFIG tiers |
| `app/billing/upgrade/CheckoutCTA.tsx` | POSTs to /api/billing/checkout |
| `app/billing/success/page.tsx` | Defensive Stripe-direct retrieve + 30s poll |
| `app/api/billing/checkout/route.ts` | Creates Stripe Checkout session |
| `app/api/billing/trial-status/route.ts` | Thin wrapper for client hook |

### 5.2 Extended files

| File | Change |
|---|---|
| `lib/trial-handling.ts` | Add `showCountdownBanner` + `showHardWall` derived flags; use `TRIAL_DAYS` constant |
| `lib/auth.ts:327` | Use `TRIAL_DAYS` constant (15) instead of hardcoded 30 |
| `lib/email.ts:884, 925` | Use `TRIAL_DAYS` constant in copy |
| `lib/youtube/metadata.ts:90` | Update marketing string ("15 free reports" — flag for editorial eyeball) |
| `app/api/setup/activate/route.ts:139` | Fix drift: `trialDays: 14` → `trialDays: TRIAL_DAYS` |
| `app/dashboard/layout.tsx` | Mount `<TrialCountdownBanner>` at top |
| `middleware.ts` | Hard-paywall redirect block |
| `app/api/webhooks/stripe/route.ts` | Add 3 handlers: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` |

---

## 6. Data flow

### 6.1 Voluntary mid-trial upgrade (happy path)

1. User clicks "Upgrade" in `<TrialCountdownBanner>`
2. → `/billing/upgrade?reason=voluntary`
3. Server Component reads session + `getTrialStatus` → renders `<TierGrid>`
4. User selects STANDARD → `<CheckoutCTA>` POSTs `/api/billing/checkout {tier:"STANDARD"}`
5. Route handler:
   - `getServerSession`
   - Upsert Stripe Customer by `userId` (idempotent)
   - Create Stripe Checkout session (`mode: "subscription"`, `success_url: /billing/success?session_id={CHECKOUT_SESSION_ID}`, `cancel_url: /billing/upgrade?cancelled=1`, `metadata: { userId, tier }`)
   - Return `{ url }`
6. Browser redirects to Stripe
7. User completes payment with `4242 4242 4242 4242` (or real card)
8. Stripe → `checkout.session.completed` webhook → `/api/webhooks/stripe`
9. Webhook handler:
   - Verify signature
   - Dedupe via `SubscriptionEvent.stripeEventId @unique` upsert (return early if dupe)
   - Load User by `metadata.userId`
   - Update `subscriptionStatus = ACTIVE` + `subscriptionPlan` + `subscriptionId` + `nextBillingDate` + `subscriptionTierId`
   - Write `SubscriptionEvent` row: `eventType: SUBSCRIPTION_ACTIVATED`, `payload: { stripeEvent }`
   - Send welcome-paid email (fire-and-forget per rule #13)
10. Stripe redirects browser → `/billing/success?session_id=cs_xxx`
11. Success page:
    - Read `session_id` query
    - Stripe SDK `checkout.sessions.retrieve(session_id)` (defensive — webhook is truth)
    - If `payment_status === "paid"` AND DB shows `subscriptionStatus !== ACTIVE` → auto-poll DB every 2s for 30s
    - On success → "Welcome to STANDARD" + "Continue to dashboard" CTA
    - On 30s timeout → "If this persists, contact support" with `session_id`
12. Click → `/dashboard` → middleware passes → home

### 6.2 Hard-wall recovery (trial expired user signs in)

1. User logs in (trial expired in their absence)
2. Middleware: `hasTrialExpired && subscriptionStatus !== ACTIVE` → redirect `/billing/upgrade?reason=trial-expired`
3. `<UpgradeHeader>` reads reason → "Your trial has ended" copy
4. Same Checkout flow (steps 4-12 above)

### 6.3 Credit-exhaust mid-task

1. User submits an AI request
2. `/api/ai/*` checks `creditsRemaining === 0` → returns `apiError({ code: "CREDITS_EXHAUSTED", status: 402 })`
3. Client error boundary catches 402 → emits `credit-exhausted` global event (`window.dispatchEvent(new CustomEvent("credit-exhausted"))`)
4. `<CreditExhaustModal>` listens → opens
5. Two CTAs: "Upgrade plan" → `/billing/upgrade?reason=credits` · "Buy 50 more credits" (Wave 2 — deferred but stub link)

### 6.4 Feature-gate intercept

1. User on STANDARD clicks a PREMIUM feature button
2. `<FeatureGate feature="advanced-damage">` wraps the button; reads `user.subscriptionTier.features`
3. Feature not included → onClick intercept → opens `<FeatureGateModal feature="…">`
4. CTA → `/billing/upgrade?reason=feature&feature=advanced-damage`
5. `<UpgradeHeader>` pre-selects PREMIUM tier

### 6.5 Subscription state changes (via webhook)

| Stripe event | Our action |
|---|---|
| `checkout.session.completed` | Flip to ACTIVE, write SubscriptionEvent |
| `customer.subscription.updated` (status=past_due) | Flip to PAST_DUE, write SubscriptionEvent |
| `customer.subscription.deleted` | Flip to CANCELED, write SubscriptionEvent |
| `invoice.payment_failed` | (Wave 2.x) raise PaymentFailedBanner via Notification |

### 6.6 Re-subscribe after cancel

User who cancelled signs back in → middleware redirects → upgrade flow → new Stripe subscription → new `subscriptionId` OVERWRITES old on User. `SubscriptionEvent` preserves the cancel + re-activate history (`SUBSCRIPTION_REACTIVATED` event type).

---

## 7. Trial duration reduction (30 → 15)

### 7.1 Audit

| Site | Today | Change |
|---|---|---|
| `lib/auth.ts:327` | `+ 30 * 24 * 60 * 60 * 1000` (canonical) | use `TRIAL_DAYS` constant |
| `lib/trial-handling.ts:47` | `daysRemaining: 30` (null fallback) | use `TRIAL_DAYS` |
| `app/api/setup/activate/route.ts:139` | `trialDays: 14`  | use `TRIAL_DAYS` (15) — fixes drift |
| `lib/email.ts:884, 925` | parameterised, callsite passes `trialDays` | callsites pass `TRIAL_DAYS` |
| `lib/youtube/metadata.ts:90` | "30 free reports" string | "15 free reports" (editorial eyeball) |
| `app/api/reports/generate-enhanced/route.ts:144` | comment "30-day period" | update comment |

### 7.2 Centralisation

New `lib/billing/constants.ts`:

```ts
export const TRIAL_DAYS = 15;
export const T_MINUS_BANNER_DAYS = 3;
```

All 6 callsites import from here.

### 7.3 Grandfather strategy

**Future-only.** New signups (from PR-merge onward) get 15 days. Existing TRIAL users keep their current `trialEndsAt` (could be up to 30 days out). **Zero migration.** Honors implicit promise made at signup.

---

## 8. Schema deltas

### 8.1 New model

```prisma
model SubscriptionEvent {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  eventType       String   // "SUBSCRIPTION_ACTIVATED" | "SUBSCRIPTION_REACTIVATED" | "TIER_CHANGED" | "CANCELED" | "PAYMENT_FAILED" | "TRIAL_EXPIRED"
  payload         Json?    // Stripe event snapshot, previous/new tier, etc.
  stripeEventId   String?  @unique  // webhook idempotency dedupe
  createdAt       DateTime @default(now())

  @@index([userId, createdAt])
  @@index([eventType])
}
```

Back-relation on `User`: `subscriptionEvents SubscriptionEvent[]`.

### 8.2 No other schema changes

`User.subscriptionStatus`, `subscriptionPlan`, `subscriptionId`, `stripeCustomerId`, `subscriptionTierId`, `creditsRemaining`, `trialEndsAt`, `subscriptionEndsAt`, `nextBillingDate`, `lifetimeAccess`, `subscriptionTier (FK)` — **all already exist**.

`SubscriptionTier`, `PRICING_CONFIG` — **all already exist**.

`AuditLog` — **not extended** (inspectionId non-nullable; SubscriptionEvent is the clean sibling).

### 8.3 Migration

Single additive migration `20260520000000_subscription_event_table`:

```sql
CREATE TABLE "SubscriptionEvent" (
  "id"             TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "eventType"      TEXT NOT NULL,
  "payload"        JSONB,
  "stripeEventId"  TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX "SubscriptionEvent_stripeEventId_key" ON "SubscriptionEvent"("stripeEventId");
CREATE INDEX "SubscriptionEvent_userId_createdAt_idx" ON "SubscriptionEvent"("userId", "createdAt");
CREATE INDEX "SubscriptionEvent_eventType_idx" ON "SubscriptionEvent"("eventType");
```

Additive only. No backfill.

---

## 9. Error handling & edge cases

### 9.1 Webhook reliability

- **Signature verification fails** → 400; Stripe retries with backoff.
- **Webhook delayed >30s** → success page's defensive Stripe SDK retrieve + 2s auto-poll for 30s, then surface support handoff with `session_id`.
- **Webhook arrives twice** → `SubscriptionEvent.stripeEventId @unique` dedupes; second insert is a constraint violation, swallow + log.
- **Webhook arrives before success page** → success page reads from DB; if ACTIVE already, just show confirmation.

### 9.2 Race conditions

- **Concurrent Checkout starts** → `upsert` Stripe Customer on `userId`; idempotent.
- **Multi-tab: convert in A while B on hard paywall** → B's `useTrialStatus` revalidates every 60s; state changes; middleware-protected paths now resolve.
- **User signs out mid-flow** → trigger components check `useSession().status === "authenticated"` before emitting/listening.

### 9.3 Stripe state changes

| Event | Action |
|---|---|
| `customer.subscription.updated` → past_due | Flip to PAST_DUE; existing 402 gate (`["TRIAL","ACTIVE","LIFETIME"]` allowlist) blocks AI calls; hard paywall also covers it |
| `customer.subscription.deleted` | Flip to CANCELED; next sign-in → hard paywall |
| Re-subscribe after cancel | New `subscriptionId` overwrites; SubscriptionEvent preserves history |
| Stripe Checkout session timeout | User returns via cancel_url; no state change; can re-initiate |

### 9.4 Trigger-component edge cases

- **Dismissible banner repeats per session** → `sessionStorage.dismissedTrialBanner`; clears on next sign-in
- **CreditExhaustModal fires from background tab** → modal opens; tab focus may be elsewhere (acceptable; `<Toast>` is a Wave 2.x add)
- **`<FeatureGate>` SSR** → must be `"use client"`; SSR'd locked features show normally but click intercept fires
- **Cancel path** → `/billing/upgrade?cancelled=1` shows subdued "Continue when you're ready" copy (no error tone)

### 9.5 Test/sandbox isolation

- `STRIPE_SECRET_KEY` differs sandbox vs main Vercel envs (sandbox = test mode, main = live)
- Webhook secret separate per env
- E2E uses Stripe test mode with `4242…` card
- CI uses **JSON fixtures** for webhook events (no live Stripe round-trip)

---

## 10. Testing strategy

### 10.1 Unit (Vitest)

| Target | Cases |
|---|---|
| `lib/billing/constants.ts` | 1 — `TRIAL_DAYS === 15` regression guard |
| `lib/trial-handling.ts` (extended) | 6 — active · countdown threshold · expired · ACTIVE-overrides · LIFETIME bypass · null fallback |
| `lib/billing/use-trial-status` server fn | 4 — TRIAL · ACTIVE · PAST_DUE · CANCELED |
| `<TrialCountdownBanner>` | 3 — days=3, days=1, days=0 |
| `<CreditExhaustModal>` | 3 — opens on event · CTA routes · dismiss |
| `<FeatureGateModal>` + `<FeatureGate>` | 5 — free blocks · paid passes · `?feature=` query · SSR · click propagation |
| `<UpgradeHeader>` | 4 — one per `?reason=` value |
| `<TierGrid>` | 3 — 3 tiers rendered · highlights popular · current-plan badge |
| `<CheckoutCTA>` | 2 — POST · redirect on success |

### 10.2 Integration (Vitest + Prisma)

| Target | Cases |
|---|---|
| `/api/billing/checkout` POST | 401 no session · 200 new Customer · 200 existing Customer (idempotent upsert) · 400 invalid tier · 503 Stripe unreachable |
| `/api/billing/trial-status` GET | 200 full TrialStatus shape · 401 |
| Webhook `checkout.session.completed` | Idempotency · writes SubscriptionEvent · flips to ACTIVE · sets nextBillingDate |
| Webhook `customer.subscription.updated` → past_due | Flips PAST_DUE · writes SubscriptionEvent |
| Webhook `customer.subscription.deleted` | Flips CANCELED · writes SubscriptionEvent |
| Middleware enforcement | TRIAL not-expired no redirect · expired+not-ACTIVE redirect · LIFETIME bypass · whitelist paths pass · ACTIVE with expired trialEndsAt no redirect |
| Trial duration migration | New signup gets +15 days · existing TRIAL user with 27 days remaining is unchanged (grandfather) |

### 10.3 E2E (Playwright)

| Spec | Scenario |
|---|---|
| `e2e/billing/voluntary-upgrade.spec.ts` | TRIAL → banner → STANDARD → 4242… → success → dashboard renders |
| `e2e/billing/hard-paywall.spec.ts` | Expired user signs in → redirect → checkout → return → unblocked |
| `e2e/billing/credit-exhaust.spec.ts` | `creditsRemaining=0` → AI call → modal → CTA → `?reason=credits` |
| `e2e/billing/feature-gate.spec.ts` | STANDARD → PREMIUM feature → modal → `?reason=feature&feature=…` → PREMIUM pre-selected |
| `e2e/billing/cancel-flow.spec.ts` | Cancel on Stripe → return `?cancelled=1` → subdued copy |
| `e2e/billing/webhook-race.spec.ts` | Mocked webhook delay → poll → unblock or support handoff |
| `e2e/billing/multi-tab.spec.ts` | Tab A converts; Tab B revalidates within 60s → unblocked |
| `e2e/billing/grandfather.spec.ts` | Seed existing TRIAL user with 27 days remaining; migration didn't shorten |

### 10.4 Test fixtures

- Stripe test mode keys (existing env pattern)
- Card `4242 4242 4242 4242` (succeeds) · `4000 0000 0000 0341` (succeeds then `invoice.payment_failed` for PAST_DUE)
- Webhook events: JSON fixtures replayed via signed payloads (reproducible in CI)
- New test helper: `POST /api/test/seed-trial-user?daysUntilExpiry={N}` (gated by `ALLOW_TEST_HELPERS=true`)

### 10.5 Verification gate (per `.claude/rules/verification-gate.md`)

PR description must include:
- **Where:** Vercel preview URL
- **How to walk it:** seed test accounts via `/api/test/seed-trial-user?daysUntilExpiry={3|0|-1}`; follow each of the 4 trigger paths
- **What to see:** countdown banner at T-3 · hard wall redirect at T-0 · credit-exhaust modal on `creditsRemaining=0` · feature-gate modal on PREMIUM click from STANDARD user · all 4 CTAs land on `/billing/upgrade?reason=...` · `4242…` completes → returns → dashboard renders
- **What NOT to see:** trial-expired user bypassing the wall · grandfathered TRIAL user's `trialEndsAt` shortened · webhook double-write (check SubscriptionEvent unique constraint)
- **Confirmation prompt for Phill**

---

## 11. Linear

10 follow-up tickets to file post-merge:

1. RA-XXXX — Trial 30→15 day reduction (constants + 5 callsites + email drift fix)
2. RA-XXXX — `/billing/upgrade` page + Server Component
3. RA-XXXX — `<TrialCountdownBanner>` mount + sessionStorage dismiss
4. RA-XXXX — `<CreditExhaustModal>` + global event pattern
5. RA-XXXX — `<FeatureGateModal>` + `<FeatureGate>` wrapper
6. RA-XXXX — Middleware hard-paywall + whitelist
7. RA-XXXX — `/api/billing/checkout` Stripe Checkout session
8. RA-XXXX — Stripe webhook handler extension (3 events) + SubscriptionEvent dedupe
9. RA-XXXX — `SubscriptionEvent` Prisma model + migration
10. RA-XXXX — 8 E2E specs + `/api/test/seed-trial-user` helper

---

## 12. Out of scope (this spec)

- **Stripe Customer Portal cancellation UX** (Wave 2.x)
- **Tier downgrade flow** (Wave 2.x)
- **`<PaymentFailedBanner>`** for PAST_DUE state (Wave 2.x)
- **Per-organisation billing** (out of scope; users are still individual subscribers)
- **Annual plan / discount codes** (separate pricing decision; not technical)
- **SP-6 Email-provider BYOK** (own brainstorm)
- **Add-on credit top-up modal** (Wave 2 of THIS spec, sequenced after Wave 1)
- **Active → add-BYOK extension on `/dashboard/settings/ai-providers`** (Wave 2 of THIS spec)

---

## 13. Tools used during execution

- `git`, `pnpm`, `npx vitest`, `npx playwright`, `npx prisma migrate`
- Stripe CLI for local webhook testing
- Chrome DevTools MCP for `/billing/upgrade` UI verification
- Existing env pattern for Stripe sandbox vs live keys

---

## 14. Post-approval handoff

After Phill approves this spec:

1. Spec lives at `docs/superpowers/specs/2026-05-15-sp3-byok-upgrades-design.md` (this file)
2. Invoke `superpowers:writing-plans` skill to produce the implementation plan at `docs/superpowers/plans/2026-05-15-sp3-trial-paid-upgrades.md`
3. Plan execution can use `superpowers:subagent-driven-development` (parallel slot-friendly given the trigger components are independent files)

No implementation actions are authorised before that handoff completes.
