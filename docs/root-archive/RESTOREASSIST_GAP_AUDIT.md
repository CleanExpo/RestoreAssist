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
- [PASS] **Phase 3 / Phase 4 — the setup wizard's Integrations step now tells the truth when a
  connect fails** (founder-prioritised: "ensure Xero + QuickBooks + other bookkeeping
  integrations work from day 1").
  `IntegrationsCard.handleConnect` did `if (res.ok)` and dropped every other outcome on the
  floor — no spinner, no message, no state change. A click that failed was indistinguishable
  from a click that never registered.
  - **Why that is a day-1 blocker, not a cosmetic gap.**
    `POST /api/integrations/oauth/[provider]/connect` gates Xero, QuickBooks and MYOB behind the
    `BOOKKEEPING` add-on (`requireAddon` → 402 `ADDON_REQUIRED`). A workspace that has not bought
    it — **every** workspace during onboarding — gets a 402 on every attempt, forever, in
    silence. Compounding it, `getWorkspaceForUser` returns null for workspaces that were never
    provisioned, which is the 402 `NO_WORKSPACE` branch. The 403 paid-subscriber gate
    (`checkIntegrationAccess`) and the 500 from a missing `<PROVIDER>_CLIENT_ID` were equally
    invisible.
  - **Ascora was 100% dead, deterministically.** The OAuth route now answers
    400 "Ascora does not use OAuth. Use /api/ascora/connect…" unconditionally (its old shortcut
    was removed because it marked CONNECTED on the mere presence of an env var). Ascora
    authenticates with an operator-supplied API key, so a one-click Connect could never work.
    Its tile now says it needs an API key and hands the operator to the Integrations page where
    the key form lives, instead of posting to a route that can only reject it.
  - **A second, flag-time loop behind it.** None of the wizard's outbound destinations were in
    `proxy.ts`'s `SETUP_GATE_BYPASS`, so with `SETUP_WIZARD_ENABLED=true` every remedy the card
    offers 307s straight back to `/setup` — including the **connect POST itself**
    (`/api/integrations/oauth/…` does not start with the already-bypassed `/api/oauth/`), which
    the card's `fetch` follows, receives `/setup`'s HTML with `res.ok === true`, and throws on
    `json()`. Bypass entries were added for `/api/integrations/oauth/`,
    `/dashboard/subscription`, `/dashboard/integrations` and `/dashboard/settings/ai-providers`
    — each traceable to one control on `/setup`. The additions are path-exact rather than a
    blanket `/dashboard`, and a test asserts `/dashboard`, `/dashboard/reports/new`,
    `/dashboard/settings` and `/api/integrations/health` are still gated.
  - **The server's `redirectUrl` is deliberately not used as a link target.** `requireAddon`'s
    deny body points at `/subscribe`, and `app/subscribe` **does not exist** — following it
    would 404 the operator. The wizard owns its own destination, which also keeps the links and
    the bypass list in agreement about which paths must stay reachable mid-setup. This removes
    the attacker-controllable-href question entirely rather than sanitising it.
  - **Failure handling.** `lib/setup/integration-connect-error.ts` maps the route's four
    envelope shapes — `requireAddon` 402 (raw `{ error, code, sku, action, redirectUrl }`), the
    403 subscription gate (raw, with the operator-facing sentence in `message` and the terse
    half in `error`), `apiError`'s RA-1548 `{ error: { code, message } }`, and anything else
    including a non-JSON body — to one sentence plus an optional action. It is a pure function
    with its own suite, for the same reason `activation-error.ts` is: passing `body.error`
    straight to React throws "Objects are not valid as a React child", and that must not be
    re-derived per call site. 5xx deliberately does **not** surface the internal reason
    (a missing `<PROVIDER>_CLIENT_ID` is not the operator's to fix or to see).
  - **No schema change, no migration, no new dependency, no env change.** Inert until
    `SETUP_WIZARD_ENABLED=true`.
  - **Tests:** `IntegrationsCard.test.tsx` 4 → 14 (402 add-on with its link, 403 paid gate,
    5xx without the leak, network throw, 200-without-authUrl, non-JSON body, pending/disable/
    single-fire, stale-failure clearing, and both Ascora behaviours);
    `lib/setup/__tests__/integration-connect-error.test.ts` +12;
    `middleware-setup-gate.test.ts` 12 → 18 (connect POST, provider callback, the three
    destination paths, and the not-a-blanket-bypass negative).
  - **A guard that no test could kill was removed rather than shipped.** The first cut carried
    an `if (pending) return` re-entrancy check inside `handleConnect` beside the tiles'
    `disabled={pending !== null}`. It survived the sweep, and the reason is structural: React
    decides whether to run `onClick` from the committed fiber props, so no click reaches the
    handler while `disabled` is set — and before the commit, the closure's `pending` is still
    the stale `null`, so the check could not fire then either. Deleted per CLAUDE.md §2, with a
    comment naming the pending test as the thing that must go red if the tiles ever stop being
    real disabled `<button>`s.
  - **Mutation controls — 17 mutants, all killed, no survivors**, source restored byte-identical
    and confirmed by sha256 (`IntegrationsCard.tsx` e2c77ded…, `integration-connect-error.ts`
    f12b7089…, `proxy.ts` a959d95d…). They cover: swallowing non-ok (the original defect),
    never disabling in flight, dropping the pending label, dropping the missing-authUrl guard,
    putting Ascora back on the OAuth route, not clearing a stale failure, swallowing the network
    throw, never rendering the alert or its action link, each of the four helper branches,
    printing the raw SKU instead of the add-on name, ignoring the 403 operator message, linking
    at the `/subscribe` 404, dropping each of the four bypass entries, and a negative control
    that widens the bypass to all of `/dashboard`.
    **One false survivor was found and corrected in the instrument, not the code:** the first
    "never disable in flight" mutant replaced the first textual occurrence of
    `disabled={pending !== null}`, which is inside the comment that quotes it — so it passed 26
    tests while changing no behaviour at all. Re-aimed at the JSX occurrence, it kills the
    pending test. A mutant that does not change behaviour is not evidence of a weak test.
  - Verified at source head `17d4cecdc` (the line below is docs-only and changes no source, so
    this evidence describes the final source state):
    `npx vitest run --config config/vitest.config.js components/setup lib/setup
    lib/__tests__/middleware-setup-gate.test.ts lib/__tests__/middleware-hard-paywall.test.ts`
    — **193 passed / 25 skipped / 1 failed**; the one failure is
    `VideoExplainer.test.tsx > shows an 'unavailable' panel when the video source errors`, which
    is **pre-existing on `main` and not caused by this change**: `VideoExplainer.tsx` and its
    test are byte-identical to `origin/main`, their import closure never reaches any file in
    this diff, and the test fails deterministically (2/2 runs) when run alone in a process that
    loads none of this branch's code. `npx eslint` over all six changed files — exit 0, **0
    errors, 0 warnings**. Full `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` —
    **exit 0, zero errors, zero output**. Ten of the eleven CI content guards run locally —
    `check:no-emoji`, `check:spec-docs`, `check:encoding`, `check:ssot`, `check:standards`,
    `check:no-verbatim`, `check:marketing-verbatim`, `check:au-english`, `audit:ai`, `audit:api`
    — **all PASS**.
  - **One CI gate is red for a reason outside this diff.** `check:no-lucide` fails on
    `components/claims/StartClaimProgressButton.tsx: 1 (baseline 0)` — a file this branch does
    not touch (byte-identical to `origin/main`), added by `7580e718a` on 2026-08-17 without a
    baseline bump. Because `pr-checks.yml` runs on PRs and not on `main`, this main-wide debt is
    invisible until someone opens a PR, and it will mark **every** PR cut from current `main`
    UNSTABLE. It is deliberately **not** reconciled here: bumping the baseline inside an
    unrelated PR would rubber-stamp a Phill-Rule-1 violation. The repo's own precedent for this
    is a separate labelled reconcile PR (#2000, "chore(guards): reconcile lucide + audit:api
    debt"). Human step: either convert that file to `RAIcon`, or run
    `node scripts/check-no-lucide.mjs --update-baseline` in its own PR.
  - **Still founder-gated, and unchanged by this PR:** flipping `SETUP_WIZARD_ENABLED=true` is a
    Vercel env change on production. **Not observed:** no run against a live deployment with the
    flag on, and no live OAuth round-trip against Xero/QuickBooks/MYOB — that needs real provider
    credentials and human consent. The redirect behaviour is proven from `proxy.ts` under unit
    test, and the failure surface by unit tests with mutation controls, not by a browser session.
