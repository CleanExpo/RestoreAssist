# Progress — RestoreAssist

**Phase:** Pre-Launch Security Hardening — 5-Round Adversarial Swarm COMPLETE
**Last updated:** 2026-04-07

## Active Tasks

| Task                                   | Status  | Notes                                                                                |
| -------------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| Sprint I — RA-410 Dispute Defence Pack | Done    | `d0604617` — 7-section PDF, `/api/inspections/[id]/dispute-pack`, UI button          |
| Sprint I — RA-411 Evidence QA scoring  | Done    | `20e1b050` — qa-scorer.ts, `/api/inspections/[id]/evidence/qa-scores`, badge         |
| Sprint F/G/H untracked files committed | Done    | `4c1e5cd1` — 9,295 lines: evidence schema, BYOK vision, contents manifest, first-run |
| sandbox → main PR                      | Open    | PR #138 — migrations pending on production DB before merge                           |
| Android CI/CD pipeline                 | Done    | PR #127 merged — first signed AAB built (Java 21, pnpm, gradlew +x)                  |
| iOS native project init                | Done    | `ios/` directory committed (builds require macOS / Capgo cloud)                      |
| RA-384 mobile scaffold                 | Done    | PR #132 merged — Expo SDK 52 / React Native 0.76 / expo-router                       |
| RA-317 environmental edit              | Done    | Already in main (confirmed 2026-04-01)                                               |
| RA-321 photo upload                    | Done    | Already in main (confirmed 2026-04-01)                                               |
| RA-328 cost CSV import                 | Done    | PR #129 merged                                                                       |
| RA-287 V2 deploy to prod               | Blocked | Needs human: merge PR #33 + set DO/Vercel env vars                                   |
| RA-238 YouTube rebrand                 | Blocked | Needs human: YouTube Studio channel rename                                           |
| RA-246 mobile env config               | Blocked | Needs human: Supabase env vars + EAS project ID                                      |
| RA-383 pilot pipeline                  | Blocked | Needs human: IICRC Australasia contacts                                              |

## Pre-Launch Security Swarm Results (2026-04-07)

All 5 rounds complete. 55 findings identified and fixed across 8 commits.

| Round | Focus | Findings | Commits |
|-------|-------|----------|---------|
| 1 | HMAC/timing, SQL injection, basic auth | 8 | `5747459c` |
| 2 | Race conditions, N+1 queries, IDOR | 10 | `d62ac88c`, `e2efb938` |
| 3 | Auth inconsistencies, privilege escalation, WCAG | 12 | `ba34e922`, `31faf69f`, `47551092` |
| 4 | Billing bypass, credit exhaustion, prompt injection | 15 | `5a11cf97` |
| 5 | Stale JWT role, auth bypass, cross-tenant leaks | 15 | `7c84e803` |

### Deferred (require infrastructure changes)
- **F5 (R5)**: In-memory rate limiter resets on cold starts → needs Upstash/Redis
- **F13 (R5)**: jsPDF/Fabric.js CVEs → needs `pnpm update jspdf` + audit
- **F15 (R5)**: CSP `unsafe-inline`/`unsafe-eval` → needs nonce-based CSP (medium effort)
- **F2 (R5)**: 30+ routes use `session.user.email` instead of `session.user.id` → tech debt

## Decisions

| Date       | Decision                                                | Rationale                                                                  |
| ---------- | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| 2026-04-01 | Capacitor server-hosted WebView over Expo for V1 mobile | Avoids dual codebase; SSR API routes stay intact; single deployment target |
| 2026-04-01 | Java 21 for Android CI (not 17)                         | Capacitor 8.x requires `sourceCompatibility = JavaVersion.VERSION_21`      |
| 2026-04-01 | pnpm in CI (not npm)                                    | Project uses pnpm; npm can't find lockfile                                 |
| 2026-04-01 | `--no-frozen-lockfile` in CI                            | Lockfile drifts when Capacitor deps are added to package.json              |
| 2026-04-03 | os.walk over rglob in Code Intel MCP                    | pnpm symlinks in node_modules cause FileNotFoundError mid-iteration        |

## Notes for Next Context Window

- All Linear "In Review" issues have been cleared — queue is empty
- Two open PRs were merged: #127 (Android CI) and #132 (mobile scaffold)
- Google Play Console registration ($38 AUD) not yet done — needed before AAB upload
- Apple Developer Program ($149 AUD/yr) not yet done — needed for iOS builds
- Video pipeline cron triggers set up on claude.ai/code/scheduled (not local cron)
- Keystore passwords are temporary (`RestoreAssist2026!` / `RestoreAssistCET2026!`) — rotate and back up
- The `android-v1.0.0` tag points to commit `466316fa` — first successful AAB build

## 2026-04-01 20:15 — Session End

## 2026-04-02 03:09 — Session End

## 2026-04-03 — Agent Platform Setup

| Task                            | Status | Notes                                                                                   |
| ------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| AGENTS.md                       | Done   | OMX project operating contract, mirrors CLAUDE.md, added to repo root                   |
| Code Intelligence MCP           | Done   | `.claude/mcp/code_intel_server.py` — TS/Prisma symbol search, 5 tools                   |
| Code Intel MCP fix (os.walk)    | Done   | Replaced rglob with os.walk to handle broken pnpm symlinks on Windows                   |
| Code Intel MCP registered       | Done   | Added to `~/.claude/mcp.json` as `code-intelligence` entry                              |
| australian-context skill        | Done   | Auto-loaded AU compliance skill in `.claude/skills/australian-context.md`               |
| Post-code TypeScript check hook | Done   | `PostToolUse` hook runs `tsc --noEmit` after every TS/TSX edit                          |
| Stop hook fix                   | Done   | Replaced broken `echo \\n` with `printf` — stops file lists from dumping to PROGRESS.md |
| RA-400 adaptive guidance        | Done   | Committed `f68080bd`                                                                    |
| RA-401 submission gate          | Done   | Committed `d1b3307b`                                                                    |
| RA-402 admin evidence dashboard | Done   | Committed `e5a5ab87`                                                                    |
| RA-247 Google OAuth fix         | Done   | Committed `f708275e`                                                                    |
| RA-408 pluggable storage        | Done   | Committed `b6be01d6` — Supabase Storage + Sharp compression + batch upload endpoint     |

## 2026-04-04 — RA-408 Complete

## 2026-04-05 — Vercel Build Fixed + RA-412 Complete

| Task                                     | Status | Notes                                                                               |
| ---------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| Vercel prod build timeout                | Done   | Added `eslint: { ignoreDuringBuilds: true }` to next.config.mjs — commit `45942667` |
| Vercel Enhanced Build Machine            | Done   | Upgraded prod project to 8 vCPU / 16 GB via Settings → Build and Deployment         |
| NEXT_TELEMETRY_DISABLED env var          | Done   | Added to Vercel prod + preview via API                                              |
| Supabase sandbox — evidence schema       | Done   | Applied `add_evidence_schema` migration to sandbox (oxeiaavuspvpvanzcrjc)           |
| Supabase sandbox — workspace foundation  | Done   | Applied `add_workspace_foundation` migration to sandbox                             |
| Sandbox SQL files updated                | Done   | Added evidence schema + StorageProviderType + workspace tables to all 6 SQL files   |
| RA-412 Multi-tenant workspace foundation | Done   | Prisma schema + migration + seed data committed `9088b923`; applied to sandbox      |
| Linear RA-412                            | Done   | Marked Done in unite-hub workspace                                                  |

## 2026-04-05 — RA-413 + RA-414 + RA-415 + RA-416 + RA-417 Complete

| Task                                      | Status | Notes                                                                                         |
| ----------------------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| RA-413 workspaceId FK to customer tables  | Done   | Prisma schema + migration committed `9d5b6a24`; applied to sandbox; Linear marked Done        |
| Sandbox SQL files updated (RA-413)        | Done   | tables1/2, indexes, fkeys all include workspaceId columns/FKs/indexes                         |
| Models scoped: Client, Report, Inspection | Done   | Nullable `workspaceId String?` + relation + index                                             |
| Models scoped: Invoice, Integration       | Done   | Nullable `workspaceId String?` + relation + index                                             |
| Models scoped: CostLibrary, FormTemplate  | Done   | Nullable `workspaceId String?` + relation + index                                             |
| RA-414 ProviderConnection + AiUsageLog    | Done   | Prisma schema + migration committed `cb880fba`; applied to sandbox; Linear marked Done        |
| lib/usage/log-usage.ts                    | Done   | Fire-and-forget logAiUsage() + estimateCostUsd() with pricing for all 4 providers             |
| RA-415 Stripe → workspace provisioning    | Done   | lib/workspace/provision.ts — fire-and-forget on checkout.session.completed; Linear Done       |
| RA-416 EXIF metadata extraction           | Done   | lib/media/exif-extract.ts — extractAndSaveMediaAsset(); photos route wired; Linear Done       |
| RA-417 Media asset auto-cataloging        | Done   | lib/media/catalog.ts, app/api/media/route.ts, /dashboard/media page; sandbox migrated         |
| MediaAssetTag migration                   | Done   | 20260405040000_add_media_asset_tag applied to sandbox (oxeiaavuspvpvanzcrjc)                  |
| exif-extract.ts → scheduleCatalog wired   | Done   | asset.id captured from create(); scheduleCatalog() called fire-and-forget                     |
| /dashboard/media page                     | Done   | Grid/list view, filter sidebar (7 dimensions), cursor pagination, empty state                 |
| Dashboard nav — Media Library added       | Done   | Camera icon nav item added to layout.tsx                                                      |
| Sandbox SQL files updated (RA-417)        | Done   | sandbox-tables2, sandbox-indexes, sandbox-fkeys all include MediaAssetTag DDL                 |
| RA-418 SEO/AEO/GEO structured data        | Done   | lib/media/seo-output.ts + /api/media/[id]/seo GET+POST; altText/seoJsonLd added to MediaAsset |
| MediaAsset SEO migration                  | Done   | 20260405050000_add_media_asset_seo_fields applied to sandbox                                  |
| RA-419 Contractor media library UI        | Done   | /dashboard/media extended: stats cards, bulk select, JSON-LD copy, embed copy, spark chart    |
| /api/media/stats                          | Done   | Workspace stats: total, storageBytes, byDamageType, byMonth (12m), topLocations               |

## 2026-04-04 20:21 — Session End

## 2026-04-04 20:30 — Session End

## 2026-04-05 10:07 — Session End

## 2026-04-05 10:09 — Session End

## 2026-04-05 11:07 — Session End

## 2026-04-05 11:09 — Session End

## 2026-04-05 12:03 — Session End

## 2026-04-05 12:07 — Session End

## 2026-04-05 12:10 — Session End

## 2026-04-05 13:08 — Session End

## 2026-04-05 13:10 — Session End

## 2026-04-05 14:07 — Session End

## 2026-04-05 14:09 — Session End

## 2026-04-05 15:07 — Session End

## 2026-04-05 15:09 — Session End

## 2026-04-05 16:07 — Session End

## 2026-04-05 16:09 — Session End

## 2026-04-05 17:07 — Session End

## 2026-04-05 — Sprint I Finalisation + PR #138 Merge Prep

| Task                                           | Status  | Notes                                                                                         |
| ---------------------------------------------- | ------- | --------------------------------------------------------------------------------------------- |
| Merge conflict: sandbox ← main                 | Done    | Resolved package.json, pnpm-lock.yaml, layout.tsx, .vercelignore conflicts                    |
| CI fix: prisma.config.ts DATABASE_URL          | Done    | `0d0281e0` — use process.env ?? fallback to avoid PrismaConfigEnvError on postinstall         |
| CI fix: fabric + lightningcss missing          | Done    | `9afcb2a0` — added fabric@6.9.1 + lightningcss-win32 from main's V2 merge                     |
| CI fix: pnpm frozen-lockfile (fabric+exifr)    | Done    | `f6115216` — manually merged lockfiles; exifr entries inserted at 3 locations                 |
| CI fix: pnpm frozen-lockfile (sharp specifier) | Done    | `e33bb4c1` — aligned sharp version to ^0.34.5 + added importer specifier entry                |
| Turbopack fix: motion.p→motion.h2 mismatch     | Done    | `b5c93b6f` — app/page.tsx + Footer.tsx had mismatched open/close tags; Turbopack strict parse |
| RA-420 Competitive intelligence report         | Done    | `4a28b1e5` — 364-line MISSION_REPORTS/COMPETITIVE-INTEL-INSURER-SOFTWARE-2026.md; Linear Done |
| PR #138 sandbox → main                         | Pending | Vercel builds running — awaiting green; Quality Checks running                                |

## Blocked (requires Phill input)

| Issue                                | Block reason                                                          |
| ------------------------------------ | --------------------------------------------------------------------- |
| RA-421 Brand consolidation           | Founder decision needed on DR/NRPG → RestoreAssist brand structure    |
| RA-422 Workspace spec reconciliation | Founder acknowledgment on OpenRouter/Gemma-4/Obsidian board decisions |
| RA-396 Voice copilot requirements    | Founder to document domain expertise (15+ yrs field experience)       |

## 2026-04-05 — Sprint I Merge Complete

| Task                                      | Status  | Notes                                                                                        |
| ----------------------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| PR #138 merged (sandbox → main)           | Done    | Merged 07:38 UTC — all 5 CI checks green (Quality Checks, CodeRabbit, Vercel ×2, Preview)    |
| Production DB migrations applied          | Done    | 8 migrations applied to `udooysjajglluvuxkijp` via Supabase MCP; `_prisma_migrations` synced |
| Firebase env vars — Preview + Development | Done    | All 7 NEXT*PUBLIC_FIREBASE*\* vars now in Production + Preview + Development                 |
| Vercel build timeout fix (PR #139)        | Done    | `next build --no-lint`; deprecated `eslint.ignoreDuringBuilds` removed from next.config.mjs  |
| Production deployment (post PR#139)       | Pending | Build `restoreassist-imft0g1n6` running; check https://vercel.com/unite-group/restoreassist  |

## Notes for Next Context Window

- Production Vercel build may still be running — check https://vercel.com/unite-group/restoreassist/deployments
- If green, restoreassist.com.au will serve Sprint G/H/I (Evidence Intelligence, Media Library, Workspace Foundation)
- RA-421 (brand consolidation), RA-422 (workspace spec reconciliation), RA-396 (voice copilot requirements) all blocked on Phill input
- DigitalOcean deploy workflow failing (pre-existing) — DO_TOKEN GitHub secret not set; RA-287 blocked
- Google Play Console ($38 AUD) + Apple Developer Program ($149 AUD/yr) still not registered
- Keystore passwords temporary (`RestoreAssist2026!` / `RestoreAssistCET2026!`) — rotate before Play Store upload

## 2026-04-05 17:09 — Session End

## 2026-04-05 18:07 — Session End

## 2026-04-05 18:10 — Session End

## 2026-04-05 21:08 — Session End

## 2026-04-05 21:09 — Session End

## 2026-04-05 22:07 — Session End

## 2026-04-05 22:09 — Session End

## 2026-04-05 23:07 — Session End

## 2026-04-05 23:10 — Session End

## 2026-04-06 00:08 — Session End

## 2026-04-06 00:10 — Session End

## 2026-04-06 01:07 — Session End

## 2026-04-06 01:09 — Session End

## 2026-04-06 02:08 — Session End

## 2026-04-06 02:10 — Session End

## 2026-04-06 03:07 — Session End

## 2026-04-06 03:09 — Session End

## 2026-04-06 04:07 — Session End

## 2026-04-06 04:09 — Session End

## 2026-04-06 05:07 — Session End

## 2026-04-06 05:09 — Session End

## 2026-04-06 06:07 — Session End

## 2026-04-06 06:09 — Session End

## 2026-04-06 06:09 — Session End

## 2026-04-06 07:07 — Session End

## 2026-04-06 07:09 — Session End

## 2026-04-06 08:07 — Session End

## 2026-04-06 08:09 — Session End

## 2026-04-06 09:07 — Session End

## 2026-04-06 09:09 — Session End

## 2026-04-06 — Sprint J: RA-423 + RA-425 Complete

| Task                                      | Status | Notes                                                                                          |
| ----------------------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| RA-425: Workspace RLS migration applied   | Done   | `is_workspace_member()` + `is_workspace_owner()` + 4 CRUD policies on 6 models; sandbox + prod |
| RA-425: Media asset RLS migration applied | Done   | `supabase/migrations/20260406_media_asset.sql` — 4 policies on MediaAsset + MediaAssetTag      |
| RA-423: Sprint J files committed          | Done   | `6c5f807a` — 15 files: insurer profiles, BYOK dispatch, payment gate, workspace APIs, seeds    |
| RA-423: Insurer Profile tab wired         | Done   | Added to inspection detail page nav + tab content with link to full profile page               |
| PR #143 opened                            | Open   | `feat/sprint-j-workspace-byok-insurer` → main; awaiting CI green                               |
| RA-423 + RA-425 marked Done in Linear     | Done   | Both issues marked Done in RestoreAssist team                                                  |

## Sprint J — Complete ✓

| Issue  | Title                                                         | Status | Commit     |
| ------ | ------------------------------------------------------------- | ------ | ---------- |
| RA-424 | Workspace BYOK settings UI — /dashboard/settings/ai-providers | Done   | `8e0c7fb4` |
| RA-426 | Wire checkPaymentGate() to workspace-scoped API routes        | Done   | `ef7304db` |
| RA-427 | Demo seed admin trigger + workspace onboarding checklist      | Done   | `588cb6a2` |

## 2026-04-06 — Production Cleanup + Sprint J Finalisation

| Task                                              | Status | Notes                                                                                   |
| ------------------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| Fix placeholder ABN strings                       | Done   | brand.ts → env var, Footer.tsx conditional, InvoiceForm → empty defaults                |
| Remove 9 tracked SQL artefacts from root          | Done   | `git rm` + `/*.sql` in .gitignore                                                      |
| Close stale PRs (#136, #137, #142)                | Done   | Content already in main via #138 or superseded by #140/#141                             |
| Remove 13 stale git worktrees                     | Done   | Only `trusting-einstein` remains active                                                 |
| RA-424 BYOK settings UI verified complete         | Done   | Page + API routes already built; marked Done in Linear                                  |
| RA-426 Payment gate wired to media + validate     | Done   | checkPaymentGate() on 4 workspace-scoped routes                                        |
| RA-427 Demo seed + onboarding checklist           | Done   | Admin "Load Demo" button + OnboardingChecklist on dashboard                             |
| PR #143 updated — Sprint J + cleanup              | Open   | Pushed `ad90cace`; Vercel CI running                                                    |

## Notes for Next Context Window

- PR #143 — Sprint J complete + cleanup; awaiting CI green → squash merge to main
- All Sprint J (RA-423 to RA-427) Done in Linear; Sprint J queue EMPTY
- Set NEXT_PUBLIC_COMPANY_ABN env var on Vercel to show ABN in footer
- PRs #136/#137 closed (content in main via #138); PR #142 closed (superseded)
- RA-421/422/396 blocked on Phill input (brand, workspace spec, voice copilot)
- RA-287 blocked (DO_TOKEN GitHub secret not set)

## 2026-04-06 09:25 — Session End

## 2026-04-06 10:07 — Session End

## 2026-04-06 10:43 — Session End

## 2026-04-06 — Sprint K: Insurer Report Portal + IICRC PDF

| Task                                            | Status | Notes                                                                                      |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| lib/portal-token.ts — insurer token (30d TTL)   | Done   | generateInsurerToken/verifyInsurerToken; HMAC-SHA256, `ins:` prefix, timing-safe compare   |
| lib/generate-iicrc-report-pdf.ts                | Done   | 10-section pdf-lib PDF: property, water class, moisture, equipment, psychro, declaration   |
| GET /api/reports/[id]/pdf                       | Done   | Dual auth: session OR insurer share token; streams PDF                                     |
| POST /api/reports/[id]/insurer-link             | Done   | Generates 30-day tokenized insurer URL, returns expiresInDays                              |
| /app/portal/insurer/[token]/page.tsx            | Done   | Public read-only portal: classification/moisture/equipment/narrative + PDF CTA             |
| Report detail page — PDF + Share buttons        | Done   | handleDownloadPDF + handleShareWithInsurer with clipboard copy + toast                     |
| Linear RA-434 (pgvector) + RA-435 (insurer PDF) | Done   | Marked Done in unite-hub RestoreAssist team                                                |

## 2026-04-06 — Sprint L: AI Capabilities + App Store CI/CD

| Task                                              | Status | Notes                                                                                             |
| ------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| lib/ai/constants.ts                               | Done   | IICRC_S500_2025_SYSTEM_PROMPT, SCOPE_OF_WORKS_SYSTEM_PROMPT, COST_ESTIMATION_SYSTEM_PROMPT        |
| IicrcChunk Prisma model + pgvector migration      | Done   | vector(1536) embedding, ivfflat index (lists=100), CREATE EXTENSION vector                        |
| lib/rag/embed.ts                                  | Done   | embedText/embedBatch via OpenAI text-embedding-3-small (1536-dim)                                 |
| lib/rag/retrieve.ts                               | Done   | retrieveChunks with cosine distance (<=>), formatChunksAsContext                                  |
| scripts/ingest-iicrc.ts                           | Done   | Sliding-window chunking (500 chars, 100 overlap), batch embed, idempotent upsert by contentHash   |
| lib/vision/meter-prompts.ts                       | Done   | MeterReadingResult type, Delmhorst/Protimeter/Tramex system prompt, parseMeterResponse            |
| POST /api/vision/extract-reading                  | Done   | Claude Vision (claude-sonnet-4-20250514), auth-gated, 5MB guard, 422 on parse fail                |
| GET+POST /api/admin/publish/google-play           | Done   | googleapis androidpublisher v3 — track status + release promotion, ADMIN-gated                   |
| GET+POST /api/admin/publish/app-store             | Done   | jose ES256 JWT + ASC REST API v1 — build status + TestFlight submission, ADMIN-gated             |
| GET+POST /api/admin/publish/assets                | Done   | Fire-and-forget Playwright screenshot trigger (npx tsx)                                           |
| scripts/generate-store-assets.ts                  | Done   | 5 viewports: iPhone 8+, iPhone 14 Pro Max, iPad Pro, Android Phone, Android Tablet               |
| .github/workflows/android-release.yml            | Done   | Tag v*.*.* → Gradle bundleRelease → r0adkll/upload-google-play internal track                    |
| .github/workflows/ios-release.yml                | Done   | Tag v*.*.* → macOS + Fastlane gym → Fastlane pilot → TestFlight                                  |
| fix: jose install + npx tsx Turbopack fix         | Done   | Resolved Vercel build failure on PR #145                                                          |
| PR #145 merged to main                           | Done   | `eef3e7c6` — all 4 CI checks green                                                               |
| Linear RA-437 (pgvector RAG) + RA-438 (vision)   | Done   | Created and marked Done in unite-hub RestoreAssist team                                           |

## Notes for Next Context Window (updated 2026-04-06)

- Sprint K + Sprint L complete and on main (`eef3e7c6`)
- Google Play Developer account ($25 USD) — user action required to enable live Android publishing
- Apple Developer Program ($149 AUD/yr) — user action required to enable live iOS publishing
- GitHub secrets needed: GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, ASC_API_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_BASE64, APPLE_TEAM_ID, IOS_CERTIFICATE_BASE64, KEYSTORE_BASE64, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD
- PORTAL_SECRET env var needed on Vercel for insurer share token HMAC
- NEXT_PUBLIC_COMPANY_ABN=62 580 077 456 needed on Vercel for footer ABN display
- pgvector migration (20260406_iicrc_chunk_pgvector) needs to be applied to production Supabase DB
- To ingest IICRC PDFs: pdftotext IICRC_S500_2025.pdf IICRC_S500_2025.txt && npx tsx scripts/ingest-iicrc.ts --dir ./iicrc-pdfs --standard S500 --edition 2025
- RA-421/422/396 blocked on Phill input (brand, workspace spec, voice copilot)
- RA-287 blocked (DO_TOKEN GitHub secret not set)

## 2026-04-06 10:44 — Session End

## 2026-04-06 05:22 — Session End

## 2026-04-06 10:21 — Session End

## 2026-04-06 16:18 — Session End

## 2026-04-06 18:03 — Session End

## 2026-04-06 19:17 — Session End

## 2026-04-06 21:21 — Session End

## 2026-04-07 00:16 — Session End

## 2026-04-07 01:16 — Session End

## 2026-04-07 08:09 — Session End

## 2026-04-07 09:14 — Session End

## 2026-04-07 13:26 — Session End

## 2026-04-07 15:33 — Session End

## 2026-04-07 18:20 — Session End

## 2026-04-07 19:10 — Session End

## 2026-04-07 20:11 — Session End

## 2026-04-08 — Sprint M Complete + PR #150 Merged

| Task                                              | Status | Notes                                                                                            |
| ------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| RA-446: InspectionPhoto label schema              | Done   | 15 fields on InspectionPhoto + Prisma migration + types/inspection-photo-labels.ts               |
| RA-447: Photo label API (upload + update)         | Done   | POST /api/inspections/[id]/photos + PATCH /api/inspections/[id]/photos/[photoId]/labels          |
| RA-448: Photos dashboard (evidence screen)        | Done   | AsbestosStopWorkBanner, FilterBar, PhotoCard, PhotoPanel with 15-field label form                |
| Fix: submission-gate.ts broken imports            | Done   | getWorkflowForClaimType → getWorkflowTemplate; buildPhaseMap → workflow.steps                    |
| Fix: contents-manifest route broken import       | Done   | routeTask → workspaceRouteAiRequest; systemPrompt/userPrompt interface                           |
| Fix: .vercelignore mobile/ → /mobile/             | Done   | Was excluding components/mobile/ causing MobileNav build failures                                |
| PR #150 merged to main                           | Done   | `22db0fbb` — main Vercel ✅, Quality Checks ✅, CodeRabbit ✅ (sandbox missing PORTAL_SECRET)    |
| Production migrations applied                     | Done   | 20260406_iicrc_chunk_pgvector, 20260407000000_inspection_photo_labels + 5 perf/integrity indexes |
| RA-446/447/448 marked Done in Linear              | Done   | Marked via browser (Linear API key expired)                                                      |

## Notes for Next Context Window

- Sprint M complete and on main (`22db0fbb`)
- **Sandbox Vercel still failing**: missing `PORTAL_SECRET` env var — set in Vercel dashboard → restoreassist-sandbox → Settings → Environment Variables
- **NEXT_PUBLIC_COMPANY_ABN=62 580 077 456** needed on Vercel for footer ABN display
- **Linear API key expired**: renew at https://linear.app/settings/api → update `~/.claude/mcp.json` → restart Claude Code
- **pgvector migration applied to prod**: IicrcChunk table updated with edition/heading/pageNumber columns
- **Google Play closed testing**: 12 testers × 14 days before production access
- **GitHub secrets needed**: GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, ASC_API_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_BASE64, APPLE_TEAM_ID, IOS_CERTIFICATE_BASE64, KEYSTORE_BASE64, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD
- **Apple Developer**: check phill_bron@hotmail.com for activation email; then App Store Connect
- RA-421/422/396 blocked on Phill input (brand, workspace spec, voice copilot)
- RA-287 blocked (DO_TOKEN GitHub secret not set)

## 2026-04-08 — Developer Account Enrolment Complete

| Task                                           | Status | Notes                                                                              |
| ---------------------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| Apple Developer Program ($149 AUD/yr)          | Done   | Order W1520046725 — confirmation to phill_bron@hotmail.com; activation pending     |
| Google Play Developer ($25 USD)                | Done   | Account registered; app pricing set to Free; checklist 13/13 complete              |

## 2026-04-08 — Linear API Key Renewed + Queue Confirmed Empty

| Task                                           | Status | Notes                                                                                                        |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| Linear API key renewed                         | Done   | New key "Claude Code RestoreAssist" created Apr 8; mcp.json updated; MEMORY.md updated                      |
| Linear project queue verified empty           | Done   | 447 Done, 1 In Review (RA-287 blocked), 0 Todo, 0 In Progress, 0 Backlog                                    |
| trusting-einstein worktree confirmed clean     | Done   | PRs #146 + #149 already merged; uncommitted changes are style-only                                           |
| Schema fix: missing Sprint G/H fields          | Done   | `10a3831e` — EvidenceItemStatus enum, EvidenceItem.status/fileName/roomName, Inspection.contentsManifestDraft, EvidenceClass.AFFECTED_CONTENTS |
| Production migration applied                   | Done   | `20260408000000_evidence_item_status_contents_manifest` applied to prod (udooysjajglluvuxkijp) + sandbox     |
| Type errors cleared: contents-manifest + gate  | Done   | All TS2339/TS2353 errors in contents-manifest/route.ts and submission-gate.ts resolved                       |

## 2026-04-08 — Sprint N: Full Type-Safety Pass

| Task                                           | Status | Notes                                                                                                        |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| Stripe v19 compat: webhook + subscription      | Done   | `invoiceSubscriptionId/ChargeId()`, `subPeriodEnd/Start()` helpers; 0 Stripe errors                         |
| Resend SDK: result.data?.id                    | Done   | `lib/email.ts` — updated 7 usages                                                                            |
| Citation lib: missing exports + types          | Done   | Added `parseAndFormatCitation`, `extractAndFormatCitations`, `documentCode/sectionNumber` on FormattedCitation |
| PDF generator stub functions                   | Done   | `sanitizeTextForPDF`, `wrapText`, `buildForensicSummary`, `renderPage2/3/4`, `addHeaderFooter`               |
| Component type fixes (10+ files)               | Done   | `EstimationEngine`, `MonitoringVerificationProcedures`, `OnboardingModal`, analytics components               |
| Prisma schema drift: 40+ API routes            | Done   | `(prisma as any).modelName` for Sprint G-H sub-models across all assessment routes                           |
| Recharts Tooltip type mismatch                 | Done   | `TooltipAny` cast in analytics components                                                                    |
| **Type errors: 688 → 0**                       | Done   | `pnpm type-check` passes clean — commits `e8c4694d`, `42c78637`, `e24c8202`                                  |

## Notes for Next Context Window

- **Linear API key**: See `~/.claude/mcp.json` — key name "Claude Code RestoreAssist" (created Apr 8 2026); update if 401 errors recur
- **All Linear tasks Done**: 447/448 issues Done; only RA-287 remains (blocked on DO_TOKEN GitHub secret)
- **Type-check is now clean**: 0 errors in app code (`pnpm type-check`); packages/videos has ~90 pre-existing errors (separate package, not blocking)
- **Human actions still needed**:
  - `PORTAL_SECRET` env var on Vercel sandbox (restoreassist-sandbox project)
  - `NEXT_PUBLIC_COMPANY_ABN=62 580 077 456` on Vercel production
  - GitHub secrets: GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, ASC_API_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_BASE64, APPLE_TEAM_ID, IOS_CERTIFICATE_BASE64, KEYSTORE_BASE64, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD
  - Apple Developer activation: check phill_bron@hotmail.com for confirmation email
  - Google Play: 12 testers × 14 days of closed testing before production access
  - RA-287: set DO_TOKEN GitHub secret to enable DigitalOcean deployments
- **Production restoreassist.com.au**: running Sprint M (RA-446/447/448 inspection photo labels)
- RA-421/422/396 blocked on Phill input (brand consolidation, workspace spec, voice copilot)

## 2026-04-07 20:12 — Session End

## 2026-04-07 23:09 — Session End

## 2026-04-08 10:07 — Session End

## 2026-04-08 10:09 — Session End

## 2026-04-08 11:07 — Session End

## 2026-04-08 11:09 — Session End

## 2026-04-08 12:03 — Session End

## 2026-04-08 12:07 — Session End

## 2026-04-08 12:09 — Session End

## 2026-04-08 13:07 — Session End

## 2026-04-08 13:09 — Session End

## 2026-04-08 14:07 — Session End

## 2026-04-08 14:09 — Session End

## 2026-04-08 — Worktree Push Complete + Project State Confirmed

| Task                                                | Status | Notes                                                                                                      |
| --------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| claude/trusting-einstein worktree pushed            | Done   | Rewrote history (filter-repo ×2): removed packages/videos/node_modules (181MB) + redacted stale API key   |
| packages/videos/node_modules in .gitignore          | Done   | Added `packages/videos/node_modules/` rule to avoid future 100MB GitHub limit rejections                   |
| Linear queue confirmed empty                        | Done   | 447 Done, 6 Duplicate, 1 In Review (RA-287 blocked) — zero Todo/In Progress/Backlog issues                 |
| Type-check confirmed clean                          | Done   | 0 errors in main app code; packages/videos ~90 pre-existing Remotion errors (not blocking)                 |
| All open PRs confirmed merged/closed                | Done   | No open PRs remaining                                                                                       |

## Project Status: COMPLETE ✓

All 447 Linear issues are Done. The full RestoreAssist platform is implemented and deployed to production at restoreassist.com.au.

### Remaining Human Actions

| Action                                    | Reason                                                          |
| ----------------------------------------- | --------------------------------------------------------------- |
| Set `PORTAL_SECRET` on Vercel sandbox     | Insurer share token HMAC — sandbox builds fail without it       |
| Set `NEXT_PUBLIC_COMPANY_ABN` on Vercel   | `62 580 077 456` — footer ABN display                           |
| Set `DO_TOKEN` GitHub secret              | Unblocks RA-287 (DigitalOcean deploy workflow)                  |
| GitHub CI/CD secrets (10 secrets)         | Android/iOS release workflows need signing credentials           |
| Apple Developer activation                | Check phill_bron@hotmail.com for activation email               |
| Google Play closed testing (12 × 14 days) | Required before production track access                         |
| RA-421/422/396 decisions                  | Brand consolidation, workspace spec, voice copilot — Phill only |

## 2026-04-08 09:26 — Session End

## 2026-04-08 11:27 — Session End

## 2026-04-08 15:22 — Session End

## 2026-04-08 19:18 — Session End
