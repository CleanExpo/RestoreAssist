# RestoreAssist Final Shipit Readiness — SPM Spec

> **Status:** DECISION-GRADE SCOPE (not implementation). Generated 2026-06-27.
> **Decision:** APPROVE SHIPIT REMEDIATION PLAN (Shipit itself NOT approved — repo evidence proves gates do not all pass yet).
> **Scope discipline:** This is a Shipit-readiness scope. No feature expansion, no redesign, no rebuild. New work is admitted only when it unblocks paid production use on **iOS + Desktop**.
> **Does NOT overwrite** the existing `spec.md` (that is the NIR capture→generate Definition-of-Done spec) or `docs/RELEASE_GATE.md` (the 100/100 go-live gate). This spec *orchestrates* those, it does not replace them.

---

## 1. Task being planned

Produce the exact, verifiable remediation plan that takes RestoreAssist from its current state (release gate **60/100, `passed:false`**, prod live-but-not-launched) to **Shipit-ready for paid client purchase and operational use on iOS devices and Desktop web**, with every launch blocker identified, scoped, verified, and either fixed or explicitly deferred. Android is triaged and given a documented decision, but does **not** block iOS/Desktop launch.

## 2. Current project context

- **Product:** RestoreAssist — Next.js 16 App Router compliance/inspection platform for Australian water-damage restoration (IICRC/AU compliance). Repo: `CleanExpo/RestoreAssist`. Prod: `https://restoreassist.app` (Vercel team `unite-group`, project `restoreassist`). Internal Unite-Group portfolio product.
- **Architecture (confirmed):**
  - **Web** = Next.js 16 App Router, SSR (NO static export — `next.config.mjs`), Prisma + Supabase Postgres, NextAuth (Google/Apple/Credentials), Stripe billing, AI layer (Anthropic primary + OpenAI/Gemini fallback + per-org BYOK). **This is the product.**
  - **iOS** = Capacitor 8 **server-hosted WebView** wrapping `https://restoreassist.app` (`capacitor.config.ts:22`) + native plugins (camera, geolocation, share, push/local-notifications, capgo SocialLogin for Apple+Google). TestFlight builds 1.0.2→1.0.x. **A thin shell over the same web app.**
  - **Android** = same Capacitor WebView wrap, same URL, same bundle `com.restoreassist.app`. AAB builds fine; **publish pipeline blocked** (see §11).
  - **Out-of-band native artifacts:** `/mobile` (separate Expo/React-Native field app — parked, never store-submitted) and `apps/cet` (kiosk SPA — not scaffolded). **Both out of launch scope.**
- **Prior readiness:** `FINAL_SHIPIT_READINESS_REPORT.md` (2026-05-24) said "not ship-ready" (RLS 119 tables, TLS, baseline). Two of three are now resolved in-repo (RLS 119/119 enabled; baseline merged). TLS remains owner-verify.
- **Release gate:** `docs/RELEASE_GATE.md` (RA-4956) — fail-closed 100-point gate, 60 machine-verifiable + 40 owner-evidence. Scorer `pnpm tsx scripts/release-gate-score.ts --json --strict`. **Current: 60/100 (`release-gate-report.json`, gen 2026-06-17).** Launch rule: **score==100 AND no open P0/P1 AND CI green AND Founder/Board acceptance.**
- **Culture:** verify-don't-trust. A subagent's "green," a "DONE-on-branch," and tests that silently skip when a DB/secret is absent are all UNVERIFIED until re-run with real inputs.

## 3. Launch definition

**"Shipit-ready for paid client purchase"** for RestoreAssist's first paid release means ALL of:
1. A desktop-web user can **sign up → start trial → purchase a paid plan (Stripe live mode) → be provisioned as paid** and use the core workflow (job/inspection → photo evidence → report → export).
2. An **iOS device** user can sign up, sign in (Apple/Google native), use the full core workflow, with **billing intentionally gated off-app** (Path B — see §9) in an Apple-compliant way, and the **App Store build is accepted**.
3. **Auth, tenant isolation, RLS, and payment webhooks** hold under the security gate with **no open Critical/High issue**.
4. **Required prod env/secrets** are set and **live billing is separated from test mode**.
5. The **release gate scores 100/100** with fresh owner-evidence, CI is green on a DB-backed run, and **Founder/Board acceptance** is recorded.
6. A **production smoke test** is documented and passing against `restoreassist.app`.

It does **NOT** require Android publish, the Expo field app, accounting connectors, push notifications, or content-generation tooling.

## 4. Supported platform decision

| Platform | Launch status | Basis |
|---|---|---|
| **Desktop web** (Chrome, Safari, Firefox, Edge) | **LAUNCH** | Primary purchase + work surface. Stripe checkout lives here. |
| **iOS** (iPhone + iPad, Capacitor WebView) | **LAUNCH** | Native shell of same web app; billing gated off-app (Apple-compliant Path B); App Store re-review pending owner confirm. |
| **Android** (Capacitor WebView) | **DEFER → separate remediation track** | Failure is publish-pipeline only (Google Play `androidpublisher` API disabled + Play account verification), **zero shared-code coupling**. See §11. |
| `/mobile` Expo app, `apps/cet` kiosk | **OUT OF SCOPE** | Parked / not scaffolded. |

## 5. In scope

- Closing the release gate from 60→100 (machine + owner-evidence).
- Live-billing verification (Stripe live price IDs, webhook, portal, test/live guard) + a real desktop test purchase + paid provisioning proof.
- iOS App Store re-review confirmation + on-device manual QA of core + billing-gate flows.
- Prod env/secret hardening: `CRON_SECRET`, `RESEND_FROM_EMAIL`+domain, explicit encryption keys, ABR GUID, TLS confirmation.
- Security closeout: secret-rotation proof (RA-2989/3034/3012), encrypt plaintext OAuth tokens (B3), scope the latent tool-layer IDOR before tools are wired, live Supabase advisor/RLS revalidation.
- CI trustworthiness: DB-backed Vitest in CI (RA-4951), fix Playwright @smoke failure (RA-…/undici), clear `audit:api` false-positive.
- Prod schema-drift reconciliation (RA-1807) — owner-gated DDL.
- Connector audit closeout: disable non-launch connectors, confirm launch connectors.

## 6. Out of scope

- Any new features or product redesign.
- Android publish (separate spec), Expo field app, CET kiosk.
- Accounting connectors (Xero/QuickBooks/MYOB/ServiceM8/Ascora), DR-NRPG feed, push notifications, ElevenLabs/HeyGen/Cloudinary content tooling, AWS S3, GitHub release-notes webhook — all **defer or disable for launch**.
- DeepSeek/Gemma/Ollama AI providers (cron/agent-only, not customer path) — disable for launch.
- CSP nonce migration, 851-lint-warning cleanup, neon→brand palette repaint — post-launch P2.

## 7. Existing capability review (reuse, do not rebuild)

Already built and PASS — the spec **reuses** these:
- **Release gate engine** (`scripts/release-gate-score.ts`, `docs/RELEASE_GATE.md`, owner-evidence under `docs/evidence/release-gate/1.0.0/`).
- **Audit suite:** `audit:rls`, `audit:api`, `audit:ai`, `audit:advisors`, `security:scan`, `audit-env.ts`, `check:no-emoji`.
- **Stripe billing** end-to-end: checkout (`app/api/billing/checkout`, `app/api/create-checkout-session`), signature-verified webhook (`app/api/webhooks/stripe/route.ts:61`), provisioning, cancel/refund/dunning, billing portal, completeness check (`lib/billing-completeness-check.ts`).
- **iOS billing gate (Path B):** server `rejectIfIOSCapacitor()` (`lib/ios-billing-guard.ts:40`) + client platform header + UI hiding — Apple 3.1.1/4.8 mitigation.
- **Auth/tenant isolation:** ownership-based, centralised in `lib/auth/assert-tenancy.ts`; admin re-validated from DB (`lib/admin-auth.ts:58`). **Not** the Synthex wrong-brand pattern.
- **RLS:** 119/119 tables RLS-enabled (`audit:rls`); RA-4956 migration applied in-repo.
- **Cron auth** fail-closed + timing-safe (`lib/cron/auth.ts:16`).
- **Encryption vault** AES-256-GCM (`lib/credential-vault.ts`).
- **Upload validation:** auth + 10 MB cap + MIME allowlist + content check (`app/api/upload/route.ts:8-81`).
- **Test infra:** Playwright e2e + @smoke (chromium/mobile-chrome/tablet-chrome), Vitest, `smoke-prod.yml` (every 15 min vs prod).
- **PDF/report generation** (pure-lib pdf-lib/jspdf, 7× `lib/generate-*-pdf.ts`).

## 8. Connector / integration audit plan

Per-connector format: Purpose | Status | Env | Test | Failure | Security | Decision.

**PASS (confirm env in prod, no code work):** Prisma/Postgres (`DATABASE_URL`,`DIRECT_URL`); Supabase storage+RLS (`NEXT_PUBLIC_SUPABASE_*`,`SUPABASE_SERVICE_ROLE_KEY`); NextAuth (`NEXTAUTH_SECRET`,`NEXTAUTH_URL`,`GOOGLE_*`,`APPLE_*`); AI core Anthropic (`ANTHROPIC_API_KEY`) + OpenAI/Gemini fallback + BYOK; Capacitor camera/geo capture; PDF generation; Sentry (`*_SENTRY_DSN`, optional).

**FIX BEFORE LAUNCH:**
| Connector | Action | Why |
|---|---|---|
| Stripe | Set live `STRIPE_PRICE_*` (5 IDs), live `STRIPE_WEBHOOK_SECRET`, live publishable/secret; configure live Billing Portal; add test/live-mode assertion guard | Checkout fails or mis-bills without these (`lib/pricing.ts` literal fallbacks are invalid IDs) |
| Cron (`CRON_SECRET`) | Set in prod; prune internal/agent crons (scout, board-meeting, brand-ambassador, design-system-onboarding) from `vercel.json` | Unset = all 18 crons 401 (trial reminders, email, storage restore silently dead) |
| Resend | Set verified `RESEND_FROM_EMAIL` + DNS domain | Unset = prod email silently sandboxed (paid-user emails never delivered) |
| Encryption keys | Set explicit `INTEGRATION_ENCRYPTION_KEY`,`CREDENTIAL_ENCRYPTION_KEY` (no `NEXTAUTH_SECRET` fallback) | Fallback/rotation = unrecoverable stored OAuth+BYOK tokens |
| Google Drive cloud-mirror | Verify Google OAuth consent screen (drive.file); reconcile dual auth paths (OAuth vs service account) | Unverified consent blocks real users — *only if Drive storage is a launch promise* (owner check) |

**DEFER AFTER LAUNCH:** accounting connectors, DR-NRPG, Cloudinary, push notifications, ElevenLabs/HeyGen, Firebase Google button (if redundant with NextAuth).

**REMOVE/DISABLE FOR LAUNCH:** AWS S3 (unused), GitHub webhook (internal), DeepSeek/Gemma/Ollama providers, internal agent crons.

**UNKNOWN / OWNER CHECK:** per-webhook signature validation on accounting routes (`grep -rn "WEBHOOK_SECRET\|constructEvent" app/api/webhooks/`) before any are enabled; whether Firebase Google button or NextAuth GoogleProvider is the launch sign-in path.

## 9. Payment and purchase readiness plan

- **Provider:** Stripe only. **No Apple IAP.** Billing model = recurring subs (tier + monthly/yearly Pro AUD$99/mo / $1188/yr) + report/quick-fill credits + one-off invoice PaymentIntents; 15-day no-card trial (50 report + 30 quick-fill credits).
- **Desktop:** checkout + portal work (CSRF + rate-limit + idempotency). **Action:** verify in **live mode** with a real test purchase → confirm `subscriptionStatus/subscriptionId/stripeCustomerId/creditsRemaining` provisioned.
- **iOS (Apple compliance — #1 historical risk, now MITIGATED):** Path B — iOS app sells nothing; `rejectIfIOSCapacitor()` 403s every billing route + UI hides signup/upgrade/manage. **Action:** (a) confirm App Store re-review acceptance (OWNER CHECK); (b) verify on device there is **no in-app CTA that steers to the website** (external-purchase steering can still draw 3.1.1).
- **Webhook:** signature-verified, event-deduped, idempotent; handles checkout/subscription/invoice/payment_intent/charge.refunded. **PASS** — re-test live with `STRIPE_WEBHOOK_SECRET`.
- **Test vs live boundary:** **FIX** — no code guard prevents test keys in prod or live keys in dev; add an `sk_live`/`sk_test` × `NODE_ENV` assertion; owner verifies prod holds live keys.
- **Refunds/cancellation/failed-payment:** cancel at period end; `charge.refunded`→CANCELED; `invoice.payment_failed`→PAST_DUE + middleware paywall. **PASS (basic)**; richer dunning = P2.
- **HUMAN APPROVAL REQUIRED:** any live key rotation / price edits / webhook endpoint changes.

Per-item decisions: desktop checkout **Pass(verify-live)** · iOS IAP **Pass(disabled-by-design)** · webhook **Pass** · provisioning **Pass** · refunds **Pass** · failed-payment **Pass(basic)** · test/live guard **Fix** · pricing drift **Fix**.

## 10. iOS / Desktop readiness plan

Core flows are implemented with strong e2e coverage (signup, login, setup/onboarding, inspection creation, report creation, evidence capture seam, billing authz, iOS billing gates via mocked Capacitor). **Gaps are device/live-only** — automated "iOS" Playwright projects are **Chrome-emulated viewports, not real WebKit**, so a real-device pass is mandatory.

**Manual QA — iOS device (real iPhone + iPad):** native camera capture + OS permission grant **and** denial; native share-sheet PDF/zip export; offline capture (airplane mode) → reconnect → sync drains; iOS billing gates render (no signup/upgrade/manage, no external billing link); Apple + Google native sign-in sheets (WKWebView cookie jar); 44px touch targets; splash/status-bar (black-screen regression watch); loading/error/empty visuals on slow network.

**Manual QA — Desktop:** password-reset email submit→inbox→reset; real Stripe Checkout purchase + declined-card failure UI; PDF/Excel/zip report download; inline form-validation messages; Safari + Chrome + Firefox + Edge parity.

## 11. Android triage plan

- **Type:** Capacitor WebView wrap (same app/URL/bundle as iOS). Not Expo/RN/native for the store shell.
- **What fails:** **NOT build, NOT runtime, NOT auth/camera/upload/sync/layout/browser-compat.** AAB builds; signed bundle exists. The **publish step fails**: `r0adkll/upload-google-play` errors because the Google Play **`androidpublisher` API is DISABLED** on GCP project `292141944467` (RA-2997; 5 failed runs in May). Secondary: deprecated `track:internal`→`tracks:[internal]`; service account needs Release-manager role; Play Console account `airestoreassist@gmail.com` needs phone+identity verification.
- **Shared vs isolated:** **Shell/release-isolated.** Both shells load the identical web deployment; any real bug would surface on iOS/desktop too — none does. Blocker lives entirely in the Play upload job + an external GCP toggle.
- **DECISION: Android = post-launch P1 on a SEPARATE remediation track. NOT an iOS/Desktop launch blocker.** Unblocks the moment the owner enables the API + completes Play account verification.
- **Action:** create `ANDROID_REMEDIATION_SPEC.md` (separate). Owner actions: enable `androidpublisher` on GCP `292141944467`; finish Play Console verification; migrate track config; grant SA Release-manager. Then re-run `gh run list --workflow=android-release.yml`.

## 12. Security and privacy readiness plan (ASVS web/API + MASVS concepts)

**Strong baseline confirmed:** ownership-based tenant isolation; 119/119 RLS; all webhooks signature-verified; uploads validated; no service-role key in client; `NODE_TLS_REJECT_UNAUTHORIZED` absent from executable code + listed FORBIDDEN_ENV; `.gitleaks.toml` present; security:scan PASS (470 routes).

**MUST CLOSE (Critical/High — block launch):**
- **H1 — Latent tool-layer IDOR** in Live-Teacher AI tools: `lib/live-teacher/tools/check-report-gaps.ts:21`, `take-reading.ts:39`, `fill-scope-item.ts` accept a model-controlled `inspectionId` with **no tenancy scoping** and ignore `context.userId`. Currently UNWIRED (`claude-cloud.ts:238` does not dispatch tools). **Action:** route every tool through `assert-tenancy` using the session-bound inspection; ignore model-supplied IDs. **BLOCK the RA-1132f tool-wiring PR until fixed.**
- **B3 — Plaintext Google OAuth tokens** in `Account` table (HIGH, OPEN). **Action:** encrypt at rest + run `pnpm backfill:account-tokens`; verify no plaintext remains.
- **Secret-incident cluster (RA-2989 6 leaked keys, RA-3034 committed service-role JWT, RA-3012 secret stripper):** **Action:** confirm rotation completed and old secrets revoked (OWNER CHECK + evidence file).

**FIX BEFORE FIRST CLIENT (Medium):**
- `audit:api` `[error]` on `app/api/storage/restore/[jobId]/retry/route.ts` is a scanner false-positive (route IS owner-gated) but **fails the CI gate** — add exemption/inline guard.
- Live Supabase advisor/RLS + anon-policy **release-day revalidation** (`SUPABASE_ACCESS_TOKEN=… pnpm audit:advisors` → expect 0 findings). OWNER CHECK.
- CSP `'unsafe-inline'`/`'unsafe-eval'` (`next.config.mjs:93`) — accept for launch with risk note; nonce migration = P2.

**Known-prior-blocker verification table:**
| Blocker | Status | Action |
|---|---|---|
| Public-route sign-offs (~19 token/monitoring routes) | REQUIRES OWNER CHECK | Document scope/expiry/rate-limit per route |
| Mobile offline/device evidence (MASVS) | REQUIRES OWNER CHECK | Capture device-test artefact (secure storage, no cert issues) |
| Supabase anon-policy release-day revalidation | STILL OPEN | Run live advisors on release day |
| Vercel TLS / NODE_TLS prod | VERIFIED (repo) / OWNER CHECK (live) | `vercel env ls production \| rg NODE_TLS_REJECT_UNAUTHORIZED` (expect empty) |
| Protected PR template / case-collision artefact | REQUIRES OWNER CHECK | Confirm `.github/PULL_REQUEST_TEMPLATE.md` on remote main |
| Latent tool-layer IDOR | STILL OPEN | H1 above |

**Privacy:** confirm user data export/deletion path if a paid-client contract requires it (UNKNOWN — owner/legal check).

## 13. UX and client onboarding readiness plan

Reuse existing setup/onboarding e2e (`setup-happy-path`, `setup-resume`, `setup-no-abn`, `setup-skip-manual`, storage-google-drive). **Action:** run the §10 manual QA checklists on real iOS device + desktop browsers; confirm client-facing copy clarity on pricing/trial/billing pages; confirm empty/loading/error states render. No new onboarding features.

## 14. Verification plan (exact commands)

Run from repo root. Items needing DB/live/device are flagged — **green ≠ verified when inputs are absent** (tests SKIP silently).

| Category | Command | Needs |
|---|---|---|
| Typecheck | `pnpm type-check` | — |
| Lint | `pnpm lint` | — |
| Emoji guard | `pnpm check:no-emoji` | — |
| Unit/integration (full fidelity) | `pnpm test:db` | Docker (ephemeral pgvector) |
| Unit (fast, partial) | `pnpm exec vitest run` | DB-gated tests SKIP w/o `DATABASE_URL` |
| AI guardrail audit | `pnpm audit:ai` | — |
| API route audit | `pnpm audit:api` | — (must be 0 errors — clear the false-positive) |
| RLS static | `pnpm audit:rls` | — |
| RLS isolation (live) | `make -f test/rls/Makefile rls-test` | local Postgres/Docker |
| Supabase advisors (LIVE) | `SUPABASE_ACCESS_TOKEN=… pnpm audit:advisors` | prod token (OWNER) |
| Security scan | `pnpm security:scan` | — |
| Forbidden env / TLS | `pnpm tsx scripts/audit-env.ts` | — |
| Stripe webhook | `pnpm exec playwright test e2e/stripe-payment-intent-webhook.spec.ts` | `STRIPE_WEBHOOK_SECRET` or SKIPS |
| Billing e2e | `pnpm exec playwright test e2e/billing e2e/ios-billing-gates.spec.ts e2e/trial-no-paywall.spec.ts` | seeded env |
| Upload/capture e2e | `pnpm exec playwright test e2e/tech-evidence-capture-no-modal.spec.ts e2e/first-tradie-flow.spec.ts` | seeded env |
| Browser/PWA smoke | `pnpm test:smoke` | local server (auto) |
| iOS viewport (emulated) | `pnpm exec playwright test --project=tablet-chrome --project=mobile-chrome` | NOT a real device |
| Desktop browser | `pnpm exec playwright test --project=chromium` | — |
| Build | `pnpm build` (no-DB variant `pnpm validate:next-build-no-db`) | 8GB heap |
| Dep audit | `pnpm audit --audit-level=high --prod` | network |
| Release gate score | `pnpm tsx scripts/release-gate-score.ts --json --strict` | — (target 100) |
| Prod TLS env | `vercel env ls production --scope unite-group \| rg NODE_TLS_REJECT_UNAUTHORIZED` | Vercel auth (OWNER) |
| **Prod smoke** | `pnpm test:smoke:prod` | LIVE prod + network |

**Production smoke procedure:** `pnpm test:smoke:prod` = `CI=true PLAYWRIGHT_BASE_URL=https://restoreassist.app playwright test --grep @smoke --no-deps --reporter=line`. Asserts public `/signup` renders with no paywall; trial user reaches `/dashboard/inspections/new` + `/dashboard/reports/new` with no upgrade wall; pilot workflow + Google-Drive storage setup. `--no-deps` skips authed login legs (they SKIP without `ALLOW_TEST_HELPERS`/storageState — note this gap). Confirm no @smoke leg mutates prod data.

> The implementation agent MUST actually run these and paste real output. Do not claim pass without evidence.

## 15. Loop testing and stress testing

- **Concurrency/idempotency:** `e2e/billing/webhook-race.spec.ts`, `lib/__tests__/bulk-credits-atomic.test.ts`, RA-1266 idempotency, RA-4863 submit-lifecycle (no auto-promote to COMPLETED). Re-run under DB.
- **Credit exhaustion / paywall:** `e2e/billing/credit-exhaust.spec.ts`, `middleware-hard-paywall.test.ts`, `trial-no-paywall.spec.ts`.
- **Sync resilience:** `lib/__tests__/nir-sync-queue-failed-recovery.test.ts` + manual airplane-mode loop on device.
- **Cron fail-closed:** curl each cron route with/without Bearer `CRON_SECRET` → expect 401/200.
- **Rate-limit:** hammer `POST /api/create-checkout-session` → confirm rate-limit holds.
- **Prod heartbeat:** `smoke-prod.yml` runs @smoke every 15 min — confirm green for N consecutive runs pre-launch.

## 16. Known blockers and suspected blockers

**Resolved since 2026-05-24 (RE-VERIFY on prod, don't trust):** RLS 119-table gap (now 119/119 — re-run live advisors); Phase-0 baseline merge (main past #1495); all RLS/security goals #1/#2/#10/#11/#25 (claimed DONE 2026-06-16 — re-run live `get_advisors(security)`); BYOK fix set (claimed DONE on branch `fix/ra-resend-from-guard` — **confirm MERGED to main**); Resend sandbox-fallback fix.

**Still open (this spec closes):** release gate 60→100 (RA-6688); prod schema drift RA-1807 (owner DDL); Vitest DATABASE_URL in CI RA-4951; Playwright @smoke undici/webidl (gates A1/B4); test/live billing guard + pricing drift; prod env (`CRON_SECRET`, `RESEND_FROM_EMAIL`, encryption keys, `ABR_API_GUID` RA-6678); TLS live confirm; H1 IDOR; B3 plaintext tokens; secret-rotation proof RA-2989/3034/3012; live advisor revalidation; 5 deferred owner-evidence files (25 gate pts, RA-5628); Founder/Board acceptance (RA-4956).

**Suspected (Synthex-style "tests-green ≠ prod-works"):** prod schema drift means DB-mocked tests can pass while prod flows break — RA-1807 reconciliation is the highest-risk owner item; treat any "passing" claim on DB-touching code as unverified until run against a real schema.

## 17. P0 / P1 / P2 task breakdown

### P0 — launch blockers (iOS + Desktop paid release cannot ship without these)
- **P0-1** Release gate 100/100 (`scripts/release-gate-score.ts --strict`) — umbrella; satisfied by the items below + owner-evidence.
- **P0-2** Live Stripe verified: 5 `STRIPE_PRICE_*` live IDs, live webhook+secret, live Billing Portal, test/live-mode guard; **real desktop test purchase → paid provisioning proven.** (OWNER CHECK Stripe dashboard; HUMAN APPROVAL for live edits.)
- **P0-3** Prod env/secrets set: `CRON_SECRET`, `RESEND_FROM_EMAIL`+domain, explicit `INTEGRATION_ENCRYPTION_KEY`/`CREDENTIAL_ENCRYPTION_KEY`, `ABR_API_GUID` (RA-6678). (OWNER)
- **P0-4** Security closeout: secret-rotation proof RA-2989/3034/3012; encrypt plaintext OAuth tokens B3 (`backfill:account-tokens`); scope tool-layer IDOR H1 & block RA-1132f. 
- **P0-5** Live Supabase advisor/RLS + anon-policy revalidation = 0 findings. (OWNER token)
- **P0-6** Vercel prod TLS confirm (`NODE_TLS_REJECT_UNAUTHORIZED` absent). (OWNER)
- **P0-7** CI trustworthy: DB-backed Vitest in CI (RA-4951); fix Playwright @smoke (RA-…/undici) so A1/B4 pass; clear `audit:api` false-positive.
- **P0-8** Prod schema drift RA-1807 reconciled. (HUMAN APPROVAL — owner-gated DDL)
- **P0-9** iOS: App Store re-review accepted (Path B) + on-device manual QA pass (billing gates, sign-in, camera, offline, share). (OWNER device)
- **P0-10** Confirm BYOK/security/Resend fixes MERGED to main (not branch-only); re-run prod smoke green.
- **P0-11** Refresh 5 deferred owner-evidence files D1/D3/E1/E2/F1 (25 gate pts, RA-5628). (OWNER)
- **P0-12** Founder/Board sale-readiness acceptance recorded (RA-4956). (HUMAN)

### P1 — fix before first client onboarding
- Pricing config drift (two pricing systems + literal fallback IDs) cleanup.
- Google Drive OAuth consent Google-verification + dual-path reconcile (if Drive is a launch promise).
- Disable non-launch connectors/crons (AWS S3, GitHub webhook, DeepSeek/Gemma/Ollama, internal agent crons).
- 8 high CVEs triage (currently warn-only).
- Desktop manual QA (password-reset email, declined-card UI, export downloads, multi-browser parity).

### P2 — post-launch
- CSP nonce migration; 851 lint warnings; neon→brand palette (68 pages); richer dunning emails; accounting connectors; push notifications; content tooling.

### Deferred / not required for first paid release
- **Android publish** (separate `ANDROID_REMEDIATION_SPEC.md`, RA-2997); `/mobile` Expo app; `apps/cet` kiosk.

## 18. Specialist board review

Format: Finding · Risk · Evidence needed · Recommendation · Launch-blocker status.

- **Senior Product Manager** — Finding: launch definition is crisp (desktop purchase + iOS usage, billing off-app). Risk: scope creep from parked native apps. Evidence: confirm "first paid client" persona = AU restoration tech on desktop, iOS optional. Rec: hold the line on §6. **Blocker: No (scope is sound).**
- **Senior Release Manager** — Finding: gate at 60/100; 25 pts are owner-evidence not code. Risk: agent burns time on machine points while owner-evidence and Founder acceptance silently block. Evidence: assign owners + dates to P0-11/P0-12 now. Rec: parallelise owner items with code items. **Blocker: Yes until 100/100.**
- **Senior Security Engineer** — Finding: baseline strong; two real holes (H1 IDOR latent, B3 plaintext tokens) + secret-rotation unproven. Risk: cross-tenant data exposure once tools wired; token theft. Evidence: tenancy-scoped tool dispatch, encrypted Account tokens, rotation evidence files. Rec: P0-4 mandatory. **Blocker: Yes (B3 + rotation now; H1 before RA-1132f).**
- **Senior Mobile/iOS Engineer** — Finding: iOS is a WebView shell, billing correctly gated; no real-device automated gate exists. Risk: App Review rejection / device-only regressions (black screen, cookie jar, camera perms). Evidence: App Store Connect status + signed device QA artefact. Rec: P0-9. **Blocker: Yes (re-review + device QA).**
- **Senior Web/Desktop QA** — Finding: strong e2e; key paid paths (real purchase, declined card, export download, password reset) are manual-only. Risk: paid funnel breaks unobserved. Evidence: execute desktop manual checklist + live purchase. Rec: P0-2 + P1 desktop QA. **Blocker: Partial (live purchase = P0).**
- **Senior Payments/Stripe Engineer** — Finding: implementation solid; live-mode config + test/live guard unproven. Risk: mis-billing or test keys in prod. Evidence: live price IDs + webhook + a real test purchase + mode guard. Rec: P0-2. **Blocker: Yes.**
- **Senior Supabase/Postgres/RLS Engineer** — Finding: 119/119 RLS in-repo; live state + prod schema drift unverified. Risk: drift breaks prod flows that mocks hide; anon policy regression. Evidence: live advisors=0; RA-1807 reconcile. Rec: P0-5 + P0-8. **Blocker: Yes.**
- **Senior UX Reviewer** — Finding: core flows + states implemented; copy clarity and small-screen touch targets need human eyes. Risk: client-facing confusion on trial/billing. Evidence: manual UX pass on pricing/trial/billing copy. Rec: P1. **Blocker: No.**
- **Devil's Advocate / Judge** — Finding: much is "DONE on branch" / "claimed verified" / tests that SKIP without DB or secrets. Risk: false-green launch. Evidence: re-run every gate with real DB + live tokens; confirm merges to main. Rec: treat §16 re-verify list as mandatory. **Blocker: Yes (trust nothing un-re-run).**

## 19. Judge challenge and score

Scoring the **spec's decision quality** (not the app):

| Criterion | Score | Note |
|---|---|---|
| First-source evidence | **24/25** | Every claim file:line-cited across 6 gate investigations; live prod items honestly marked OWNER CHECK. |
| Clear launch objective | **20/20** | §3 launch definition is unambiguous and platform-split. |
| Existing capability reuse | **15/15** | Reuses release gate, audit suite, billing, RLS, test infra; no rebuild. |
| Security/privacy safety | **11/15** | Two open Critical/High (H1, B3) + unproven rotation + live advisors pending — correctly blocks Shipit. |
| iOS/Desktop UX readiness | **8/10** | Strong e2e; real-device + live-purchase gaps are device/owner-bound, not closeable in-repo. |
| Testability | **9/10** | Exact command catalogue; honest about SKIP-without-inputs false-green. |
| Cost/control simplicity | **5/5** | Disables non-launch connectors; no new infra; owner gates explicit. |
| **TOTAL** | **92/100** | |

**Decision: APPROVE SHIPIT REMEDIATION PLAN.** Shipit is NOT approved — evidence proves the release gate is 60/100 with open P0 security/billing/env items. The remediation plan is decision-grade and ready for implementation. Proceed to `/goal`.

## 20. Acceptance criteria

Shipit-ready ⇔ ALL true:
1. iOS purchase path is an **approved compliant off-app path** (Path B) **and** App Store build accepted.
2. **Desktop purchase path works in live mode** (proven by a real test purchase).
3. **Paid user provisioning works** (DB fields set post-payment, verified).
4. **Auth + tenant isolation pass** (no open Critical/High; H1 scoped, B3 encrypted, rotation proven).
5. **All required connectors pass or are explicitly disabled/deferred** (§8).
6. **Supabase/RLS/public-route risks signed off** (live advisors = 0; anon-policy revalidated; route sign-offs documented).
7. **Stripe live mode clearly separated from test** (mode guard + owner-confirmed live keys).
8. **Upload/photo/report flows work on iOS (device) and desktop.**
9. **No critical/high security issue remains.**
10. **Required verification commands pass** with real DB + live inputs (not SKIP-green).
11. **Production smoke test documented and green** (`test:smoke:prod`, plus N green scheduled runs).
12. **Android decision documented** = separate remediation track (this spec records it).
13. **Release gate = 100/100** and **Founder/Board acceptance recorded.**

## 21. Exact /goal command for implementation

```
/goal Execute the RestoreAssist Final Shipit Readiness remediation plan in SHIPIT_READINESS_SPM_SPEC.md for the iOS + Desktop first paid release. Work the P0 list in §17 to green, then P1. Use TDD where code changes are needed; for every verification in §14 run the actual command and paste real output (DB-backed via `pnpm test:db`, never SKIP-green). Drive `pnpm tsx scripts/release-gate-score.ts --json --strict` from 60 toward 100. Do NOT touch live billing, run prod DDL, rotate secrets, or change Vercel/Supabase/Stripe/App Store dashboards yourself — for every such item STOP and emit a single batched "OWNER ACTIONS REQUIRED" checklist (Stripe live price IDs/webhook/portal; CRON_SECRET/RESEND_FROM_EMAIL/encryption keys/ABR_API_GUID in Vercel prod; prod TLS confirm; live Supabase advisor run; prod schema-drift RA-1807 DDL approval; secret-rotation proof RA-2989/3034/3012; App Store re-review; 5 owner-evidence files; Founder/Board acceptance). In-repo P0 you CAN do now: scope the Live-Teacher tool-layer IDOR (H1) and block RA-1132f; encrypt plaintext Account OAuth tokens (B3) + backfill; add Stripe test/live-mode guard; fix DB-backed Vitest in CI (RA-4951); fix Playwright @smoke undici failure (A1/B4); clear the audit:api false-positive; reconcile pricing-config drift; disable non-launch connectors/crons (AWS S3, GitHub webhook, DeepSeek/Gemma/Ollama, internal agent crons); confirm BYOK/Resend/security fixes are merged to main. Android is OUT OF SCOPE — instead create ANDROID_REMEDIATION_SPEC.md capturing the Google Play androidpublisher-API/account-verification track (RA-2997). Stop when the release gate is 100/100 with all §20 acceptance criteria met or every remaining item is an owner/human gate, then produce a final evidence-backed readiness report.
```

## 22. Session handoff seed

```
PROJECT: RestoreAssist (/Users/phillmcgurk/RestoreAssist) — CleanExpo/RestoreAssist, prod https://restoreassist.app (Vercel team unite-group).
ARCH: Next.js 16 web (the product) + Capacitor WebView shells (iOS=launch, Android=deferred publish-pipeline blocker RA-2997).
GOAL: iOS+Desktop first PAID release. Spec: SHIPIT_READINESS_SPM_SPEC.md. Release gate 60/100 → must hit 100 (scripts/release-gate-score.ts --strict).
BILLING: Stripe only, no IAP. iOS billing gated off-app (Path B, lib/ios-billing-guard.ts). Desktop checkout works — verify LIVE.
SECURITY OPEN: H1 tool-layer IDOR (lib/live-teacher/tools/*, block RA-1132f); B3 plaintext OAuth tokens in Account; secret rotation RA-2989/3034/3012 unproven.
ENV TODO (OWNER): CRON_SECRET, RESEND_FROM_EMAIL+domain, INTEGRATION/CREDENTIAL_ENCRYPTION_KEY, ABR_API_GUID, prod TLS confirm, live Stripe keys/prices/webhook, live Supabase advisor run, prod schema-drift RA-1807 DDL, App Store re-review, 5 owner-evidence files, Founder/Board acceptance.
CI TODO (CODE): DB-backed Vitest RA-4951; Playwright @smoke undici (A1/B4); audit:api false-positive; pricing drift; disable non-launch connectors.
RULE: verify-don't-trust — re-run every "DONE/green" with real DB (pnpm test:db) + live tokens; SKIP-green ≠ verified. Don't touch live billing/DDL/secrets/dashboards — batch as OWNER ACTIONS.
NEXT: run /goal (see §21).
```

## 23. Final recommendation

**PROCEED — APPROVE SHIPIT REMEDIATION PLAN (Shipit not yet).** The product is materially closer than the stale 2026-05-24 report implies: RLS is closed (119/119), iOS Apple-compliance is solved by design (Path B), billing/auth/connectors are well-built, and **Android correctly does not block** (publish-pipeline-only, isolated). The remaining work is a finite, well-bounded set of (a) **owner/human gates** (live Stripe + prod env/secrets + schema-drift DDL + App Store re-review + Founder acceptance + owner-evidence files) and (b) **a small in-repo P0 code set** (IDOR scoping, token encryption, CI trustworthiness, mode guard, connector disabling). No feature work, no rebuild. Close the §17 P0 list, re-verify every claim against real DB + live inputs, drive the gate to 100/100, and Shipit is reachable for iOS + Desktop. Android proceeds in parallel on its own track once the owner enables the Google Play API.

---
SPM spec complete. Next safe action: run /judge on the spec, then run /goal only after the spec is accepted.
