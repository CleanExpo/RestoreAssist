# Progress — RestoreAssist

**Phase:** Xero Integration Hardening + Billing Accuracy
**Last updated:** 2026-04-18

## Current Session (2026-04-17 → 2026-04-18) — Xero + Billing Release

**Merge commit to main:** `80f05ae2` via PR #242 (MERGED 2026-04-17 16:08 UTC)

| Issue  | PR   | Summary | Status |
| ------ | ---- | ------- | ------ |
| RA-868 | #234 | Centralised Xero token-manager (getValidXeroToken + refresh) | Done |
| RA-869 | #236 | Per-category account code resolver + client-extensible mappings + LRU cache | Done |
| RA-874 | #237 | Dashboard UI + API for account code mapping overrides | Done |
| RA-875 | #239 | ATO-correct per-category GST treatment (fixes DISCOUNT bug) | Done |
| RA-876 | #240 | Pre-invoice completeness check + DRAFT→INTERNAL_REVIEW gate | Done |
| RA-871 | #241 | Extract verifyXeroWebhookSignature + 16 webhook-processor tests | Done |
| —      | #243 | CodeRabbit-flagged fixes (CLAUDE.md rule 4 + TOCTOU race) | Done |

### Migration applied
- `20260417152430_add_estimate_metadata` — adds `Estimate.metadata TEXT` column (nullable JSON blob for dismissedWarnings + future per-estimate state). Purely additive.

### Test coverage added
- 121 new/updated unit tests across token-manager, account-code-resolver, webhook-processor, xero-account-mapping API, gst-treatment-rules, billing-completeness-check

### Earlier in session (PR #230/#231)
- Track 3 migration (BrandAmbassadorPost + InvoiceSyncJob) applied to prod
- Billing schema drift fix (11 CompanyPricingConfig columns)
- Next 16 cleanup + pre-push smoke test script

### Infrastructure follow-up (chip queued)
- Import Pi-Dev-Ops design-intelligence + design-audit + design-system skills into `.claude/skills/`
- Bootstrap RestoreAssist `DESIGN.md` (9-section format)
- Re-run audit on RA-874 xero-mapping page for polish pass

### CodeRabbit follow-ups (deferred, non-blocking)
- Minor: add transition graph validation to `/api/estimates/[id]/status` (LOCKED→DRAFT currently permitted)
- Minor: `CONTENTS_NO_S760` handle `s760ChecklistCompleted = null` (currently silent)
- Minor: `isKnownCategory` use `Object.hasOwn` instead of `in` (prototype safety)

---

## Prior Session (2026-04-14) — Track 3

## Current Session (2026-04-14) — Track 3

| Issue  | Fix | Status |
| ------ | --- | ------ |
| RA-910 | `sync-invoices/route.ts` — replaced inline string comparison with `verifyCronAuth` (timing-safe) | Done |
| RA-922 | `authority-forms/templates/route.ts` — added `getServerSession` auth check | Done |
| RA-919 | `reports/[id]/pdf/route.ts` — added `applyRateLimit` (10 req / 5 min) | Done |
| RA-912 | `webhooks/github/route.ts` — create AppRelease immediately, fire-and-forget AI notes + notifications | Done |
| RA-911 | `lib/cron/brand-ambassador.ts` — created file with idempotency guard via `BrandAmbassadorPost` Prisma model | Done |
| RA-902 | `lib/integrations/sync-queue.ts` — replaced in-memory array with `InvoiceSyncJob` Prisma-backed queue | Done |
| RA-914 | `lib/hooks/useFetch.ts` — created; migrated 4 priority dashboard pages | Done |

### Schema changes (migration required)
Two new models added to `prisma/schema.prisma`:
- `BrandAmbassadorPost` — idempotency dedup for weekly Telegram delivery
- `InvoiceSyncJob` — durable invoice sync queue (replaces in-memory array)

**After merging, run:**
```
npx prisma migrate dev --name track3_brand_ambassador_invoice_sync_queue
pnpm prisma:generate
pnpm type-check
```

### Git state
- **Branch:** `sandbox`
- **PR:** #180 (sandbox → main, open)
- All Track 3 changes committed in this session

## Project Status: 447/448 Linear Issues Done

All 447 Linear issues are Done. The full RestoreAssist platform is implemented and deployed to production at restoreassist.com.au. Only RA-287 remains (blocked on DO_TOKEN GitHub secret).

## Current Session (2026-04-13) — KARPATHY SPRINT COMPLETE

| Task                                                     | Status | Notes                                                                                                        |
| -------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| RA-683: Ship Chain educational series                    | Done   | docs/ship-chain/ (6 docs), commit c54e5618                                                                   |
| RA-692: verify_deploy.py + DEPLOYMENT.md + CI workflow   | Done   | scripts/verify_deploy.py, DEPLOYMENT.md, .github/workflows/deploy-check.yml, commit 44080f12                 |
| RA-693: brand-ambassador cron + design-system onboarding | Done   | lib/cron/brand-ambassador.ts + design-system-onboarding.ts, 2 new cron routes + vercel.json, commit 05b157fe |

All commits pushed to `claude/tender-feynman-v2` → PR #178

Remaining Backlog: RA-612 (LightRAG Q3 2026, P4 Low — intentionally deferred, not actionable until 200+ inspections)

## Current Session (2026-04-12) — ALL COMPLETE

| Task                                           | Status | Notes                                                                                            |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| RA-613: Manual onboarding playbook (20 pilots) | Done   | PR #171, branch feat/ra-613-onboarding-playbook, Linear In Review                                |
| RA-611: BYOE year-two vision document          | Done   | PR #172, branch feat/ra-611-byoe-vision, Linear In Review                                        |
| DR-534: Alfred event page (BUILD-008)          | Done   | PR #38, branch feat/dr-534-event-pages in D:/Disaster Recovery/                                  |
| DR-534: Cyclone Alfred canonical redirect      | Done   | /cyclone-alfred-queensland-2026 → /events/cyclone-alfred-fnq-2026                                |
| DR-534: GAP-073 claim page trust header        | Done   | "We work for you, not your insurer." on /claim                                                   |
| DR-533: NSW/QLD storms event page              | Done   | Covered by PR #38 (ours) and PR #35 (previous session). DR-533 → In Review                       |
| DR-534: Maila ACL pivot (BUILD-006)            | Done   | Covered by PR #35 (previous session, open) — Maila pages updated to evergreen                    |
| DR-534/DR-533: Linear → In Review              | Done   | Both issues moved to In Review state                                                             |
| DR-536: AML/CTF Tranche 2 + privacy policy     | Done   | PR #39 (Disaster Recovery repo), DR-536 In Review                                                |
| RA-625: Sprint G graph-readiness audit         | Done   | PR #173, SPRINT-G-GRAPH-READINESS-AUDIT.md, Linear In Review                                     |
| RA-624: lib/knowledge/index.ts                 | Done   | PR #173, expandContext wired into generate-inspection-report, Linear In Review                   |
| RA-601: DR-NRPG XSS + SQL injection            | Done   | PR #70 (DR-NRPG), $executeRawUnsafe → $executeRaw, SafeHtml component, DOMPurify on module       |
| DR-561: DR-NRPG 6 critical CVEs                | Done   | lockfile updated: axios@1.15.0, jspdf@4.2.1, basic-ftp@5.2.2, fast-xml-parser@5.5.11, hbs@4.7.9  |
| F13: jsPDF CVE (RestoreAssist)                 | Done   | jspdf@4.2.1 already in RestoreAssist pnpm-lock.yaml — no action needed                           |
| F15: Nonce-based CSP                           | Done   | middleware.ts: 'nonce-${nonce}' + 'strict-dynamic' + 'unsafe-inline' (progressive nonce pattern) |

## Prior Session Verification (2026-04-12)

Items from triage plan — confirmed Done in prior sessions (verified via Linear API):

- RA-555: Done (PR #166 — DOMPurify XSS fix on ProfessionalDocumentViewer)
- RA-571: Done (Sprint 6 — generator SDK migration)
- RA-572: Done (Sprint 6 — evaluator SDK migration)
- RA-573: Done (Sprint 6 — metrics wiring)
- RA-574: Done (Sprint 6 — canary rollout plan)
- PR #153/#154 (RA-511/512): Merged — no longer open

## Remaining DR-534 Human Actions (Phill)

| Action                | Detail                                                             |
| --------------------- | ------------------------------------------------------------------ |
| Merge PR #35 + PR #38 | Review for conflicts (both touch claim/page.tsx + nsw-storms page) |
| P0-J: Vercel env vars | KMS env vars — code complete, needs Vercel dashboard provisioning  |
| P0-K: Prisma migrate  | `npx prisma migrate deploy` with DB backup first                   |
| GAP-044: WAF rule     | robots.txt/sitemap.xml 401 → allow Googlebot; <5 min change        |
| DR-535: Legal review  | Platform guarantee language — brief due Apr 12                     |
| GSC submit            | Submit new event pages to Google Search Console after merge        |

## Previous Session (2026-04-10)

| Task                                        | Status  | Notes                                                             |
| ------------------------------------------- | ------- | ----------------------------------------------------------------- |
| Managed Agents v4 protocol saved            | Done    | `.claude/MANAGED_AGENTS_v4_FINAL.md`                              |
| Setup script created                        | Done    | `.claude/scripts/setup-managed-agents.sh`                         |
| PROGRESS.md cleaned up                      | Done    | Removed ~400 duplicate Session End lines                          |
| RA-509: Remove empty catch blocks           | Done    | PR #152                                                           |
| RA-510: Remove console.log from routes      | Done    | PR #152 (webhook handlers)                                        |
| RA-513: WorkspaceMember audit trail         | Done    | PR #152                                                           |
| RA-514: Eliminate explicit any              | Done    | PR #152                                                           |
| Production readiness audit                  | Done    | 447/448 issues Done; cron routes protected; Stripe fixed          |
| RA-511: Refactor generate-inspection-report | Done    | PR #153 — route 3241→335 lines; 3 new modules in lib/reports/     |
| RA-512: Split InitialDataEntryForm          | Done    | PR #154 — 5919→4258 lines; 6 sub-components extracted             |
| API key for Managed Agents                  | Pending | CEO to provide ANTHROPIC_API_KEY                                  |
| Token & context optimization system         | Done    | .claudeignore, PreCompact hook, agents, skills — committed        |
| console.log cleanup (22 files, 55 calls)    | Done    | All API routes clean — committed `c802f0f8`                       |
| Admin routes → verifyAdminFromDb (9 files)  | Done    | CLAUDE.md rule 13 enforced — committed `ccfd7e13`                 |
| Hardcoded admin email in feedback route     | Done    | Removed `mmlrana00@gmail.com` bypass — committed `ccfd7e13`       |
| CSP middleware restored                     | Done    | `middleware.ts` was deleted — restored nonce-based CSP `862cdde7` |
| Subscription gates on 11 AI routes          | Done    | Rules 16 — `884d57a9`, `8634c191`                                 |
| HTML escaping in email templates            | Done    | Rule 19 — process-emails, invoice-templates `8634c191`            |
| Magic byte validation on 2 upload routes    | Done    | Rule 15 — floor-plan, evidence/batch `8634c191`                   |
| error.message in 422 response               | Done    | Rule 18 — contents-manifest `73227a0e`                            |
| PR #152 updated                             | Done    | All security fixes included in PR                                 |

## Remaining Human Actions

| Action                                    | Reason                                                        |
| ----------------------------------------- | ------------------------------------------------------------- |
| Provide `ANTHROPIC_API_KEY`               | Required to run `.claude/scripts/setup-managed-agents.sh`     |
| Set `PORTAL_SECRET` on Vercel sandbox     | Insurer share token HMAC — sandbox builds fail without it     |
| Set `NEXT_PUBLIC_COMPANY_ABN` on Vercel   | `62 580 077 456` — footer ABN display                         |
| Set `DO_TOKEN` GitHub secret              | Unblocks RA-287 (DigitalOcean deploy workflow)                |
| GitHub CI/CD secrets (10 secrets)         | Android/iOS release workflows need signing credentials        |
| Apple Developer activation                | Check phill_bron@hotmail.com for activation email             |
| Google Play closed testing (12 x 14 days) | Required before production track access                       |
| RA-421/422/396 decisions                  | Brand consolidation, workspace spec, voice copilot — CEO only |

## Decisions

| Date       | Decision                                                | Rationale                                                                  |
| ---------- | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| 2026-04-10 | Adopted Managed Agents v4 protocol                      | Multi-agent orchestration with quality rubric and anti-rush enforcement    |
| 2026-04-01 | Capacitor server-hosted WebView over Expo for V1 mobile | Avoids dual codebase; SSR API routes stay intact; single deployment target |
| 2026-04-01 | Java 21 for Android CI (not 17)                         | Capacitor 8.x requires `sourceCompatibility = JavaVersion.VERSION_21`      |
| 2026-04-01 | pnpm in CI (not npm)                                    | Project uses pnpm; npm can't find lockfile                                 |
| 2026-04-01 | `--no-frozen-lockfile` in CI                            | Lockfile drifts when Capacitor deps are added to package.json              |
| 2026-04-03 | os.walk over rglob in Code Intel MCP                    | pnpm symlinks in node_modules cause FileNotFoundError mid-iteration        |

## Pre-Launch Security Swarm Results (2026-04-07)

All 5 rounds complete. 55 findings identified and fixed across 8 commits.

| Round | Focus                                               | Findings | Commits                            |
| ----- | --------------------------------------------------- | -------- | ---------------------------------- |
| 1     | HMAC/timing, SQL injection, basic auth              | 8        | `5747459c`                         |
| 2     | Race conditions, N+1 queries, IDOR                  | 10       | `d62ac88c`, `e2efb938`             |
| 3     | Auth inconsistencies, privilege escalation, WCAG    | 12       | `ba34e922`, `31faf69f`, `47551092` |
| 4     | Billing bypass, credit exhaustion, prompt injection | 15       | `5a11cf97`                         |
| 5     | Stale JWT role, auth bypass, cross-tenant leaks     | 15       | `7c84e803`                         |

### Deferred Security Items

- **F5 (R5)**: In-memory rate limiter resets on cold starts → needs Upstash/Redis
- **F13 (R5)**: jsPDF/Fabric.js CVEs → needs `pnpm update jspdf` + audit
- **F15 (R5)**: CSP `unsafe-inline`/`unsafe-eval` → needs nonce-based CSP (medium effort)
- **F2 (R5)**: ~~30+ routes use `session.user.email`~~ — 9 admin routes fixed with `verifyAdminFromDb`; remaining `session.user.email` uses are Stripe customer email (correct) or low-risk fallbacks

## Sprint History (Summary)

| Sprint | Date       | Key Deliverables                                                                                     | Commits/PRs                        |
| ------ | ---------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------- |
| F/G/H  | 2026-04-03 | Evidence schema, BYOK vision, contents manifest, first-run                                           | `4c1e5cd1`                         |
| I      | 2026-04-05 | RA-410 dispute pack, RA-411 evidence QA, PR #138 merged                                              | `d0604617`, `20e1b050`             |
| J      | 2026-04-06 | RA-423 insurer profiles, RA-425 workspace RLS, RA-424 BYOK UI, RA-426 payment gate, RA-427 demo seed | PR #143                            |
| K      | 2026-04-06 | Insurer report portal, IICRC PDF generator, insurer share tokens                                     | `6c5f807a`                         |
| L      | 2026-04-06 | pgvector RAG (RA-437), Claude Vision meter reading (RA-438), App Store CI/CD                         | PR #145 merged                     |
| M      | 2026-04-08 | RA-446 photo label schema, RA-447 photo label API, RA-448 photos dashboard                           | PR #150 merged                     |
| N      | 2026-04-08 | Full type-safety pass: 688 → 0 errors                                                                | `e8c4694d`, `42c78637`, `e24c8202` |

## Developer Account Status (2026-04-08)

- Apple Developer Program ($149 AUD/yr): Order W1520046725 — activation pending
- Google Play Developer ($25 USD): Account registered, app pricing Free, checklist 13/13

## V2 Deployment (2026-04-09)

- Build fix: deleted legacy `middleware.ts`, kept `proxy.ts` (`e9b03c07`)
- All 12 V2 models in schema.prisma (ClaimSketch, Ascora*, ScopePricingDatabase, DrNrpg*, DryingGoalRecord, HistoricalJob)
- Prisma client regenerated; app builds clean
- Production should auto-deploy from latest commits

## Notes for Next Context Window

- **Linear queue**: All 447 Done + 2 In Review (RA-511 PR #153, RA-512 PR #154). RA-287 blocked (DO_TOKEN). Check for new tickets.
- **Open PRs**: #152 (RA-509/510/513/514), #153 (RA-511 route refactor), #154 (RA-512 form split)
- **Type-check**: 0 errors in app code; packages/videos ~90 pre-existing Remotion errors (separate package)
- **Production**: restoreassist.com.au running Sprint M (photo labels)
- **pgvector migration**: Applied to prod — IicrcChunk table ready
- **Linear API key**: "Claude Code RestoreAssist" (created Apr 8 2026) in `~/.claude/mcp.json`
- **console.log**: Fully cleared from all 22 API route files (55 calls removed) — `c802f0f8`
- **Admin auth**: 9 admin routes upgraded to `verifyAdminFromDb()` — `ccfd7e13`
- **Rate limiter**: Code already supports Upstash Redis — just needs `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` env vars in Vercel (human action)
- **Remaining security**: jsPDF CVEs (F13), nonce-based CSP (F15) — medium effort, deferred

## 2026-04-11 — Session Summary (branch: fix/do-deploy-dompurify-missing, PR #170)

### Completed this session

| Task                                                                 | Linear        | Status | Commits    |
| -------------------------------------------------------------------- | ------------- | ------ | ---------- |
| Extract ReportTypeSelection + UseCaseModal from InitialDataEntryForm | RA-512 Part 2 | Done   | `c1b26827` |
| Extract ReviewSection (467 lines) from InitialDataEntryForm          | RA-512 Part 3 | Done   | `2b05efac` |
| Extract FormNavigation (77 lines) from InitialDataEntryForm          | RA-512 Part 4 | Done   | `0b909a2b` |
| Classify 9 hardcoded-password scanner findings                       | RA-599        | Done   | `b684220b` |
| Annotate 11 dangerouslySetInnerHTML instances as SAFE                | RA-600        | Done   | `b684220b` |

RA-512 fully Done — InitialDataEntryForm 5,769 → 4,935 lines, 4 sub-components extracted.  
RA-599: All findings are false positives or dead-module demo fixtures — no rotation required.  
RA-600: All 11 instances are safe (CSS print styles, JSON-LD, or pre-sanitized).

### Still open (RA-specific)

- **RA-576**: Remove claude -p subprocess fallback — **gated on 7-day Phase C canary stability**
- **PR #170**: Open, builds in progress (all prior RA tickets bundled here)

### Next priorities (other repos — not this worktree)

- RA-601: DR-NRPG 2 critical security findings
- RA-597: CCW-CRM 1 critical finding
- RA-602: DR-NRPG 4 critical npm CVEs
- RA-598: CCW-CRM 137 hardcoded secrets/passwords

## 2026-04-10 12:32 — Session End

## 2026-04-10 12:34 — Session End

## 2026-04-10 12:42 — Session End

## 2026-04-10 12:49 — Session End

## 2026-04-10 (latest session)

| Task                                           | Status | Notes                                       |
| ---------------------------------------------- | ------ | ------------------------------------------- |
| Magic bytes — logo upload route                | Done   | JPEG/PNG/GIF/WebP — rule 15 — `1b2ee5f2`    |
| Magic bytes — parse-pdf route                  | Done   | PDF 0x25504446 — rule 15 — `1b2ee5f2`       |
| Magic bytes — photos route                     | Done   | JPEG/PNG/GIF/WebP — rule 15 — `1b2ee5f2`    |
| Stripe API version fix                         | Done   | 2025-09-30 → 2025-10-29.clover — `1b2ee5f2` |
| Production Chrome audit — restoreassist.com.au | Done   | See below                                   |

## Chrome Audit Results (2026-04-10)

Audited production: `restoreassist-okzjr4l3g-unite-group.vercel.app` (latest Production on Vercel — restoreassist.com.au DNS not yet propagated)

| Check                        | Result  | Notes                                                       |
| ---------------------------- | ------- | ----------------------------------------------------------- |
| Homepage loads               | ✅ Pass | No console errors, all content renders                      |
| CSP header with nonce        | ✅ Pass | `content-security-policy` present, fresh nonce per request  |
| X-Frame-Options: DENY        | ✅ Pass | Confirmed via fetch headers                                 |
| `/login` renders             | ✅ Pass | Email/Password form, Google OAuth, Sign up link all present |
| `/signup` renders            | ✅ Pass | All fields, Create Account CTA, Google OAuth all present    |
| `/dashboard` auth gate       | ✅ Pass | Redirects to `/login` when unauthenticated                  |
| `/api/auth/session` responds | ✅ Pass | HTTP 200 — NextAuth backend operational                     |

**Note:** `restoreassist.com.au` DNS returns NXDOMAIN — domain not yet registered or DNS not configured. Production is accessible via Vercel URL.

## 2026-04-10 12:55 — Session End

## 2026-04-10 13:19 — Session End

## 2026-04-10 13:29 — Session End

## 2026-04-10 13:30 — Session End

## 2026-04-10 13:32 — Session End

## 2026-04-10 13:45 — Session End

## 2026-04-10 13:45 — Session End

## 2026-04-10 13:46 — Session End

## 2026-04-10 13:51 — Session End

## 2026-04-10 14:23 — Session End

## 2026-04-10 14:23 — Session End

## 2026-04-10 14:26 — Session End

## 2026-04-10 14:38 — Session End

## 2026-04-10 14:44 — Session End

## 2026-04-10 15:06 — Session End

## 2026-04-10 15:09 — Session End

## 2026-04-10 15:09 — Session End

## 2026-04-10 15:12 — Session End

## 2026-04-10 15:13 — Session End

## 2026-04-10 (landing page session)

| Task                                        | Status | Notes                                              |
| ------------------------------------------- | ------ | -------------------------------------------------- |
| restoreassist.app domain assigned to Vercel | Done   | Was unassigned — fixed via Vercel REST API         |
| Hamburger menu broken                       | Done   | Framer Motion v12 + React 19 regression → CSS only |
| Book a Demo missing from menu               | Done   | Added as primary amber button in sidebar           |
| pointer-events-none on closed sidebar       | Done   | Sidebar hit-box was blocking hamburger clicks      |
| PR #158 merged → production deployed        | Done   | `restoreassist-6zq8rl5jr-unite-group.vercel.app`   |

## 2026-04-10 15:16 — Session End

## 2026-04-10 15:22 — Session End

## 2026-04-10 15:24 — Session End

## 2026-04-10 15:26 — Session End

## 2026-04-10 15:26 — Session End

## 2026-04-10 16:18 — Session End

## 2026-04-10 16:21 — Session End

## 2026-04-10 16:21 — Session End

## 2026-04-10 16:23 — Session End

## 2026-04-10 16:24 — Session End

## 2026-04-10 16:25 — Session End

## 2026-04-10 16:27 — Session End

## 2026-04-10 16:35 — Session End

## 2026-04-10 (Google sign-in + Supabase session)

| Task                                             | Status | Notes                                                                       |
| ------------------------------------------------ | ------ | --------------------------------------------------------------------------- |
| Cache-Control: no-store in middleware            | Done   | Prevents Vercel CDN from caching HTML with stale CSP nonce                  |
| unsafe-inline added to CSP script-src            | Done   | Required for Next.js RSC hydration (`self.__next_f.push`)                   |
| Google login — wrong provider ID                 | Done   | `contractor-credentials` → `credentials` in login + signup pages            |
| Google login — authorize() rejected Google users | Done   | Added HMAC proof token (`gauth:`) branch in `lib/auth.ts`                   |
| Supabase SQL files reviewed                      | Done   | Both files already applied to production; confirmed via MCP SQL queries     |
| InvoiceTemplate RLS enabled                      | Done   | RLS + 4 owner-scoped policies applied directly via Supabase MCP             |
| InvoiceSequence RLS enabled                      | Done   | RLS + 4 owner-scoped policies applied directly via Supabase MCP             |
| Google login verified — client-side              | Done   | Popup initiates (no popup-blocked error); full OAuth requires human testing |
| PR #163 merged                                   | Done   | All above auth fixes deployed to production                                 |

## Notes for Next Context Window

- **Google sign-in**: Client-side fixed and verified. Server-side HMAC in `lib/auth.ts`. To fully verify end-to-end, sign in with a real Google account on restoreassist.app/login.
- **Supabase RLS**: 86 tables without RLS — by design (app uses NextAuth + Prisma API layer as security boundary). Only InvoiceTemplate and InvoiceSequence were missing RLS on user-owned data.
- **ChunkLoadErrors**: Transient CDN propagation issue (4:50 PM) — self-resolved. Not a persistent bug.

## 2026-04-10 16:54 — Session End

## 2026-04-10 17:00 — Session End

## 2026-04-10 17:00 — Session End

## 2026-04-10 17:00 — Session End

## 2026-04-10 17:01 — Session End

## 2026-04-10 17:01 — Session End

## 2026-04-10 17:02 — Session End

## 2026-04-10 17:02 — Session End

## 2026-04-10 17:02 — Session End

## 2026-04-10 17:03 — Session End

## 2026-04-10 17:03 — Session End

## 2026-04-10 17:03 — Session End

## 2026-04-10 17:04 — Session End

## 2026-04-10 17:04 — Session End

## 2026-04-10 17:05 — Session End

## 2026-04-10 17:05 — Session End

## 2026-04-10 17:05 — Session End

## 2026-04-10 17:06 — Session End

## 2026-04-10 17:06 — Session End

## 2026-04-10 17:06 — Session End

## 2026-04-10 17:07 — Session End

## 2026-04-10 17:07 — Session End

## 2026-04-10 17:11 — Session End

## 2026-04-10 17:51 — Session End

## 2026-04-10 17:52 — Session End

## 2026-04-11 06:58 — Session End

## 2026-04-11 06:59 — Session End

## 2026-04-11 07:08 — Session End

## 2026-04-11 07:13 — Session End

## 2026-04-11 07:13 — Session End

## 2026-04-11 07:14 — Session End

## 2026-04-11 07:15 — Session End

## 2026-04-11 07:18 — Session End

## 2026-04-11 07:42 — Session End

## 2026-04-11 07:44 — Session End

## 2026-04-11 07:44 — Session End

## 2026-04-11 07:45 — Session End

## 2026-04-11 08:29 — Session End

## 2026-04-11 08:30 — Session End

## 2026-04-11 08:30 — Session End

## 2026-04-11 08:30 — Session End

## 2026-04-11 08:30 — Session End

## 2026-04-11 08:30 — Session End

## 2026-04-11 09:08 — Session End

## 2026-04-11 09:09 — Session End

## 2026-04-11 09:40 — Session End

## 2026-04-11 10:09 — Session End

## 2026-04-12 11:36 — Session End

## 2026-04-12 11:36 — Session End

## 2026-04-12 11:36 — Session End

## 2026-04-12 11:36 — Session End

## 2026-04-12 11:38 — Session End

## 2026-04-12 11:56 — Session End

## 2026-04-12 11:56 — Session End

## 2026-04-12 11:58 — Session End

## 2026-04-12 11:59 — Session End

## 2026-04-12 11:59 — Session End

## 2026-04-12 12:00 — Session End

## 2026-04-12 12:00 — Session End

## 2026-04-12 12:01 — Session End

## 2026-04-12 12:02 — Session End

## 2026-04-12 12:02 — Session End

## 2026-04-12 12:02 — Session End

## 2026-04-12 12:32 — Session End

## 2026-04-12 12:48 — Session End

## 2026-04-12 13:01 — Session End

## 2026-04-12 13:02 — Session End

## 2026-04-12 13:02 — Session End

## 2026-04-12 13:18 — Session End

## 2026-04-12 13:18 — Session End

## 2026-04-12 13:19 — Session End

## 2026-04-12 13:19 — Session End

## 2026-04-12 17:09 — Session End

## 2026-04-12 17:09 — Session End

## 2026-04-12 17:09 — Session End

## 2026-04-12 17:18 — Session End

## 2026-04-12 17:44 — Session End

## 2026-04-12 18:34 — Session End

## 2026-04-12 18:44 — Session End

## 2026-04-12 19:01 — Session End

## 2026-04-12 19:02 — Session End

## 2026-04-12 19:16 — Session End

## 2026-04-12 20:08 — Session End

## 2026-04-12 20:27 — Session End

## 2026-04-12 20:44 — Session End

## 2026-04-12 20:45 — Session End

## 2026-04-12 21:13 — Session End

## 2026-04-12 21:16 — Session End

## 2026-04-12 22:05 — Session End

## 2026-04-12 22:05 — Session End

## 2026-04-12 22:05 — Session End

## 2026-04-12 22:08 — Session End

## 2026-04-12 22:08 — Session End

## 2026-04-12 22:08 — Session End

## 2026-04-12 22:10 — Session End

## 2026-04-13 06:22 — Session End

## 2026-04-13 07:31 — Session End

## 2026-04-13 07:31 — Session End

## 2026-04-13 13:37 — Session End

## 2026-04-13 13:37 — Session End

## 2026-04-13 13:37 — Session End

## 2026-04-13 13:37 — Session End

## 2026-04-13 13:37 — Session End

## 2026-04-13 13:37 — Session End

## 2026-04-13 13:38 — Session End

## 2026-04-13 13:38 — Session End

## 2026-04-13 13:38 — Session End

## 2026-04-13 13:38 — Session End

## 2026-04-13 13:38 — Session End

## 2026-04-13 13:38 — Session End

## 2026-04-13 13:39 — Session End

## 2026-04-13 13:46 — Session End

## 2026-04-13 13:48 — Session End

## 2026-04-13 13:52 — Session End

## 2026-04-13 13:53 — Session End

## 2026-04-13 14:27 — Session End

## 2026-04-13 14:27 — Session End

## 2026-04-13 14:30 — Session End

## 2026-04-13 14:35 — Session End

## 2026-04-13 14:35 — Session End

## 2026-04-13 14:47 — Session End

## 2026-04-13 14:49 — Session End

## 2026-04-13 14:53 — Session End

## 2026-04-13 15:08 — Session End

## 2026-04-13 15:21 — Session End

## 2026-04-13 15:21 — Session End

## 2026-04-13 15:32 — Session End

## 2026-04-13 15:38 — Session End

## 2026-04-13 15:45 — Session End

## 2026-04-13 16:16 — Session End

## 2026-04-13 16:23 — Session End

## 2026-04-13 16:26 — Session End

## 2026-04-13 16:53 — Session End

## 2026-04-13 17:04 — Session End

## 2026-04-13 17:06 — Session End

## 2026-04-13 17:09 — Session End

## 2026-04-13 17:10 — Session End

## 2026-04-13 17:20 — Session End

## 2026-04-13 17:24 — Session End

## 2026-04-13 17:29 — Session End

## 2026-04-13 17:31 — Session End

## 2026-04-13 17:38 — Session End

## 2026-04-13 17:38 — Session End

## 2026-04-13 17:44 — Session End

## 2026-04-13 17:46 — Session End
## 2026-04-16 23:18 — Session End

## 2026-04-17 14:41 — Session End

## 2026-04-17 14:42 — Session End

## 2026-04-17 14:46 — Session End

## 2026-04-17 14:47 — Session End

## 2026-04-17 14:48 — Session End

## 2026-04-18 23:20 — Session End
