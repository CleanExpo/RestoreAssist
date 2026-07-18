# RestoreAssist — Gap Audit: Missing Connections, False Promises & Missing Media

Generated: 2026-06-09
Scope: read-only audit of the shipped Next.js 15 App Router app. No files were edited, no
builds/servers run, no production resources touched. The 583 unrelated markdown-reformatting
changes in the working tree at audit time were ignored.

Method: three parallel evidence-based sweeps — (1) false promises (UI claims vs implementation),
(2) missing connections (broken links, stub integrations, undocumented env), (3) missing media
(asset references absent on disk). 171 page routes and ~400 API routes were enumerated; all static
and template `href`/`router.push`/`redirect` targets were cross-checked against real routes;
`process.env.*` usage was diffed against `.env.example`; every local media reference was checked
against disk with `test -f`.

## Executive summary

| Category                               | High | Medium | Low | Total |
| -------------------------------------- | ---: | -----: | --: | ----: |
| False promises (UI vs reality)         |    3 |      4 |   2 |     9 |
| Missing connections (wiring/stubs/env) |    3 |      8 |   7 |    18 |
| Missing media & promo                  |    1 |      3 |   0 |     4 |

Internal navigation wiring is **fully intact** — no broken `<Link>`/`router.push`/`redirect`
targets and no no-op `onClick` handlers were found across 58 static hrefs, 33 push/redirect
literals, and 76 template-prefix nav targets. The real gaps are: a dead contact form, a broken
homepage video CTA, explicitly-stubbed integrations, and required env vars missing from
`.env.example`.

##  Fix-first (live, user-facing breakages — independently verified)

1. **Contact form silently discards every enquiry.** `app/contact/page.tsx:207` renders a
   `type="submit"` "Send Message" button inside a `<form>` with no `onSubmit`/`action`/`onChange`;
   there is **no `/api/contact` route** (verified: `app/api/contact` does not exist). Submitting
   reloads the page and loses the message. _Verified directly._
2. **Homepage avatar greeting video 404s.** `app/page.tsx:296` passes
   `greetingVideoUrl="/videos/heygen/phill-greeting.mp4"` to the hero `AvatarOrb`; the file and the
   entire `public/videos/heygen/` directory **do not exist** (verified). Clicking the pulsing
   "Click to learn about RestoreAssist" orb opens an empty black player. _Verified directly._

---

## 1. False promises (user-facing claims not backed by implementation)

### High

- **Dead contact form** — `app/contact/page.tsx:207-216` (no handler) + no `/api/contact`. See fix-first #1.
- **Homepage greeting video missing** — `app/page.tsx:296` → `/videos/heygen/phill-greeting.mp4` absent. See fix-first #2 / media §3.
- **Resources page dead links** — `app/resources/ResourcesClientPage.tsx:49,54,69,79,84,89` render
  resource cards as `<Link href="#">` no-ops. Notably "Compliance Library" (`:54`) and "Blog"
  (`:79`) dead-link to `#` even though real routes (`app/compliance-library/`, `app/blog/page.tsx`)
  exist — they should point there. Only "Getting Started Guide" and "Help Centre" work.

### Medium

- **Admin usage dashboard shows fabricated numbers as real on API failure** —
  `app/dashboard/admin/usage/page.tsx:422-423` falls back to `MOCK_USAGE` (`:124-126`) with no
  "sample data" banner, unlike the payments register which labels its fallback
  (`app/dashboard/invoices/payments/page.tsx:414`).
- **Forms submissions list silently falls back to mock rows** —
  `app/dashboard/forms/submissions/page.tsx:318-320` → `MOCK_SUBMISSIONS` (`:57`), counts computed
  from fake rows, no banner.
- **Blog articles are non-functional placeholders** — `app/blog/page.tsx:191-200` every read-more
  `<Link href="#">` labelled "Coming Soon"; the route is linked from the homepage footer
  (`app/page.tsx:585-591`).
- **"Start Free Trial" wording vs paid-tier model** — `app/pricing/page.tsx:491` labels paid plans
  "Start Free Trial" → `/signup`; no trial-specific tier exists in `lib/pricing.ts`.

### Low

- **Orphaned fake-testimonial components (latent risk)** — `components/landing/TestimonialsSection.tsx:13,22,31,79`
  invent authors/stats ("Rated 4.9/5", "200+ reports"); `components/landing/VideoDemoSection.tsx`
  references non-existent demo videos. These are imported nowhere (the live homepage renders only
  `MobileWorkflowCarousel`), so users don't see them today — but wiring them in would instantly make
  them high-severity false promises.

---

## 2. Missing connections (broken/absent wiring)

### High

- **Stripe checkout hard-fails — price IDs absent from `.env.example`** —
  `app/api/billing/checkout/route.ts:14-22` throws `Missing STRIPE_PRICE_${tier}`;
  `STRIPE_PRICE_STANDARD/PREMIUM/ENTERPRISE` and `STRIPE_PRICE_MONTHLY/YEARLY`
  (`lib/pricing.ts:23-24`) are not documented. A deployer following `.env.example` ships a
  checkout endpoint that 500s on every tier.
- **Live Teacher AI turn endpoint is a hardcoded stub** —
  `app/api/live-teacher/turn/route.ts:22-32` returns canned text
  ("Live Teacher cloud client lands in RA-1132g."); underlying client
  `lib/live-teacher/claude-cloud.ts:188` also stubbed. (No UI calls it yet — API-reachable only.)
- **Admin impersonation returns 501** — `app/api/admin/impersonate/route.ts:54-66` and
  `.../stop/route.ts:42` return 501 unless `ENABLE_ADMIN_IMPERSONATION === "true"`, which is absent
  from `.env.example`.

### Medium

- **Email sends from Resend sandbox domain by default** — `lib/email.ts:51,136,328` fall back to
  `onboarding@resend.dev` when `RESEND_FROM_EMAIL` (undocumented) is unset; that shared sandbox only
  delivers to the account owner, effectively breaking auth/invoice/portal email in prod.
- **OpenAI & Gemini integrations are "coming soon" dead options** —
  `app/dashboard/integrations/page.tsx:611,1521,1639` toast "coming soon"; only Anthropic is wired
  (`app/api/chatbot/route.ts:225`). UI presents three providers, two non-functional.
- **Cloud-mirror OneDrive & iCloud throw `NotImplementedError`** —
  `lib/cloud-mirror/onedrive.ts:21,25,29`, `lib/cloud-mirror/icloud.ts:20,24,28` (UI gates them
  "Coming soon", so currently latent).
- **Google Drive provider download/delete/signed-URL are stubs** —
  `lib/storage/google-drive-provider.ts:123,130,139` throw "not implemented in v1".
- **Guidewire claim payload ships empty certs & zeroed GPS** —
  `app/api/inspections/[id]/guidewire/route.ts:174` (`certifications: []`) and `:262`
  (`latitude: 0`).
- **DOCX export & email-delivery CTAs are no-ops** — `components/DocumentExportPackage.tsx:54,84`
  toast "coming soon" while the buttons (`:219,223`) are visible.
- **Many required integration env vars undocumented in `.env.example`** — incl. `GEMINI_API_KEY`,
  `OLLAMA_BASE_URL/MODEL`, `ABR_API_GUID/BASE_URL`, `CREDENTIAL_ENCRYPTION_KEY`,
  `PROPERTY_SCRAPER_URL/REQUIRED`, `GUIDEWIRE_SANDBOX_URL`, `YOUI_API_URL`, `HOLLARD_API_URL`,
  `POSTHOG_API_KEY/HOST`, `YOUTUBE_CLIENT_ID/SECRET`,
  `GOOGLE_PRIVATE_KEY/CLIENT_EMAIL/PROJECT_ID`. Features depending on these silently degrade/503.

### Low

- iOS native Google sign-in placeholder client ID — `lib/oauth-native.ts:64`
  (`"TODO-from-google-cloud-console-web-client-id"`).
- NIR Bluetooth device UUIDs unvalidated guesses — `lib/nir-bluetooth-service.ts:51-90,418`.
- NIR location services return placeholder (flood/BPL/heritage) — `lib/nir-location-services.ts:61,146,197`.
- Weather provider has no NZ (NIWA CliFlo) source — `lib/weather/weather-provider.ts:6,218`.
- Setup-wizard brand-logo upload & business-detail persistence not wired —
  `components/setup/BrandCard.tsx:37`, `components/setup/BusinessDetailsCard.tsx:199`.
- Live Teacher photo-capture/WHS tools use placeholders — `lib/live-teacher/tools/capture-photo.ts:23`,
  `.../flag-whs-hazard.ts:74`.

---

## 3. Missing media & promotional materials

### High

- **HeyGen founder greeting video** — `app/page.tsx:296` → `/videos/heygen/phill-greeting.mp4`;
  file + `public/videos/heygen/` directory absent (verified). Renders on homepage hero. _Verified._

### Medium (orphaned components — would 404 if mounted)

- **Product-explainer video** — `components/landing/VideoDemoSection.tsx:104` →
  `/videos/product-explainer.mp4` (MISSING). `VideoDemoSection` imported nowhere.
- **Industry-insight video** — `components/landing/VideoDemoSection.tsx:110` →
  `/videos/industry-insight.mp4` (MISSING). Same orphaned component.
- **`grid.svg` background texture** — `components/WelcomeScreen.tsx:94` → `/grid.svg` (MISSING).
  `WelcomeScreen` imported nowhere.

### Verified present (not gaps)

OG/Twitter images (`/logo.png`), manifest icons (`/icon-192.png`, `/icon-512.png`), all integration
SVGs, all 14 Remotion `screenshots/ra-ui/*.png`, 62 rendered Remotion `.mp4`s, tutorial/help videos,
63 narration `.mp3`s, and app-store screenshots all exist. No promised-but-absent promo materials
were found in `.planning/` video docs.

**Existing media dirs:** `public/` (logo, bg1, icons, sample.mp4, placeholders),
`public/avatars/` (orb svg), `public/integrations/` (6 svgs), `public/videos/tutorials/` (9),
`public/videos/help/` (6), `public/videos/remotion/` (62), `public/screenshots/ra-ui/` (25),
`remotion/assets/narration/` (63), `distribution/screenshots/appstore/`.
**Missing/empty:** `public/videos/heygen/` (absent), `public/images/` (empty), `public/icons/` (absent).

---

## Recommended sequencing

1. **Ship-blockers (do first):** contact form + `/api/contact`; homepage greeting video (add asset
   or remove the orb CTA); `.env.example` for Stripe price IDs + `RESEND_FROM_EMAIL` (silent prod
   breakage).
2. **Honesty fixes:** add "sample data" banners to usage/forms dashboards, or fail honestly; point
   Resources cards at the real routes that already exist.
3. **De-advertise or finish stubs:** OpenAI/Gemini, cloud-mirror, Drive read paths, DOCX/email
   export, blog — either hide until built or label clearly.
4. **Backlog:** NIR/Bluetooth/weather/location placeholders, Guidewire cert+GPS, Live Teacher AI.

> Verification note: findings #1 and #2 (contact form, greeting video) were re-checked directly
> against disk/source by the auditor. The remainder carry `file:line` evidence from the sweeps and
> should be confirmed at fix time.

---

## Remediation log

- [PASS] **Contact form (False Promises high #1)** — wired `app/contact/page.tsx` to the existing
  public `POST /api/support/tickets`; controlled inputs, loading/success/error states. Added
  backend test `app/api/support/tickets/__tests__/route.test.ts` (5/5). Verified: vitest, eslint,
  tsc, live preview (submit fires the POST; error UI renders). Commit `8c56ff58`.
- [PASS] **Resources dead links (False Promises high #3)** — `app/resources/ResourcesClientPage.tsx`:
  wired Compliance Library → `/compliance-library`, Blog → `/blog`, Contact Support → `/contact`;
  marked the three destination-less cards (API Documentation, Case Studies, Webinars) as
  non-clickable "Coming Soon". Removed the stale "Coming Soon" badge from Getting Started Guide
  (it has a real `/help` link). Verified: eslint, tsc, live preview (all hrefs resolve to existing
  routes, zero `#` links, click-through to `/compliance-library` works).
- [PASS] **Homepage greeting video (high)** — confirmed remediated on `main`:
  `app/page.tsx` now omits `greetingVideoUrl` (commented rationale), so `AvatarOrb`
  degrades to its greeting tooltip instead of opening an empty player. Covered by
  `components/avatar/__tests__/AvatarOrb.test.tsx`.
- [PASS] **`.env.example` undocumented required vars** — confirmed remediated on `main`:
  `STRIPE_PRICE_STANDARD/PREMIUM/ENTERPRISE`, `STRIPE_PRICE_MONTHLY/YEARLY`, and
  `RESEND_FROM_EMAIL` are now documented in `.env.example`.
- [PASS] **Mock-data honesty banners (usage/forms dashboards)** — confirmed remediated on
  `main`: both `app/dashboard/admin/usage/page.tsx` and
  `app/dashboard/forms/submissions/page.tsx` now render a "Showing sample data —
  couldn't reach the API" banner when the API fall-back fires.
-  **Stub integrations — DOCX & email export (Missing connections medium)** —
  de-advertised in `components/DocumentExportPackage.tsx`: removed a false
  `toast.success("…exported successfully as WORD")` that fired even though no Word
  document is produced (Word export now short-circuits with an honest "coming soon"
  notice before any API call), and converted the active-looking "Configure Email"
  button into a disabled "Coming soon" control to match the Word card. Added
  `components/__tests__/DocumentExportPackage.test.tsx` (4/4) locking the honesty
  guarantees + success-only-on-real-export. Verified: vitest, eslint, tsc.
- [PASS] **Stub integrations — verified already honest (audit sweep)** — re-checked the
   items against disk: **blog** (`app/blog/page.tsx:195`) now renders a
  non-interactive `<span aria-disabled>` "Coming Soon", not a dead `href="#"`;
  **DOCX/email export** de-advertised earlier (see above); **cloud-mirror**
  OneDrive/iCloud are UI-gated "coming soon" (latent); **Google Drive read** is
  implemented for the live path (`downloadByFileId`); **OpenAI/Gemini** on the
  integrations page are `disabled` `<option>`s (the toast handlers are defensive
  dead code). No dishonest surface remained to fix.
- [PASS] **Undocumented required env vars (Missing connections — `.env.example`)** —
  added 15 vars referenced by app/lib code but absent from `.env.example`,
  preventing silent prod misconfiguration. Most notably the **required
  client-side `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`** (billing UI), plus the
  OpenRouter BYOK trio (`OPENROUTER_API_KEY/_MODEL/_SITE_URL`), accounting
  environments (`QUICKBOOKS_ENVIRONMENT`, `MYOB_ENVIRONMENT`, `ASCORA_BASE_URL`),
  standards-ingest (`STANDARDS_INGEST_TOKEN`, `GOOGLE_DRIVE_STANDARDS_FOLDER_ID`),
  public contact addresses, and AI spend/rate constants. Vercel/runtime-injected
  vars deliberately omitted. Docs/config only — no code behaviour change.
- [PASS] **Onboarding ↔ setup-gate checklist disagreement (Phase 4 — "two contradicting
  checklists")** — the onboarding "Add your AI key" card (PR #1486) writes to the new
  `ProviderConnection` BYOK store, but `GET /api/onboarding/status` only checked the
  legacy `Integration` table (+ `deepseekApiKey`) for its `ai_provider` step. A user
  who completed that card was therefore still nagged to add a key, while the setup gate
  (`byokKeysCheck`, which reads `ProviderConnection`) reported it done. Bridged the two:
  added `hasActiveOperatingProviderConnection(userId)` to
  `lib/workspace/provider-connections.ts` (a single-`count` presence check mirroring the
  gate's ACTIVE Anthropic/OpenAI operating-provider filter, no live network probe) and
  OR'd it into `hasApiKey` in the onboarding status route (resolving the Admin's
  workspace for team members). No schema changes. Added
  `lib/workspace/__tests__/has-active-operating-provider.test.ts` (5/5). Verified:
  vitest (13/13 across the touched suites), eslint (0 errors), tsc (0 errors).
- [PASS] **IICRC S500 citation-year consistency (backlog — "IICRC S500 citation
  consistency")** — RA-6793 standardised `S500_FIELD_MAP` to the canonical
  `S500:2021 §X` form (guarded by `nir-standards-mapping.test.ts`), but several
  hardcoded citation *data* strings still shipped the legacy year-less `IICRC S500 §X`
  form into runtime output: report scope items (`lib/nir-scope-determination.ts`),
  the tiered-completion field map (`lib/nir-tiered-completion.ts`), the jurisdictional
  matrix (`lib/nir-jurisdictional-matrix.ts`), and — most consequentially — the
  **Guidewire insurer claim payload** photo manifest
  (`app/api/inspections/[id]/guidewire/route.ts`, `standardRef`). Injected the
  mandated `:2021` edition year into the structured citation fields
  (`clauseRef`/`regulationRef`/`standardRef`) per CLAUDE.md rule #12, leaving
  free-text rationale prose untouched and preserving each site's existing `IICRC`
  prefix (prefix style already varies codebase-wide; the missing edition year is the
  compliance-critical part). No schema changes. Added
  `lib/__tests__/iicrc-s500-citation-year.test.ts` (deep-scans the exported matrices +
  tiered-completion maps to ban the legacy year-less form) and extended
  `guidewire-photo-manifest.test.ts` to lock the insurer-payload `standardRef`.
  Verified: vitest (44/44 across the touched suites), eslint (0 errors), full
  `tsc --noEmit` (0 errors; pre-existing `prisma/seed-anz-materials.ts` excepted).
-  **Phase 3 — multi-provider BYOK: OpenRouter provider-layer slice** — taught the
  provider-calling layer (`lib/ai-provider.ts`) to recognise and route OpenRouter keys.
  (1) **Correctness fix:** OpenRouter keys are `sk-or-…`, which also match the generic
  `sk-` OpenAI branch — so `providerForKey` previously classified them as `openai` and
  `callAIProvider` would have sent them to `api.openai.com` (guaranteed 401). Added an
  `sk-or-` check *before* the `sk-` branch (order is load-bearing). (2) **Groundwork:**
  added `"openrouter"` to the `AIProvider` union, an `openrouter` case in `callAIProvider`
  that reuses the OpenAI SDK against OpenRouter's OpenAI-compatible endpoint
  (`https://openrouter.ai/api/v1`) with a caller/env/`deepseek/deepseek-chat`-default model
  slug and optional attribution headers, plus the name filter/fallback in
  `getLatestAIIntegration`. **No schema change** — deliberately scoped to the provider layer.
  Added `lib/__tests__/ai-provider-openrouter.test.ts` (SDK mocked: base-URL wiring, model
  precedence, header gating, empty-content guard) and extended
  `lib/__tests__/ai-provider-routing.test.ts` (sk-or- classification + cross-vendor guard).
  Verified: vitest (10/10 across both suites), eslint (0 errors), full `tsc --noEmit`
  (0 errors).
- [PASS] **Phase 3 — multi-provider BYOK: OpenRouter wired end-to-end** (extends the slice above,
  same PR/branch). The live `ProviderConnection` BYOK store now supports OpenRouter as a
  first-class operating provider:
  - **Schema (safe):** added `OPENROUTER` to the Prisma `AiProvider` enum with an additive,
    idempotent forward migration (`ALTER TYPE ... ADD VALUE IF NOT EXISTS 'OPENROUTER'`,
    mirroring the proven `ra6998_elevenlabs_provider` migration) — no destructive change, no
    drift.
  - **Store (`lib/workspace/provider-connections.ts`):** OpenRouter live key validation via
    OpenRouter's `/api/v1/auth/key` introspection endpoint (401 → invalid, no credit spend); an
    optional model slug co-located in the encrypted credentials blob (same pattern as the
    ElevenLabs voiceId); and `OPERATING_PROVIDERS` is now the exported SINGLE SOURCE OF TRUTH
    consumed by both the setup gate (`byokKeysCheck`) and the onboarding presence check, so the
    two can never disagree (the class of bug the earlier onboarding↔gate fix closed).
  - **Routes:** `POST/validate /api/workspace/provider-connections` accept `OPENROUTER` (POST
    also accepts the optional `model` slug).
  - **Report routing:** `resolveReportProvider` now falls back to OpenRouter (after Anthropic,
    OpenAI) and threads the workspace's stored model slug into `callAIProvider`
    (`AIIntegration.model`, precedence: per-call option → stored → env → `deepseek/deepseek-chat`).
  - **UI:** the AI-providers settings page gained an OpenRouter card with a key + optional model
    input. The onboarding quick-start card is deliberately left as the two first-party providers
    (Anthropic/OpenAI need no model slug); OpenRouter lives in full settings.
  - **Tests:** new `lib/workspace/__tests__/openrouter-provider.test.ts` (validation + model
    round-trip + operating-provider membership); extended report-routing, byok-gate,
    has-active-operating-provider, and ai-provider-openrouter suites.
  - Verified: vitest (43/43 across all touched suites), eslint (0 errors), full `tsc --noEmit`
    (0 errors), `prisma generate` OK.
  - **Remaining (founder-gated, not code):** OpenRouter live key validation exercises a real
    OpenRouter key at runtime — the code is complete and unit-tested with mocks, but a real
    end-to-end smoke test + the public self-serve BYOK disclosure decision are **RA-6933**
    (founder). No further code is blocked.
- [PASS] **Remaining undocumented env vars (Missing connections medium — final `.env.example`
  sweep)** — re-verified the audit's full undocumented-env list against code (per-var grep
  of `app/` + `lib/`, 2026-07-09). 16 of the 19 listed vars were already documented by the
  earlier `.env.example` passes: `GEMINI_API_KEY`, `OLLAMA_BASE_URL`/`OLLAMA_MODEL`,
  `ABR_API_GUID`, `CREDENTIAL_ENCRYPTION_KEY`, `PROPERTY_SCRAPER_URL`,
  `GUIDEWIRE_SANDBOX_URL`, `YOUI_API_URL`, `HOLLARD_API_URL`, `POSTHOG_API_KEY`/`POSTHOG_HOST`,
  `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET`, and
  `GOOGLE_PRIVATE_KEY`/`GOOGLE_CLIENT_EMAIL`/`GOOGLE_PROJECT_ID`. `ABR_API_BASE_URL` has
  zero references anywhere in code — the real var is `ABR_BASE_URL`
  (`lib/integrations/abr/client.ts:9`), already documented. Added the two genuine gaps:
  `ENABLE_ADMIN_IMPERSONATION` (`app/api/admin/impersonate/route.ts:54` + `stop/route.ts:36`
  return 501 `FEATURE_DISABLED` without it — documented under DEVELOPMENT ONLY) and
  `PROPERTY_SCRAPER_REQUIRED` (`app/api/properties/scrape/health/route.ts:46` strict-mode
  flag — documented next to `PROPERTY_SCRAPER_URL`). Docs only — zero code changes.
- [PASS] **"Start Free Trial" wording (False Promises medium) — verified TRUE, CTA unchanged** —
  traced the paid-plan CTA (`app/pricing/page.tsx:526`, `<Link href="/signup">` at `:518`)
  through every signup path: `app/api/auth/register/route.ts:145,205` grant
  `subscriptionStatus: "TRIAL"` with `trialEndsAt = now + 15 days`, 50 report credits and
  30 quick-fill credits, all sourced from the `PRICING_CONFIG.free` SSOT
  (`lib/pricing.ts:27`, `trialDays: 15`); Google OAuth
  (`app/api/auth/google-signin/route.ts:178`, `lib/auth.ts:352`) and native token exchange
  (`app/api/auth/native-token-exchange/route.ts:291`) grant the same. `TRIAL` exists in the
  Prisma `SubscriptionStatus` enum (`prisma/schema.prisma:1359`) and in the AI
  subscription-gate allowlist (`lib/billing/subscription-gate.ts:14`), so trial users get
  real feature access. The trial length is already surfaced on the pricing page
  (`app/pricing/page.tsx:281,332`). The audit's premise ("no trial-specific tier exists in
  lib/pricing.ts") is stale — `PRICING_CONFIG.free` is now the trial SSOT. No change needed.
-  **Setup-wizard brand-logo upload & business-detail persistence (Missing connections
  low)** — the business-detail half is remediated:
  `components/setup/BusinessDetailsCard.tsx` now persists manual edits via
  `persistManualField` → `PATCH /api/setup/state` on blur (`:217,230,243`; verified
  2026-07-09). The brand-logo upload half is still unwired
  (`components/setup/BrandCard.tsx:34`, `TODO(setup-wizard Phase 8+)`) and is in progress
  in a parallel PR.
