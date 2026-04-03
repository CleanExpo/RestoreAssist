# Progress — RestoreAssist

**Phase:** Active Build — V2 stabilisation + mobile launch prep
**Last updated:** 2026-04-03

## Active Tasks

| Task                        | Status  | Notes                                                                                |
| --------------------------- | ------- | ------------------------------------------------------------------------------------ |
| Android CI/CD pipeline      | Done    | PR #127 merged — first signed AAB built (Java 21, pnpm, gradlew +x)                  |
| Android v1.1.0 build        | Done    | Tag `android-v1.1.0` → AAB built 2026-04-01 (18 commits since v1.0.0)                |
| iOS native project init     | Done    | `ios/` directory committed (builds require macOS / Capgo cloud)                      |
| RA-384 mobile scaffold      | Done    | PR #132 merged — Expo SDK 52 / React Native 0.76 / expo-router                       |
| RA-317 environmental edit   | Done    | Already in main (confirmed 2026-04-01)                                               |
| RA-321 photo upload         | Done    | Already in main (confirmed 2026-04-01)                                               |
| RA-328 cost CSV import      | Done    | PR #129 merged                                                                       |
| Haiku 3→4.5 migration       | Done    | PR #134 merged — lib/anthropic-models.ts + tsconfig exclude mobile                   |
| RA-387 production hardening | Done    | PR #135 merged — mobile card views, loading skeletons, error boundaries              |
| RA-388 authority forms      | Done    | Already fully implemented (SignatureCanvas, PDF embed, signatory flow)               |
| RA-392 S500:2025 page       | Done    | Full compliance reference page — field mapping table, report structure, CTA          |
| UNI-1760 model audit (RA)   | Done    | All legacy model strings migrated to claude-haiku-4-5-20251001 / claude-sonnet-4-6   |
| RA-389 demo dataset seed    | Done    | prisma/seed-demo.ts — Cat 2, 150m², 9 moisture readings, equipment log, S500 report  |
| Video pipeline triggers     | Done    | 4 cloud triggers on claude.ai/code/scheduled (generate, poll, distribute, analytics) |
| RA-397 evidence schema      | Done    | EvidenceItem/CustodyEvent models + enums in prisma/schema.prisma                     |
| RA-398 workflow definitions | Done    | lib/evidence/ — evidence-classes.ts, workflow-definitions.ts, index.ts               |
| RA-399 guided capture UI    | Done    | app/dashboard/inspections/[id]/capture/ — step-by-step workflow engine               |
| RA-400 adaptive guidance    | Done    | ExperienceMode enum + User field + toggle UI + API endpoint                          |
| RA-401 submission gate      | Done    | lib/evidence/submission-gate.ts + enforced in submit route                           |
| RA-402 evidence review      | Done    | app/dashboard/admin/evidence-review/ — completeness dashboard                        |
| RA-403 Gemma-4-31B-IT tier  | Done    | lib/ai/gemma-client.ts — OpenAI-compat client for self-hosted VLM                    |
| RA-404 model router         | Done    | lib/ai/model-router.ts — 11 task types, Gemma→BYOK fallback                          |
| RA-405 contents manifest    | Done    | API + UI — VLM item ID from AFFECTED_CONTENTS photos, CSV export                     |
| RA-406 insurer profiles     | In Prog | InsurerProfile model + admin UI — per-insurer evidence/report requirements           |
| RA-287 V2 deploy to prod    | Blocked | Needs human: merge PR #33 + set DO/Vercel env vars                                   |
| RA-238 YouTube rebrand      | Blocked | Needs human: YouTube Studio channel rename                                           |
| RA-246 mobile env config    | Blocked | Needs human: Supabase env vars + EAS project ID                                      |
| RA-383 pilot pipeline       | Blocked | Needs human: IICRC Australasia contacts                                              |
| RA-247 Google OAuth fix     | Done    | Clock skew, callbackUrl, Firebase env docs, error message sanitization               |

## Decisions

| Date       | Decision                                                | Rationale                                                                  |
| ---------- | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| 2026-04-01 | Capacitor server-hosted WebView over Expo for V1 mobile | Avoids dual codebase; SSR API routes stay intact; single deployment target |
| 2026-04-01 | Java 21 for Android CI (not 17)                         | Capacitor 8.x requires `sourceCompatibility = JavaVersion.VERSION_21`      |
| 2026-04-01 | pnpm in CI (not npm)                                    | Project uses pnpm; npm can't find lockfile                                 |
| 2026-04-01 | `--no-frozen-lockfile` in CI                            | Lockfile drifts when Capacitor deps are added to package.json              |

## Notes for Next Context Window

- All Linear "In Review" issues have been cleared — queue is empty
- Two open PRs were merged today: #127 (Android CI) and #132 (mobile scaffold)
- Google Play Console registration ($38 AUD) not yet done — needed before AAB upload
- Apple Developer Program ($149 AUD/yr) not yet done — needed for iOS builds
- Video pipeline cron triggers were set up on claude.ai/code/scheduled in a prior session (not local cron)
- Keystore passwords are temporary (`RestoreAssist2026!` / `RestoreAssistCET2026!`) — should be rotated and backed up
- The `android-v1.0.0` tag points to commit `466316fa` — first successful AAB build

## 2026-04-01 20:15 — Session End

## 2026-04-02 03:09 — Session End

## 2026-04-02 17:17 — Session End

## 2026-04-02 20:19 — Session End

## 2026-04-03 02:03 — Session End

## 2026-04-03 03:14 — Session End

## 2026-04-03 06:17 — Session End

## 2026-04-03 18:31 — Session End
