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
- [PASS] **Phase 3 — multi-provider BYOK: the frictionless in-onboarding key + model picker**
  (completes the OpenRouter thread above). OpenRouter was wired end-to-end into the provider
  layer, the `ProviderConnection` store and full settings, but the *onboarding* card
  (`components/setup/AiKeyCard.tsx`) still offered only Anthropic/OpenAI, so a new operator
  could not reach the open models (Qwen / DeepSeek / MiniMax) without first finishing setup and
  then hunting through settings — the exact friction Phase 3 set out to remove.
  - **Card:** OpenRouter is now a third provider button, and selecting it reveals an optional
    **Model** picker. A blank selection stores no slug and routes to the server-side default
    (`callAIProvider` → `OPENROUTER_MODEL` → `deepseek/deepseek-chat`), so the fast path is still
    "paste key, press save".
  - **No pinned version numbers.** Hardcoding `qwen/qwen3-…`-style slugs would go stale on
    OpenRouter's next release, and a stale slug is a dead picker. Instead the catalogue is read
    live from OpenRouter's **public** model index (`lib/workspace/openrouter-catalogue.ts`, new)
    and the "Recommended open models" group is derived from it: the newest models OpenRouter
    itself publishes per family (DeepSeek, Qwen, MiniMax), newest-first by its `created` stamp.
    No BYOK key is read or sent — the upstream index needs no auth.
  - **Route:** `GET /api/workspace/openrouter-models` (new) is session-gated (it exists for
    signed-in setup; leaving it open would make the app a free CORS proxy for OpenRouter) and
    caches for 10 minutes. It **never fails hard** — an upstream outage returns
    `unavailable: true` and the card degrades to a free-text slug field, so a third-party
    outage can never block onboarding.
  - **No schema change**, no migration, no new dependency. `OPENROUTER` and the optional model
    slug were already accepted by `POST /api/workspace/provider-connections`.
  - **Tests:** `lib/workspace/__tests__/openrouter-catalogue.test.ts` (10) — family promotion
    order, per-family cap, malformed/`null` upstream entries, cache TTL, outage degradation, and
    an assertion that no `Authorization` header is sent; `app/api/workspace/openrouter-models/
    __tests__/route.test.ts` (5) — 401 without a session (and no upstream call), outage passthrough
    as 200, a throwing helper degrading to 200 rather than 500, and the degradation being
    reported; `components/setup/__tests__/AiKeyCard.test.tsx` extended (+7) — picker population,
    slug posted with the key, model omitted on the default, free-text fallback, slug dropped when
    switching back to a first-party provider, and a mid-fetch provider toggle.
  - Three real defects were found and fixed, each with a re-run positive control. Two by the
    tests: a `null` entry in the upstream array threw and took the whole catalogue down; and
    the catalogue effect cancelled its own in-flight fetch, stranding the picker on
    "Loading models…" forever. The third by the independent reviewer (P0): the route's
    documented "never fails hard" contract was not actually enforced for a throwing helper —
    it fell through to `fromException` and returned 500, and the regression test asserting
    that path had been written to accept the 500, so it could not have failed under the
    defect. The catch now degrades to the same `unavailable` payload an outage produces (and
    reports the error, so the degradation is never silent); the test asserts 200 plus the
    exact body and was demonstrated failing under a mutant that restores the 500.
  - A **second** independent review round raised two further P1s against the hardened head,
    both demonstrated with executable probes rather than argued, and both fixed here:
    - *The client fetch had no timeout.* The route's 8s upstream bound cannot rescue a browser
      request that never completes, so a stalled request left the picker disabled on
      "Loading models…" indefinitely — the exact state the free-text fallback exists to
      prevent. The request is now bound by an `AbortController` at 12s (above the route's own
      8s, so a slow-but-live upstream still populates) and a timeout degrades like any other
      failure.
    - *The untrusted catalogue had no size or field bounds.* A probe of 100,000 syntactically
      valid entries was mapped, filtered per family, sorted, cached for ten minutes and served
      to every signed-in caller. There is now an entry cap (`MAX_UPSTREAM_ENTRIES`, checked
      **before** the sort), a response-byte cap enforced by a `content-length` check plus a
      capped text read ahead of `JSON.parse`, and per-entry slug/name length limits that trim
      padded slugs and drop whitespace-only or absurd ones. An entry-count or byte violation
      degrades to `unavailable`; a single bad entry is dropped rather than costing the
      catalogue.
    Writing those tests exposed a third defect in a test of our own: the "oversized body with
    no content-length" case originally used a garbage string, so `JSON.parse` rejected it and
    the test passed even with the size cap removed. It now uses deliberately *valid* oversized
    JSON, and fails under the mutant as a control must.
  - A **third** review round found the byte cap was still only half real, and was right. The
    `content-length` check is a genuine early exit, but OpenRouter's real response is chunked
    and declares no `content-length` — and `res.text()` materialises the entire body before its
    length can be measured, so the cap was measuring an allocation it had already permitted.
    The reviewer demonstrated it by pulling 5,250,000 bytes through a real `ReadableStream`.
    Our own regression test could not have caught this: its mock returned an
    already-materialised string, so it proved post-read rejection rather than a capped read.
    The body is now consumed through a reader that counts encoded bytes as they arrive and
    cancels the source the moment `MAX_RESPONSE_BYTES` is crossed, decoding and parsing only
    the bounded chunks; the `content-length` early exit is kept, and a buffered fallback covers
    runtimes with no streaming body. Two new tests use genuine `ReadableStream`s — one asserts
    the source is cancelled and the bytes pulled stay bounded (7MB against a body offering
    50MB), the other that a chunked body under the cap still decodes correctly across a chunk
    boundary. Both fail under a mutant that restores the buffered read.
  - A **fourth** pass closed the class rather than the instance. Three consecutive review rounds
    had each returned one new finding of the same shape — an untrusted body consumed without a
    bound at the point of allocation — which is a convergence failure owned by the author, not
    the reviewer. `readCapped`'s `!reader` branch was an escape hatch: on any response whose body
    could not be streamed it fell back to the buffered `res.text()` read, restoring the exact
    unbounded allocation the function exists to prevent. It is removed rather than bounded
    (unbounded on the odd path is still unbounded); this runs server-side on Node, where a
    body-bearing response always carries a `ReadableStream`. Removing it exposed that four tests
    had been passing through that hatch rather than the streaming path they claimed to exercise,
    so the mock helper now builds a real `ReadableStream` and every fetch test drives the
    production path. Three attack questions that had been written into a reviewer brief and
    dispatched *unanswered* were answered in code instead: a multi-byte UTF-8 sequence split
    inside the sequence across a chunk boundary, a body that errors mid-stream, and proof that an
    over-cap response cannot poison the ten-minute cache. A further vacuous control was caught in
    the writing — the new no-readable-body test first used a throwing `text()`, which the outer
    handler swallowed so the test passed with or without the fix; `text()` now returns a good
    payload and the test asserts it was never called.
  - A **fifth** pass answered the round-4 P0 and then swept the class behind it. The P0 was
    self-inflicted: removing the `!reader` fallback made the *existing* `content-length` test
    vacuous, because its bodyless mock began returning `unavailable` via the `!reader` path
    whether or not the header guard existed. The lesson is that changing a shared code path
    invalidates the mutation evidence for **every** test that traverses it, not just the new
    ones. That test now uses a real stream and spies on `getReader` — `pull` was tried first and
    rejected as an instrument, because a `ReadableStream` calls `pull` eagerly to fill its own
    queue and so measures the stream rather than us.
  - Rather than fix that one test, every guard in the module was mutated in turn and required to
    be killed by at least one test. Eleven guards; ten killed, and one **survived**: removing
    `if (catalogue.unavailable) return catalogue;` left the suite green. That was a real hole —
    the existing cache test only exercises the byte-cap path, which returns earlier, so a
    malformed or over-entry payload would have been cached as `unavailable` for ten minutes and
    blanked the picker for every operator. A test for that distinct path closes it; the sweep now
    kills all eleven.
  - **Live measurement against the real endpoint** (public, unauthenticated, no credential sent),
    which replaces the earlier "NOT OBSERVED" note: the production response carries **no
    `content-length`** and is gzipped, so the header check protects nothing in practice and the
    streaming cap is the only real bound — the defect the third review round identified. The body
    arrives in 87 chunks of 26–16,384 bytes. Payload: 672,715 bytes against the 5,000,000 cap,
    411 entries against the 2,000 cap, longest slug 56 against 128, longest name 56 against 200,
    zero entries over any bound, and all three recommended families present (DeepSeek 14, Qwen 50,
    MiniMax 9). No cap trips on a realistic payload, with 7.4x byte and 4.9x entry headroom.
  - A **sixth** pass drained two P1s from the fifth review round, both in areas that four rounds
    of catalogue focus had let drift — which is why the brief explicitly asked the reviewer to
    look there:
    - *Concurrent misses bypassed the aggregate bound.* The cache is written only after fetch,
      bounded read, parse and build all complete, so 100 simultaneous signed-in callers opened
      100 upstream reads — each individually capped at 5MB, the aggregate bounded by nothing. The
      route is a GET, so the repository's default middleware limiter (POST/PATCH/PUT/DELETE) does
      not cover it. Concurrent misses now coalesce onto one in-flight promise, assigned before any
      `await` and cleared on every settlement path so a single failure cannot pin later callers to
      a rejected promise.
    - *The free-text slug was unbounded.* When the catalogue is unavailable the model control is a
      free-text input, and a reviewer probe entered a 1,000,007-character slug, saved, and
      confirmed the full value reached the provider-connections payload — which is persisted
      beside an encrypted credential. `POST /api/workspace/provider-connections` is now the
      authority: it rejects a slug over 128 characters or not matching `namespace/model[:tag]`
      **before** encryption or persistence, and also bounds the API key at 512. The card mirrors
      the bound with `maxLength` **and** a slice, because `maxLength` alone is bypassed by a paste
      in some engines and by any non-UI caller.
  - The full mutation sweep was re-run over **all eighteen** guards, not just the new ones —
    precisely because the round-4 P0 was caused by a shared-path change silently making an
    existing test vacuous. All eighteen killed, no survivors, sources restored byte-identical and
    confirmed by checksum.
  - Verified at head `324196c9c`: vitest **22/22** on the catalogue suite and
    **127/127** across `components/setup`, `lib/workspace` and `app/api/workspace`; eslint exit 0
    on the changed files; full `tsc --noEmit` adds no error beyond the pre-existing
    `components/sketch/SketchCanvas.tsx` pair. Superseded evidence, retained for the record —
    at `fce3843e3` the figures were: vitest **41/41** on the three changed suites (exit 0), with the
    two source files checksum-stable across the run; eslint exit 0, no errors on the changed
    files; full `tsc --noEmit` exit 1 on exactly two errors, both in
    `components/sketch/SketchCanvas.tsx` — a file this branch does not touch, and the identical
    two errors were reproduced on a clean `origin/main` worktree, so this branch adds no type
    error. The twelve CI Quality-Checks guards were enumerated from
    `.github/workflows/pr-checks.yml` and run locally: **11 green**, and the one failure
    (`check:no-lucide`, four untouched files) reproduces byte-identically on `origin/main`.
    Both the type errors and the lucide failure are pre-existing main-wide debt that blocks
    every PR equally; they are deliberately not bundled here — see "Known main-wide debt" in
    the PR body.
  - Mutation controls (each fix demonstrated failing when reverted, source then restored
    byte-identical and verified by checksum): removing the client timeout fails
    "degrades to free text when the catalogue request never settles"; removing the entry cap
    fails "degrades rather than sorting and caching a hostile number of entries"; removing the
    byte caps fails both oversized-body tests; removing the field bounds fails both slug-bound
    tests.
- [PASS] **Phase 4 — the setup wizard's finish CTA now actually completes setup** (the
  ship-blocker standing between the locked wizard and turning `SETUP_WIZARD_ENABLED` on).
  The locked one-step-at-a-time stepper was already built and ends on a "Generate your first
  report" CTA — but that CTA only called `router.push('/dashboard/reports/new')`. The **only**
  caller of `POST /api/setup/activate` (which sets `Organization.setupCompletedAt`) was the
  Activate button inside `FeatureHealthCard`, and that card lives in the wizard's **optional**
  "Integrations" step. An operator who took the wizard at its word and skipped the optional
  steps therefore never activated at all.
  - **Why that is a ship-blocker, not a cosmetic gap.** With `SETUP_WIZARD_ENABLED=true` the
    gate in `proxy.ts:157-168` redirects any authenticated user without `setupCompletedAt` to
    `/setup`, and `/dashboard/reports/new` is not in `SETUP_GATE_BYPASS`. So the wizard's own
    terminal CTA bounced the operator straight back into the wizard — a closed loop, for 100%
    of users, deterministically.
  - **A second, subtler loop behind it.** The gate reads `setupCompletedAt` off the **NextAuth
    JWT**, and only a NextAuth route can rewrite that cookie — a server-component redirect
    cannot. `app/setup/page.tsx:29` redirects to `/dashboard` once the DB row is set, so a
    freshly-activated operator on a stale token gets `/dashboard` → gate → `/setup` → page →
    `/dashboard` → …, ending in `ERR_TOO_MANY_REDIRECTS`. This one also affected the
    **pre-existing** `FeatureHealthCard` activation path, so fixing only the new CTA would have
    left flipping the flag unsafe. Both paths now `await update()` (which runs the `jwt()`
    callback with `trigger: "update"`, refreshing the claim per `lib/auth.ts:468-490`) **before**
    navigating, and `SetupShell` uses a full document load rather than `router.push` so the
    request that follows is guaranteed to carry the refreshed cookie.
  - **Failure handling.** `SetupStepper` now owns pending/error state for an async finish: the
    CTA disables and reads "Setting up your workspace…" while in flight, and a rejection renders
    in place (`role="alert"`) and re-enables the CTA for a retry instead of stranding the
    operator. `409 CONFLICT` ("setup already activated" — the operator used the optional
    Activate button first) is treated as **success**, not a dead end. A `400` pre-flight
    rejection names the blocking capabilities from the route's top-level `failedChecks` array
    ("Setup can't finish yet — Cloud storage, Accounting need attention.") rather than a bare
    status code, and does **not** navigate.
  - **No schema change, no migration, no new dependency, no env change.** `next-auth/react`'s
    `useSession` was already available under the root `SessionProvider`.
  - **Tests:** `SetupShell.test.tsx` +11 (activate→refresh→navigate **ordering**, 409-as-success,
    pre-flight labels with no navigation, network throw, session-refresh failure, plus five
    `activationErrorMessage` cases across both envelope shapes); `SetupStepper.test.tsx` +7
    (async pending state, single-fire, in-place error with retry, generic fallback, CTA left
    disabled after success); `FeatureHealthCard.test.tsx` +1 (refresh-before-navigate ordering).
  - **A guard that no test could kill was removed rather than shipped.** The first cut carried a
    `finishing` re-entrancy check inside `handleFinish` as belt-and-braces beside the CTA's
    `disabled`. The mutation sweep showed it **surviving**, and the reason turned out to be
    structural, not a weak test: React decides whether to run `onClick` from a form element's
    **committed fiber props** (`getListener` / `shouldPreventMouseEvent`), not from the DOM
    attribute — so no synthetic or assistive click can reach the handler while `disabled` is
    set, and the second check was unreachable by construction. Three successive attempts to
    build an instrument for it (batched `act` dispatch, clearing `element.disabled` outside
    `act`, then inside it) each failed to distinguish the two defences, which is what exposed
    the equivalence. The check was deleted per CLAUDE.md §2 and the test rewritten to pin the
    behaviour that actually holds — including an assertion that the attribute really was
    cleared — so if the CTA ever stops being a real `<button disabled>` the test goes red and
    the guard has to come back.
  - **Independent review round 1 (`moonshotai/kimi-k3`, FAIL) — three real defects drained.**
    Its P1's stated mechanism was **wrong**: `FeatureHealthCard.activate` does have a
    `try/catch` (`:84`), so the rejection never escapes and the spinner does clear. But
    checking the branch it pointed at exposed three genuine defects, one worse than the one
    reported:
    1. **An envelope object was being rendered as a React child.** The else branch did
       `setActivateError(j?.error)`, and every RA-1548 branch of `/api/setup/activate`
       (401/404/409) returns `{ error: { code, message } }` — handing React an object throws
       "Objects are not valid as a React child" and blanks the card. Only the 400 pre-flight
       body carries a string. `activationErrorMessage` already handled both shapes, so it is
       now the single authority, extracted to `lib/setup/activation-error.ts` (it could not be
       imported from `SetupShell`, which imports `FeatureHealthCard` — that would be a cycle).
    2. **409 dead-ended the operator** — "Setup already activated" was shown as an error even
       though it is the desired state, so anyone retrying was told their live workspace had
       failed. Now treated as success, matching `SetupShell.handleFinish`.
    3. **A refresh failure was blamed on activation** — the card said "Network error during
       activation" while `setupCompletedAt` was already committed. It now states the workspace
       IS activated and that only sign-in needs retrying, and that retry lands on the
       409-as-success path.
    The reviewer's **sharpest** finding was a P2 and was correct: both ordering tests recorded
    mock **call**, not **completion**, so a mutant dropping only the `await` would produce an
    identical order array and survive — and that fire-and-forget mutant is exactly the
    navigate-before-the-cookie-is-re-minted race this work exists to fix. Both tests now hold
    the refresh open on a deferred promise and assert no navigation occurs until it resolves.
    (Writing that exposed a second-order fault of our own: the deferred implementation leaked
    into the following test through `mockClear` and hung it — both suites now `mockReset`.)
  - **Mutation controls — twelve guards, all killed, no survivors**, each source restored
    byte-identical and confirmed by sha256. The sweep was re-run over **all twelve**, not just
    the new ones, because a shared-path change voids the mutation evidence for every test
    crossing it. It includes the two reviewer-derived mutants (**M2b/M8b**, drop only the
    `await`) and **M10** (raw envelope object to React) — each of which the round-1 tests would
    have survived — alongside removing the activate call, removing the refresh entirely,
    dropping either 409 special-case, ignoring the `failedChecks` labels, un-disabling the CTA
    while finishing, swallowing the rejection, and blaming activation for a refresh failure.
  - Verified at the final **source** head `4f7396041` (the line below is docs-only and changes
    no source, so this evidence describes the final source state):
    `npx vitest run --config config/vitest.config.js
    components/setup lib/setup` — exit 0, **145 passed / 25 skipped** (17 files + 1 skipped;
    the skips are `DATABASE_URL`-gated, not failures). `npx eslint -c config/eslint.config.mjs`
    over the seven changed source/test files — exit 0, **0 errors** (2 warnings, both pre-existing in
    `FeatureHealthCard.test.tsx` and untouched by this change). Full
    `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` — **exit 0, zero errors** (the two
    `SketchCanvas.tsx` errors that blocked earlier branches are fixed on main by PR #2007).
    All nine CI content guards enumerated live from `.github/workflows/pr-checks.yml` and run
    locally: `check:no-emoji`, `check:no-lucide`, `check:spec-docs`, `check:encoding`,
    `check:ssot`, `check:standards`, `check:no-verbatim`, `check:marketing-verbatim`,
    `check:au-english` — **all PASS** (`check:no-lucide` included, now that #2007 cleared the
    main-wide debt). `pnpm audit:ai`, `pnpm audit:api`, full `pnpm lint` (0 errors) — PASS.
  - **Still founder-gated, and unchanged by this PR:** flipping `SETUP_WIZARD_ENABLED=true` is a
    Vercel env change on production, outside the autonomous envelope. This PR removes the code
    blocker; the flip itself, and running `scripts/grandfather-existing-orgs.ts` first so
    existing orgs are not swept into the wizard, remain Phill's call. **Not observed:** no run
    against a live deployment with the flag on — the redirect loop is proven from the source
    (`proxy.ts` bypass list, `app/setup/page.tsx` redirect, `lib/auth.ts` JWT refresh condition)
    and the fix is proven by unit tests with mutation controls, not by a browser session.
-  **Setup-wizard brand-logo upload & business-detail persistence (Missing connections
  low)** — the business-detail half is remediated:
  `components/setup/BusinessDetailsCard.tsx` now persists manual edits via
  `persistManualField` → `PATCH /api/setup/state` on blur (`:217,230,243`; verified
  2026-07-09). The brand-logo upload half is still unwired
  (`components/setup/BrandCard.tsx:34`, `TODO(setup-wizard Phase 8+)`) and is in progress
  in a parallel PR.
- [PASS] **Guidewire insurer payload published a fabricated GPS fix for every photo without one
  (Missing connections medium — "Guidewire claim payload ships empty certs & zeroed GPS")** — the
  certifications half was closed earlier (`fetchTechnicianCertifications` now reads the real
  contractor profile); this closes the GPS half, which was still live.
  - **The defect.** `app/api/inspections/[id]/guidewire/route.ts:320-321` built the photo manifest
    with `latitude: p.gpsLatitude ?? 0, longitude: p.gpsLongitude ?? 0`. `InspectionPhoto`'s
    `gpsLatitude`/`gpsLongitude` are `Float?` (`prisma/schema.prisma:3314-3315`) and are written
    **only** when a capture supplies them — `app/api/inspections/[id]/photos/route.ts:299-302,
    381-386` reads optional `gpsLat`/`gpsLng` form fields from the FAB capture and spreads them in
    conditionally. Every other upload path leaves both columns NULL. So the fallback was the
    **common** path, not an edge case, and it published `0, 0` — a real point in the Gulf of
    Guinea — to a carrier as the location of Australian claim evidence, indistinguishable in the
    payload from a measurement. Photo geolocation is exactly what an adjuster uses to corroborate
    evidence, so this is fabricated provenance in an evidentiary document, not a cosmetic default.
  - **The prior fix had pinned it.** `guidewire-photo-manifest.test.ts` carried a test literally
    named *"falls back to 0 only when GPS columns are genuinely null"* asserting
    `expect(photo.latitude).toBe(0)`. An earlier pass removed a hardcoded `0,0` for photos that
    *do* have a fix and, in doing so, canonised `0` as the sentinel for photos that do not. The
    test is replaced, not deleted — a control that locks the defect is worse than no control.
  - **The fix.** `latitude`/`longitude` on `NirPhotoManifest` are now `number | null`, the route
    emits `?? null`, and the contract's zod schema widens to `z.number().nullable()`. `??` (not
    `||`) is load-bearing and is pinned by its own test: a genuinely recorded `0` is data and must
    survive.
  - **Declared, not merely nullable.** `lib/export/claims-contract.ts`'s stated premise is that
    gaps are declared rather than filled in, so `buildClaimsIntegrationExport` now declares
    `report.photoManifest.photos[].latitude` and `…longitude` on `explicitOmissions` — **once per
    axis** for the whole manifest. Once, so a 500-photo job cannot flood the list; per axis, so a
    half-known fix is not reported as though both coordinates were absent.
  - **Contract version: a MAJOR, 1.0 → 2.0, with its own artifact.** The first cut of this change
    called it `1.1` and kept the v1 artifact, on the reasoning that `schemaVersion` is a
    `z.literal` so a v1 consumer would fail loudly at the version check. The independent reviewer
    rejected that and was right: failing loudly is a clean break, not compatibility — a v1
    consumer either rejects every 1.1 payload *including ones whose coordinates are all present*,
    or lets a `null` reach numeric handling. Worse, republishing a changed contract under
    `claims-integration-v1.schema.json` means a carrier re-fetching that document by name gets a
    different contract than it had. So: `docs/contracts/claims-integration-v2.schema.json` is the
    live artifact (`$id`/title v2), and **`claims-integration-v1.schema.json` is frozen
    byte-identical to `origin/main`** as the historical record of what v1 was.
  - **The artifact path is now a single exported constant.** `CLAIMS_INTEGRATION_ARTIFACT_PATH`
    lives beside the version in `claims-contract.ts`; the generator and the drift test both import
    it instead of spelling the path. This came out of the mutation sweep — see below.
  - **No schema change, no migration, no new dependency, no env change.** Prisma is untouched.
  - **Tests.** `guidewire-photo-manifest.test.ts` — the `toBe(0)` test replaced with a
    null-not-zero assertion, a table-driven half-known-fix case covering **both** directions, and
    one photo with a genuinely recorded `0,0`. `claims-contract.test.ts` +5 — a null-GPS payload
    passing the strict contract and carrying both declared omissions, a table-driven per-axis
    case asserting only the missing axis is declared, a **negative control** asserting neither is
    declared when every photo has a fix, the major-version pin, and a guard that the retired v1
    artifact still describes v1 (`const: "1.0"`, plain-`number` coordinates).
  - **Independent review round 1 — FAIL, one P1, drained rather than argued.** Codex was probed
    live and is usage-capped, so the review went over HTTP through OpenRouter to
    `openai/gpt-5.6-sol` — a different vendor's model in a fresh context, not a subagent of the
    implementing agent. Its P1 was the version call above. Two of its P2s were also real and are
    fixed here rather than filed: (a) only the longitude-missing direction was tested, so
    deleting the `photo.latitude === null` side of the omission predicate would have survived —
    both directions are now table-driven; (b) a single combined omission string implied both axes
    were absent when only one was, hence the per-axis split. Its remaining P2 (`capturedAt`) is
    recorded as a follow-up below. The reviewer stated plainly that it could not execute vitest,
    tsc, eslint, the mutation sweep, or repository-wide searches — those are re-runnable here.
  - **Independent review round 2 at the drained head — PASS, zero blocking findings**
    (`openai/gpt-5` over OpenRouter; a different vendor's model in a fresh context, bound to the
    exact head, with declared coverage and eleven constructed attacks). Its three P2s were drained
    rather than filed, because all three were real: (a) the suite's `describe` label still read
    `contract v1` and a comment still said `1.1`, both stale after the 2.0 decision — exactly the
    kind of misleading leftover this PR is about; (b) the frozen-v1 guard asserted `schemaVersion`,
    `$id` and only the *latitude* schema, so a future edit to v1's longitude or any unnamed field
    would pass — it now asserts both axes **and pins the whole document by sha256**, since
    field-by-field assertions only cover the fields someone thought to name. Positive control for
    the new pin (**M11**): a one-field edit to v1's `title` — precisely the kind the old
    assertions could not see — fails the suite, and the artifact was restored byte-identical.
    (c) `capturedAt` is the recorded follow-up above; the reviewer agreed this diff does not
    worsen it.
  - **Mutation controls: 15 mutants, 15 killed, no survivors**, all sources restored
    byte-identical and confirmed by sha256 (route `b3e7a4e0…`, contract `da2fefe2…`, generator
    `70ffa60f…`). The sweep was re-run **in full** after the drain rather than carried over,
    because the drain changed shared paths and that voids the mutation evidence for every test
    crossing them. M1/M2 restore `?? 0` per axis; M3/M3b swap `??` for `||` so a recorded `0`
    becomes absent; M4a/M4b drop each declared omission; M5a/M5b declare each unconditionally
    (killed only by the negative control); M5c makes the latitude guard read the longitude axis;
    M6/M7 un-widen the contract per axis; M8 downgrades the major bump to `1.1`; M9 republishes
    v2 under the v1 `$id`; M10 repoints the generator at the frozen v1 artifact.
  - **One mutant survived the first sweep and was closed by deleting the duplication, not by
    adding a test.** M10 originally edited the generator's own hardcoded target path, and no test
    could see it: the test reads checked-in files and never runs the generator, so a generator
    aimed at v1 looks identical until someone runs it. Rather than assert on the script's source
    text, the path became one exported constant that the generator and the test both import — the
    mutant is now unconstructible in the generator and dies in the contract.
  - **Verified at HEAD.** `npx vitest run --config config/vitest.config.js lib/export
    app/api/inspections` — **65 files, 351 tests, all passed**.
    `npx eslint -c config/eslint.config.mjs` over all changed source/test files —
    **exit 0, zero output**. Full `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` —
    exit 1 on exactly two errors, both in `lib/integrations/{ascora,xero}/upstream-errors.ts`,
    files this branch does not touch; the output is **byte-identical** (`diff` reports no
    difference) to the same command run in a pristine detached `origin/main` worktree, so this
    branch adds **zero** type errors.
  - **Known main-wide debt, deliberately not bundled.** Of the twelve `quality-checks` guards
    enumerated live from `.github/workflows/pr-checks.yml`, **10 PASS** and two fail:
    `check:no-emoji` (`app/dashboard/addons/AddonsClient.tsx` U+2B21) and `check:no-lucide`
    (six files incl. `app/billing/upgrade/CheckoutCTA.tsx`, `components/dashboard/ListPagination.tsx`).
    Both reproduce **byte-identically** on the pristine `origin/main` control worktree, so they are
    main's debt and block every PR equally. Reconciling them belongs in its own labelled PR
    (#2000 / #2007 precedent) and is already in flight on `fix/ci-npm-alignment`. `tsc` is red on
    `main` for the same reason.
  - **Follow-up deliberately NOT bundled (same defect class, different field).** The route still
    derives `capturedAt` from `InspectionPhoto.timestamp`, whose Prisma default is
    `@default(now())` — i.e. **row-insert (upload) time, not capture time** — while
    `cocoaCapturedAtUtc` holds a true capture instant for mobile captures. The `?? now()` fallback
    beside it is dead (the column is non-nullable), but the provenance question is real and is the
    same honesty class as the GPS fix. It is left out because this diff changes no timestamp
    behaviour and folding it in would widen an evidentiary change past one reviewable claim. The
    independent reviewer agreed the split is defensible on exactly that ground.
  - **Tooling hazard observed, worth a founder decision.** The release-gate's `codex` lane runs
    with **write access in the worktree under review** and, during round 1, reformatted 1,502
    files in it (a repo-wide Prettier sweep). It was caught because a control `tsc` run showed a
    line-number shift in `lib/integrations/xero/upstream-errors.ts` — a file this branch does not
    touch. The sweep was verified format-only and discarded, the seven real files restored from
    backup, and every gate re-run at the restored state. A reviewer that can mutate the tree it is
    judging is a live hazard to any session that trusts a post-review verification; the
    HTTP-only lanes (OpenRouter/Gemini) do not have this property.
  - **Not observed.** No run against a live deployment or a real Guidewire endpoint — the route
    returns JSON and makes no outbound call (credentials are insurer-side), and the payload
    builder is a pure function, so the behaviour is proven by unit tests with mutation controls
    rather than by a carrier round-trip. No production database was read; the reachability of the
    NULL path is proven from the schema (`Float?`) and the conditional write in the upload route,
    not from a row count.
- [PASS] **Release-gate F1 — the billing-webhook alert signal (prerequisite, not a gap-audit
  row)** — the release gate ran to completion for the first time on 2026-08-26 and scored
  **35/85, blocked fail-closed** (PR #2067). Of the 35 remaining points, F1-monitoring-alerting
  is the only criterion carrying a code-side prerequisite an agent can close; A1, A3, C2, D1 and
  D3 need a live environment, a Stripe dashboard lookup, or owner evidence.
  - **The defect, quoted from F1's own evidence file:** the rules table's obvious alert for
    "billing webhook errors" would never have fired. On an **ordinary** processing failure the
    Stripe webhook handler wrote `StripeWebhookEvent.status = 'FAILED'` and returned a bare
    `NextResponse.json(…, { status: 500 })` with **no console output at all** — the two
    `console.error` calls in that catch block sit inside the audit write's own `.catch()` and
    fire only on the rare **double** failure. Vercel Observability cannot read a database row,
    so the only observable signal was a status code carrying neither the Stripe event id nor
    the error. F1 offered Option A (alert on the bare 500) and Option B (emit a log line first),
    and warned: make the code change **before** creating the rule, or the rule matches nothing.
  - **Option B is now done, and it is a one-file convergence rather than new machinery.** That
    catch block was the only error path in the handler not going through `apiError` — the same
    helper its `no signature`, `webhook secret not configured` and `invalid signature` paths
    already use, and which calls `reportError` for every 5xx. The 500 is unchanged, so Stripe's
    retry behaviour is untouched and Option A survives as a fallback rule; the failure now also
    emits the repository's standard `[error]` line with
    `stage: "stripe-webhook:processing"`, the route, the correlation `eventId`, the Stripe
    event id, the event type and the original message.
  - **The other two F1 failure classes were checked and need nothing.** Auth failures already
    emit `[security] LOGIN_FAILED` (`lib/security-audit.ts:65-70`, deliberately non-PII), and
    restore/report failures already emit `console.error` at the failure point
    (`lib/queue/storage-restore.ts`). The sweep of the other money-path webhook routes (Xero,
    QuickBooks, MYOB, Ascora, ServiceM8, dr-nrpg) found every raw 500 already logging, so this
    was the single silent one and no other file is touched.
  - **Tests:** `app/api/webhooks/stripe/__tests__/processing-failure-observability.test.ts`
    (4/4) pins the fields an alert rule filters on — stage, route, status, code, Stripe event
    id, event type, original message — rather than the wording of the message, plus the 500 and
    the FAILED audit write as regression guards.
  - **Positive control:** the suite was run against the **unmodified `origin/main`** handler and
    **3 of its 4 tests fail**. The fourth is the negative control ("no `[error]` line on a
    successful delivery"), which must pass on both sides and does — so the suite is not
    trivially green.
  - **Mutation controls — five mutants, all killed**, sources restored byte-identical after each
    (`route.ts` sha256 `2776f309…`, `lib/api-errors.ts` sha256 `59e0af33…`, before and after):
    dropping `err` loses the error message; mis-labelling the `stage` breaks the field the rule
    filters on; dropping the Stripe context loses the event id; logging **unconditionally** —
    which would page on every healthy webhook — kills the negative control; and generating the
    response's `eventId` independently of the log's makes the two diverge, killing the
    correlation assertion. The sweep was re-run over **all five** after the correlation
    assertion was added, not carried over, because that edit changed the shared test file every
    mutant crosses.
  - **Independent review — every finding drained, none argued away.** Codex was probed live and
    is usage-capped, so review went over HTTP through OpenRouter to `openai/gpt-5.6-sol` — a
    different vendor's model in a fresh context, not a subagent of the implementing agent. Four
    findings were raised across successive rounds; what each one did to this branch:
    - **P1, "forwarding the unsanitised exception to observability creates a new sensitive-data
      disclosure path" — refuted by measurement, then withdrawn by the reviewer.**
      `fromException` (`lib/api-errors.ts:112-190`) forwards the raw `err` to `apiError` on
      **every** branch including the catch-all 500, and **442 of ~465** API route files use it —
      the whole PII-bearing surface (`app/api/invoices/**`, `users/**`, `auth/**`, `support/**`)
      included. This route's bare `NextResponse.json` was the outlier that *lacked* the
      convention. Sanitising here alone would make it the one route whose 500s carry no
      diagnostic, defeat F1's explicit ask for the error message, and leave the 442-route
      exposure untouched. The reviewer's own words on reconsideration: "no concrete sensitive
      value is demonstrated here, so this is not sustained as the round-1 P1." The repo-wide
      `reportError` redaction question survives as a **documented P2**.
    - **P2, the correlation id was claimed but not asserted — fixed, not filed.** The tests
      established a structured log and a non-empty response `eventId` separately but never
      asserted the two were the *same* value, while the evidence said the id "pairs" them. A
      claim with no control. The assertion and mutant M5 were added.
    - **P1, the fifth mutant was represented as measured without a record — supplied.** The
      claim was true and the run had happened, but the reviewer had not been shown it. Correct
      finding against the evidence, not the code.
    - **P1, "before and after each" overstated a per-sweep hash as a per-mutant one — measured
      rather than reworded.** The first sweep hashed once at each end. The wording could have
      been weakened; instead the sweep was re-run printing all three source hashes **after
      every single restoration**, so the sentence is now literally what was measured. All five
      restorations return `2776f309…` / `59e0af33…` / `7f23e334…`.
    - **No Linear ticket id is quoted for the surviving P2** because the Linear MCP is
      unauthenticated in this non-interactive session; inventing an id would be worse than
      naming the gap.
  - **Verified on a clean `npm ci` install with the Prisma client generated** — the whole
    repository definition of done, not a subset: `npm run type-check` exit **0**;
    `npm run lint` exit **0** (707 pre-existing warnings, zero errors); the **full** vitest
    suite exit **0** — **904 files passed / 20 skipped, 6946 tests passed / 107 skipped**;
    `npx eslint -c config/eslint.config.mjs` over both changed source files — exit 0, no
    output; and all **12** CI `Quality Checks` guards enumerated from
    `.github/workflows/pr-checks.yml` — **12/12 PASS**, `audit:prod` included (no un-ignored
    high/critical advisories across 1403 prod packages).
  - **An earlier reading of the typecheck was an environment artefact, and is recorded rather
    than quietly dropped.** Before the clean install, this worktree borrowed the main
    checkout's `node_modules`, and `tsc --noEmit` reported **97 errors** — all in
    `lib/pilot-tester/budget-contract.ts`, `lib/pilot-tester/judge.ts`,
    `lib/ai/adjuster-agent.ts` and two route files, none of which this change touches. The
    cause was a **stale generated Prisma client**: `prisma/schema.prisma` declares
    `PilotJudgeReceipt` (`:6062`) and `PilotBudgetReservation` (`:5973`) and the borrowed
    client lacked both. That was first shown to be not-this-branch by diffing against a
    pristine `origin/main` worktree in the identical environment (byte-identical output), and
    is now shown **directly**: with `npm ci` plus `prisma generate`, `type-check` exits 0 and
    the 97 errors do not exist. The comparison was the weaker instrument and the direct run
    supersedes it — a borrowed `node_modules` is a confound to remove, not to reason around.
  - **Still owner-gated, and untouched by this:** creating the three Vercel Observability alert
    rules (F1 Step 2), firing the alert test against sandbox (Step 3), setting the empty
    `SUPABASE_ACCESS_TOKEN` secret, and creating the missing `security` GitHub label so the
    advisor gate's failure notifier can actually file an issue. **Not observed:** no run against
    a live deployment — code cannot create a Vercel alert rule, and a rule that has never fired
    is not evidence. This closes only the prerequisite F1 names.
