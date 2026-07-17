# New-user onboarding redesign — gated, AI-driven setup wizard

**Date:** 2026-05-12
**Author:** Phill (brainstormed with Claude)
**Scope:** Sub-project #1 of a multi-part redesign. Subsequent sub-projects (technician invite flow, BYOK upgrades, platform-wide feature-health telemetry, end-to-end "job close" flow) are flagged at the bottom and handled in separate design cycles.

---

## Context

RestoreAssist is a CRM for Australian water-damage restoration that sells itself as **AI-driven** — "we perform the tasks so the customer doesn't have to". The current first-run reality contradicts that promise:

- The dashboard is **fully accessible the moment a user signs in**. Setup is an *optional* sidebar checklist (`/dashboard/onboarding`, 14 steps).
- Two competing onboarding flows coexist (the 14-step checklist + a 3-step embedded first-run), confusing the surface area.
- Sample data is auto-seeded at `/api/auth/register` so the dashboard is never blank — which hides the fact that *the user hasn't configured anything yet*.
- **Zero AI-driven hydration.** Every field (business name, ABN, ACN, address, logo, brand colours, "about us" copy, pricing) is manual entry into static forms. The marketing promise doesn't show up until much later, if at all.
- No verification that the advertised capabilities (AI report generation, IICRC compliance, photo chain-of-custody, accounting sync, cloud storage) actually work end-to-end for a brand-new tenant.

The redesign converts this into a **hard-gated, single-page setup experience** anchored on the user's ABN. Platform-side Gemma drives parallel hydration jobs that auto-fill business profile, branding, pricing, and integration scaffolding. Setup ends with a real-time **"what we advertise is working"** capability check, then activates the workspace with the user's own branding visible from minute zero.

**Locked-in design constraints (decided during brainstorming, 2026-05-12):**

1. **Hard gate** — dashboard is inaccessible until `Organization.setupCompletedAt != null`.
2. **Admin onboards; technicians invited later** — primary persona is the business owner/admin; invitees get a separate lighter flow (sub-project #2).
3. **Platform Gemma powers hydration** — wizard completes without requiring user BYOK; BYOK is an optional final-section toggle.
4. **ABN-anchored** — single input drives all auto-hydration.
5. **Feature-health card at the end** — proves each advertised capability is wired up for *this* tenant.
6. **Auto-build single-page architecture** — one URL (`/setup`); sections progressively reveal as hydration jobs complete.
7. **Schema migration: business profile moves `User → Organization`** — two-step migration per CLAUDE.md rule #16.

---

## Approach (6 design sections, all approved)

### 1 — Architecture & Gating

- New route: `app/setup/page.tsx` (single page). Delete `/app/dashboard/onboarding/` and `/app/api/onboarding/first-run/` once `/setup` ships. Rename `/api/onboarding/status` → `/api/setup/state`.
- **Middleware gate** (`middleware.ts`): after the existing `needsOnboarding` check, any signed-in user whose primary Organization has `setupCompletedAt = null` AND whose role is `OWNER`/`ADMIN` is redirected to `/setup`. `TECHNICIAN` role → `/onboarding/technician` (out of scope; sub-project #2). Whitelist: `/api/setup/*`, `/api/auth/*`, `/api/cron/*`, `/setup`, webhooks.
- **Page shape:** Server Component shell loads existing Organization + HydrationJob state. Client Components per section subscribe to a Zustand store backed by SSE from `/api/setup/hydrate/stream`. Section states: `pending | running | ready | error | manual`.
- **Schema migration (two-step, rule #16):**
  - Migration A (additive): add to `Organization`: `legalName`, `tradingName`, `abn` (unique nullable), `acn`, `state`, `address`, `phone`, `email`, `website`, `logoUrl`, `primaryColor`, `accentColor`, `aboutCopy`, `tradingStatus` enum (`ACTIVE | PRE_TRADING`), `setupStartedAt`, `setupCompletedAt`, `setupMode` enum (`AI | MANUAL`).
  - Backfill: copy `User.business*` → owning user's `Organization`. Idempotent (re-run safe).
  - Migration B (next major release): drop deprecated `User.business*` columns.
  - `InvoiceTemplate` keeps its own brand fields — propagated from `Organization.brandingDefaults` on Activate but independently editable afterward.
- **Sample data:** stop auto-seeding at `/api/auth/register`. Seed one DRAFT sample report **on Activate** using the user's hydrated profile.

### 2 — Hydration Pipeline (the AI core)

**Inputs we ask for:** ABN (required), website URL (optional).

**Three parallel jobs** dispatched on ABN submit:

| Job | Source | Writes to |
|-----|--------|-----------|
| **A. ABR Lookup** | abr.business.gov.au (registered consumer key, free) | `Organization.{legalName, tradingName, acn, state, address}`, GST/entity-type metadata; cache in new `AbnLookupCache` table (TTL 30d) |
| **B. Website Hydration** | Playwright fetch on user-provided URL | Logo (`<link rel="icon">`, `og:image`, common paths), primary+accent colours (k-means on logo pixels), about copy (Gemma summarises `/about` or hero); writes to `Organization.{logoUrl, primaryColor, accentColor, aboutCopy}` |
| **C. Pricing Defaults** | New static dataset `lib/pricing/defaults-au.ts` keyed by state + entity type | `OrganizationPricingConfig` (renamed from per-user `CompanyPricingConfig`); Gemma adjusts based on business-size signal |

**Status delivery:** single SSE endpoint `/api/setup/hydrate/stream` pushes `{ jobKind, status, payload? }` messages. Client merges into store; sections reveal as state → `ready`.

**New Prisma models:**
- `HydrationJob` — `organizationId`, `kind` (`ABR | WEBSITE | PRICING`), `status`, `payload` (JSON), `errorMessage`, `startedAt`, `completedAt`. Append-only.
- `AbnLookupCache` — `abn` (PK), `payload`, `fetchedAt`, `expiresAt`.

**Cost:** zero per-request beyond infra (model-router routes hydration to Gemma); Playwright budgeted ~3s per scrape on Vercel Node runtime.

### 3 — The five page sections (user-facing layout)

The page is a vertical card-stack. Each card has 5 states (pending / running / ready / error / manual). Sections fade in as their hydration job hits `ready`.

| # | Card | Hydration source | Inline editing |
|---|------|------------------|----------------|
| ① | **Business details** | ABR | legal name, trading names (radio if multiple), ACN, GST status, entity type, address; "Show advanced" expander for phone/email/website override |
| ② | **Your brand** | Website scrape | Logo preview (256px), primary+accent colour swatches, about copy textarea; drag-replace logo, colour pickers |
| ③ | **Your pricing structure** | Static dataset + Gemma adjustment | Compact table (labour 3 levels + top equipment rates + fees + multiplier); "Show all rates" expander for full ~30-field config; "Why these numbers?" tooltip per row |
| ④ | **Cloud storage** | User choice | Three cards: Google Drive (OAuth), OneDrive (disabled "Coming soon"), Keep it local |
| ⑤ | **Connect your existing tools** | User choice | Xero, MYOB, QuickBooks, ServiceM8, Ascora cards; collapsible "BYOK AI keys (optional)" — OpenAI / Anthropic / Gemini |
| ⑥ | **Feature health & Activate** | Real-time checks | (See Section 5 below) |

**Resumability:** wizard is resumable. `Organization.setupStartedAt` set on first ABN entry; jobs continue server-side; closing the tab and returning rehydrates from `Organization` + `HydrationJob`.

### 4 — Errors, fallbacks & edge cases

**ABN failures**
- **Invalid format:** inline validation, no API call.
- **ABR unreachable:** Section ① flips to `manual`. Background job re-tries automatically.
- **ABR "no record":** manual entry + background re-check daily for 7 days.
- **No ABN:** "I don't have an ABN" link → modal with 3 options: (a) link out to register, (b) **Pre-trading mode** — Organization created with `tradingStatus = PRE_TRADING`, invoicing + accounting integrations gated until ABN added, (c) "Help me apply" — captures intent, surfaces application steps in dashboard.

**Website / scrape failures**
- **No URL:** Section ② starts in `manual`.
- **URL invalid/unreachable:** `manual` fallback + note + retry.
- **No logo found:** logo slot empty, colour extraction skipped; user uploads manually.
- **Low-contrast colour pair:** WCAG-AA check; suggest safer accent with surfaced note.
- **About copy junk:** Gemma confidence < threshold → skip auto-fill, prompt user to write.

**Cross-cutting**
- **ABN edit after submit:** confirmation modal; prior field values preserved until new hydration succeeds.
- **Network drop mid-stream:** SSE auto-reconnect; server-authoritative state.
- **Race / dedup:** ABN field debounced 500ms; server uses `(organizationId, kind)` ON-CONFLICT coalescing.
- **Rate limits:** `AbnLookupCache` shields ABR from repeat queries.

**"Skip to manual setup" escape hatch:** small, low-contrast link at the bottom. Click → confirmation modal → all sections flip to manual; tracks `setupMode = MANUAL` for analytics.

### 5 — Activation & feature-health card

**Pre-flight checks** (Section ⑥ row, polled every 5s while visible):

| Capability | Check | Red/Yellow/Green logic |
|---|---|---|
| Business profile complete | required fields populated; ABN valid OR `PRE_TRADING` | [RED] if missing required |
| Branding set | logo + primary colour both non-null | [AMBER] if missing one, [RED] if both |
| Pricing config | labour rates + admin fee set | [RED] if not set |
| AI generation (Gemma) | live 1-line tagline call; check response shape | [RED] on failure |
| Sample report renders | synthesise 2-page DRAFT in-memory (don't write yet) | [RED] on failure |
| Photo chain-of-custody | C2PA manifest generator runs against 1-px test image (rule #21) | [RED] on failure |
| Cloud storage (if connected) | list 1 file via OAuth token | [AMBER] not connected · [RED] broken |
| Accounting integration (if connected) | list 1 contact/customer | [AMBER] not connected · [RED] broken |
| BYOK keys (if entered) | 1-token validate per provider | [AMBER] not entered · [RED] invalid |
| Welcome email | Resend/SES deliverability test | [RED] on rejection |

**Activate button:** disabled while any [RED]; enabled with notice if any [AMBER]; enabled cleanly if all [GREEN].

**`POST /api/setup/activate`** (transactional):
1. Re-run pre-flight checks server-side (defence-in-depth)
2. Propagate `Organization.brandingDefaults → InvoiceTemplate`
3. Seed one sample DRAFT report **plus** an accompanying sample Client (both `isSample = true`, FK linked) using the hydrated business profile so the report can be opened from the dashboard
4. Set `Organization.setupCompletedAt = now()`
5. Write analytics row (`setupMode`, `timeToActivate`, hydration success rate, manual vs automatic per section)
6. Dispatch welcome email rendered with the user's branding
7. Redirect → `/dashboard?firstRun=1` (celebration banner + link to sample report)

**Lifecycle after Activate:** the same capability list lives on as a "Workspace Health" widget at `/dashboard/settings/health` — persistent, refreshed on every settings change. This is the long-tail of the "knowing what we advertise is working" requirement.

### 6 — Testing strategy

- **Unit (Vitest):** ABN checksum; ABR parser (6 fixtures); colour extraction (5 logo fixtures); pricing-defaults lookup (8 states + fallback); hydration state machine
- **Integration (Vitest + Prisma):** `/api/setup/hydrate` job creation; `/api/setup/state` payload composition; `AbnLookupCache` hit/miss; Activate transaction integrity; schema migration backfill idempotency; ON-CONFLICT coalescing
- **E2E (Playwright):** happy path · ABR-unreachable · no-ABN/pre-trading · website-failure · resume (close+reopen) · skip-to-manual · invited-technician gate
- **ABR sandbox:** `ABR_BASE_URL` env switch; CI hits sandbox; fixtures in `lib/integrations/abr/__fixtures__/`
- **Visual regression:** Playwright screenshots — 5 states × 5 sections = 25 baselines
- **Subscription gate regression** (rule #8): TRIAL user with `creditsRemaining = 0` must still complete `/api/setup/hydrate`. **Implementation note:** add a `BYPASS_CREDIT_GATE` flag for Gemma-tier setup hydration calls, scoped to `/api/setup/*` only — verified by an integration test that asserts hydration succeeds on a zero-credit user but `/api/ai/generate-report` still gets blocked.
- **CI gates:** `pnpm type-check` + `pnpm lint` + Vitest + Playwright + visual diffs all green; `npx prisma migrate diff` no drift
- **Verification Gate per `.claude/rules/verification-gate.md`:** real happy-path E2E vs Postgres + ABR sandbox; screenshot of activated dashboard with sample report bearing user's brand colours; Workspace Health widget row-states match Section ⑥ at Activate moment

---

## Critical files (read-only reference)

- `middleware.ts` — gate logic
- `app/api/auth/register/route.ts` — stop seeding sample data here
- `app/dashboard/onboarding/page.tsx` — to be deleted
- `app/api/onboarding/status/route.ts` — to be renamed/rewritten as `/api/setup/state`
- `app/api/onboarding/first-run/route.ts` — to be deleted
- `prisma/schema.prisma` — User, Organization, CompanyPricingConfig, InvoiceTemplate, Integration models
- `lib/ai/model-router.ts` — confirm Gemma routing for setup tasks
- `lib/credential-vault.ts` — AES-256-GCM for any new credential storage
- `app/dashboard/settings/ai-providers/page.tsx` — pattern for BYOK section ⑤
- `app/dashboard/integrations/page.tsx` — pattern for accounting integration cards in section ⑤

## New files (to be created)

- `app/setup/page.tsx`, `app/setup/loading.tsx`
- `app/api/setup/state/route.ts`
- `app/api/setup/hydrate/route.ts` + `app/api/setup/hydrate/stream/route.ts` (SSE)
- `app/api/setup/activate/route.ts`
- `app/api/setup/checks/route.ts` (feature-health pre-flight)
- `lib/integrations/abr/{client.ts,parse.ts,mock.ts}` + `__fixtures__/`
- `lib/branding/{scrape.ts,extract-colors.ts,extract-about.ts}`
- `lib/pricing/defaults-au.ts`
- `lib/setup/{hydration-state-machine.ts,checks.ts}`
- `components/setup/{SetupShell,BusinessDetailsCard,BrandCard,PricingCard,StorageCard,IntegrationsCard,FeatureHealthCard}.tsx`
- New Prisma models: `HydrationJob`, `AbnLookupCache`; rename `CompanyPricingConfig` → `OrganizationPricingConfig`

---

## Verification

1. **Unit + integration tests pass:** `pnpm type-check && npx vitest run`
2. **E2E happy path passes against staging Postgres + ABR sandbox:** `npx playwright test e2e/setup-happy-path.spec.ts`
3. **All 7 E2E scenarios green:** `npx playwright test e2e/setup-*.spec.ts`
4. **Visual baselines unchanged:** Playwright snapshot diff = 0
5. **Schema migration round-trips:** apply Migration A on staging snapshot; backfill; assert Organization rows match expected; re-run migration; no-op
6. **Manual verification (Verification Gate):**
   - Sign up a new test account on staging
   - Enter test ABN (sandbox-known) — confirm Business Details, Branding, Pricing sections all hit `ready` automatically
   - Verify Activate button gates correctly when a check fails (toggle off the welcome-email test transport, confirm [RED] + disabled button)
   - Hit Activate; land on dashboard with `?firstRun=1`; sample report present and branded
   - Visit `/dashboard/settings/health`; confirm row states match the Activate-moment snapshot
7. **No regressions in existing onboarding paths during transition:** middleware whitelist correct; `/api/auth/register` no longer seeds sample data; old onboarding routes return 404 after deletion

---

## Out of scope (separate sub-projects)

These are flagged for follow-up brainstorming cycles after this sub-project ships:

- **Sub-project #2** — invited-technician onboarding flow (`/onboarding/technician`)
- **Sub-project #3** — BYOK upgrade paths (post-setup "upgrade your AI" experience; platform-managed keys for paid plans)
- **Sub-project #4** — platform-wide feature-health telemetry (sysadmin view of feature health across ALL tenants, alerting)
- **Sub-project #5** — end-to-end "sign-in → job close" flow audit (the user's larger framing — beyond setup)
- **Sub-project #6** — **Remotion Explainer Videos** (added 2026-05-12). Generate in-app video walkthroughs for: sign-in flow · sign-up flow · `/setup` wizard end-to-end (ABN → activation) · dashboard tour · first-report walkthrough · integrations + BYOK · workspace health. Embed a video player component inline within each wizard step / dashboard area so customers can self-serve learn the product. `packages/videos/` doesn't exist yet — needs scaffolding. Output destination: `public/videos/` (rendered MP4/WebM) + a `<VideoExplainer slug="setup-abn">` component that surfaces in-context.

---

## Tools used during execution

- `git`, `pnpm`, `npx vitest`, `npx playwright`, `npx prisma migrate`
- Chrome DevTools MCP for /setup UI verification
- ABR sandbox API
- **Cloudinary** for logo storage (matches existing `User.businessLogo` / `InvoiceTemplate.logoUrl` storage; no new asset provider introduced)
