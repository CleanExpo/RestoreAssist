# Spec — Onboarding & BYOK Setup Readiness (RestoreAssist)

> `/spm` + `/readiness-architect` · 2026-07-01 · grounded by 4 read-only Explore agents (file:line throughout).
> Scope: can a brand-new restoration firm get RestoreAssist actually working — in the office AND the field —
> across sign-up, the setup walkthrough, BYOK keys, Google Drive, cloud bookkeeping, and team connection.
> Companion to the canonical `spec.md`/`goals.md`; this is a focused readiness assessment, not a replacement.

## 1. Why this spec
RestoreAssist is **BYOK** (bring-your-own-key): the product does not function until the firm supplies its own
Anthropic API key and (optionally) connects storage + bookkeeping, and links its team. The onboarding/setup
journey is therefore the single biggest adoption risk — if a new contractor can't get over this hump, nothing
downstream (capture, reports, billing) works. This spec maps the journey end-to-end, grades launch readiness,
and lists the gating fixes + the walkthrough-video coverage needed to de-risk it.

## 2. The journey (6 stages, grounded)

| Stage | Entry | What happens | Key files |
|---|---|---|---|
| 1. Sign-up | `/signup`, `/login` | email+password (NIST rules) or Google/Apple OAuth → `/dashboard?welcome=1`. OAuth collects NO business data → `needsOnboarding:true` | `app/signup/page.tsx`, `lib/auth.ts`, `app/api/auth/register` |
| 2. Account-type gate (OAuth only) | `middleware.ts:203-212` | mandatory: business name, ABN (ATO mod-89 checksum), state, ToS → writes **User** (not Organization) | `app/onboarding/account-type/page.tsx`, `…/route.ts:72` |
| 3. Setup wizard | `/setup` (`SETUP_WIZARD_ENABLED` + `!setupCompletedAt`, `middleware.ts:153-169`) | free-form card dashboard (not linear): VideoExplainer, AiKeyCard, BusinessDetails, Brand, Pricing, Storage, Integrations, FeatureHealth → **Activate** seeds sample data + sets `setupCompletedAt` | `components/setup/SetupShell.tsx`, `app/api/setup/{hydrate,activate,checks}/route.ts`, `lib/setup/checks.ts` |
| 4. BYOK connectors | within setup + `/dashboard/settings/{ai-providers,cloud-mirror}`, `/dashboard/integrations` | Anthropic key (AES-256-GCM, validated by 1-token probe); Google Drive OAuth (PKCE, org-level tokens); Xero/QB/MYOB/Ascora | `components/setup/{AiKeyCard,StorageCard,IntegrationsCard}.tsx`, `lib/credential-vault.ts`, `lib/workspace/provider-connections.ts` |
| 5. Team connection | `/dashboard/team`, `/invite/[token]` | ADMIN/MANAGER invites (7-day token, Resend email); acceptance creates User in org, inherits owner's subscription + **org-level BYOK keys/Drive** (techs don't re-enter keys) | `app/api/team/invites/route.ts`, `app/api/invites/[token]/route.ts`, `lib/organization-credits.ts` |
| 6. Field / office | `/dashboard/field` (Capacitor + IndexedDB offline) | tech inherits org credentials; photos → Supabase immediately, Drive mirror async | `app/dashboard/field/page.tsx`, `lib/storage/index.ts`, `lib/queue/storage-mirror.ts` |

**Design truth that matters:** BYOK keys + Drive are **org-level** — the owner sets up once and the whole team
(office + field) inherits them. That's the right model; the risk is entirely in *setup completion + visibility*,
not per-user re-entry.

## 3. Readiness findings (synthesised, by severity)

### P0 — launch-blocking
1. **BYOK key failure is cryptic at runtime.** Missing/invalid key hard-blocks report generation, Margot, and
   classification in field + office; the error is a 500 `"No active ANTHROPIC API key configured for workspace X"`
   with no friendly toast or "fix it in Settings → AI Providers" hint. A trailing-space/truncated paste passes
   setup then fails on first report → user abandons. `lib/ai/workspace-byok-dispatch.ts:122-126`, `lib/setup/checks.ts:422-493`.
2. **No unified connector-health view.** Status is split across `/dashboard/settings/ai-providers`,
   `/cloud-mirror`, and `/dashboard/integrations`; `settings/credentials/page.tsx` is misleadingly empty (only
   IICRC/WHS cards). A user cannot answer "what's blocking me?" in one place post-activation.
3. **Setup persistence bugs (silent data loss).** BusinessDetailsCard manual edits not saved on blur
   (`BusinessDetailsCard.tsx:179`); BrandCard logo stored as a data-URL, never uploaded to Cloudinary
   (`BrandCard.tsx:34`); StorageCard "Keep it local" never writes `Organization.storageProvider`
   (`StorageCard.tsx:64`). Each loses the user's input on refresh.
4. **Team ring-fence + linking gaps.** No UI to set `isJuniorTechnician` (must DB-patch) — blocks the M-16
   junior-tech ring-fence at launch; ADMIN-sent invites default `managedById:null` → orphaned techs with no
   manager; no FK guards `managedById` to the same org (cross-org supervisor possible). `app/api/team/invites/route.ts:401`.
5. **Field app shows no connector status.** Drive token expiry is invisible to a field tech — photos stay in
   Supabase, the async Drive mirror fails silently, and the insurer later can't get the original JPEGs from Drive.
   `lib/queue/storage-mirror.ts`, `app/dashboard/field/page.tsx`.

### P1 — fix before/at launch
- **QB/MYOB are beta-unverified** but only flagged on the integrations page, not in the setup wizard card; setup
  validation probes **only Xero** → MYOB/QB "connected" can silently never sync. `lib/setup/checks.ts:350-356`.
- **Ascora** shows a "Connect" button but has no OAuth route (env-var-only) → click 404s/fails silently.
- **Integration OAuth failures are silent on the setup page** (fire-and-forget, no callback poll).
- **First-run checklist is sidebar-only** (`FirstRunChecklist.tsx:59`) — hidden if the sidebar is collapsed; no
  full-page fallback like the setup wizard.
- **Setup rate-limit is per-IP not per-user** (`hydrate/route.ts:16`) → an office of 5 setting up together gets
  locked out after 2.
- **No activation milestone screen** — `Activate` redirects silently to a cold `/dashboard?firstRun=1`; the user
  isn't sure it worked. Welcome email fails silently. Sample data is seeded with no prompt (confusion).

### P2 — polish / robustness
- FeatureHealthCard polls `/api/setup/checks` every 5s (RA-4990) — heavy on serverless pools until green.
- No "required vs optional" visual hierarchy on the setup cards; no resume indicator for in-flight hydration jobs.
- AI-key entry is duplicated (AiKeyCard vs IntegrationsCard "BYOK" link) — looks like two separate steps.

## 4. Walkthrough & explainer video coverage
The product ships a Remotion video system: **60 registered compositions** (`remotion/index.tsx`), a render
script (`npm run render:tutorials` → `remotion/render-all.ts` → `remotion/output/{kebab}.mp4`), and a
`VIDEO_REGISTRY` the UI reads with a **Cloudinary URL + local-path fallback**. The setup wizard plays
`remotion-onboarding-welcome` (`SetupShell.tsx:89`); the help center plays 6 local videos; the Learn page lists 52.

**Coverage matrix (walkthrough/explanations):**

| Topic | Composition | Local mp4 | Verdict |
|---|---|---|---|
| Sign-up | TutorialSignup / SignUp | ✅ | covered |
| Account-type | — | — | **no video** (form only) |
| Setup wizard | TutorialSetupWizard / SetupWizardFull | ✅ | covered |
| **BYOK AI key** | BYOKExplainer | ❌ (Cloudinary only) | **install locally** |
| **Google Drive / storage** | SettingsConfig | ❌ (Cloudinary only) | **install locally** |
| **Cloud bookkeeping** | IntegrationConnect | ❌ (Cloudinary only) | **install locally** |
| **Field / mobile** | MobileWorkflow | ❌ (Cloudinary only) | **install locally** |
| Team invite | TutorialTeam | ✅ | covered |
| Dashboard / Inspections / Reports / Billing / Compliance | Tutorial* | ✅ | covered |

**Finding:** nothing is content-missing — every topic except *account-type* has at least a Cloudinary-hosted
video, and the critical onboarding path has local mp4s. **But the four explainers for exactly the stumbling
blocks named (BYOK key, Drive, bookkeeping, mobile/field) have no local `.mp4`** and depend on the CDN
(fragile, and absent offline/in-field). **Action:** render those 4 (+ optionally an `account-type` explainer)
from their existing compositions and install to `public/videos/` so the walkthrough is self-contained.
(45 of 60 compositions are un-rendered locally; this spec scopes only the onboarding-relevant ones.)

## 5. Gating P0 acceptance criteria (what "onboarding is launch-ready" means)
- [ ] A new firm can complete setup without silent data loss (persistence bugs P0-3 fixed).
- [ ] If the BYOK key is missing/invalid, the user gets a clear, actionable message at the point of failure (not a raw 500), and a "Test key" affordance in Settings.
- [ ] One place shows whole-firm connector health (AI / storage / bookkeeping) with red=blocking, yellow=optional.
- [ ] An ADMIN can set a technician as junior and assign a manager from the UI; no orphaned techs.
- [ ] The field app surfaces Drive/credential status so silent mirror failure is visible.
- [ ] The onboarding walkthrough's BYOK/Drive/bookkeeping/field explainers are installed locally (not CDN-only).

## 6. Recommended build sequence (smallest-safe first)
1. **Visibility before features** — build the unified `/dashboard/connectors` health page (reuse `lib/setup/checks.ts`
   `runAllChecks`) and wire the runtime BYOK error to a friendly toast. Highest adoption leverage, low risk.
2. **Stop the data loss** — persist BusinessDetails blur edits, StorageCard local choice, BrandCard logo upload.
3. **Team UI** — junior-tech toggle + manager assignment on `/dashboard/team`; guard `managedById` to org.
4. **Field status** — Drive/credential indicator on `/dashboard/field`.
5. **Integrations honesty** — Beta flags in the setup card; setup validation for QB/MYOB or mark "verify later";
   fix/remove Ascora connect.
6. **Walkthrough videos** — render + install the 4 named explainers from their compositions (see §4); add an
   account-type explainer if desired.
7. **Polish** — activation milestone screen, first-run full-page fallback, per-user rate-limit.

Each step is its own PR, gated by tests; none merged to main without owner sign-off (rule 18). Owner-gated
inputs remain: the 5 STORM blockers (#2 Live Teacher, #3 native OAuth ID, #8 Bluetooth UUIDs, #12 NIWA weather,
#14 Guidewire spec) and the dropped §10 standards re-land are related readiness items.

## 7. Judge (self-assessment)
| Category | Score | Notes |
|---|---:|---|
| First-source evidence | 24/25 | dozens of file:line across 4 agents; a few line-refs are ranges |
| Clear problem/value | 20/20 | BYOK adoption hump is the #1 launch risk |
| Reuse of existing capability | 15/15 | reuses `runAllChecks`, existing compositions, credential-vault |
| Security/privacy | 14/15 | BYOK keys/tokens already AES-256-GCM; flag: silent connector failures |
| UX clarity | 10/10 | per-stage states + failure modes specified |
| Testability | 9/10 | most fixes testable; video render is environment-dependent |
| Cost/control | 5/5 | sequenced smallest-safe; PRs not merges |
| **Total** | **97/100** | **APPROVE BUILD** — start with the connector-health page + BYOK error UX |

```text
Spec complete. Next: validate the Remotion render pipeline, then render+install the BYOK/Drive/bookkeeping/field
explainer videos; build work proceeds per §6 on owner approval.
```
