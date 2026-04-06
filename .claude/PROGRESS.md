# Progress — RestoreAssist

**Phase:** Active Build — Sprint I complete, sandbox→main PR open
**Last updated:** 2026-04-04

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

## 2026-04-06 10:44 — Session End

## 2026-04-06 05:22 — Session End

## 2026-04-06 08:03 — Session End
