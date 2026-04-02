# Progress — RestoreAssist

**Phase:** Active Build — V2 stabilisation + mobile launch prep
**Last updated:** 2026-04-01

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
| RA-287 V2 deploy to prod    | Blocked | Needs human: merge PR #33 + set DO/Vercel env vars                                   |
| RA-238 YouTube rebrand      | Blocked | Needs human: YouTube Studio channel rename                                           |
| RA-246 mobile env config    | Blocked | Needs human: Supabase env vars + EAS project ID                                      |
| RA-383 pilot pipeline       | Blocked | Needs human: IICRC Australasia contacts                                              |

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
  \n## 2026-04-01 17:24 — Session End\n.claude/settings.local.json
  CLAUDE.md
  tsconfig.json
  \n## 2026-04-01 19:27 — Session End\n.capacitor-native-notes/APP-STORE-SETUP-GUIDE.md
  .capacitor-native-notes/SE-SETUP-INSTRUCTIONS.md
  .capacitor-native-notes/app-store-metadata.md
  .claude/ARCHITECTURE.md
  .claude/PROGRESS.md
  .claude/STANDARDS.md
  .claude/TESTING.md
  .claude/WORKFLOWS.md
  .claude/commands/orchestrator-reviewer.md
  .claude/commands/pr-manager.md
  .claude/commands/review-batch.md
  .claude/commands/review-pr.md
  .claude/plans/V1.1-NIR-DATA-ENTRY.md
  .claude/rules/review-dimensions.md
  .claude/rules/verification-gate.md
  .claude/senior-pm-backlog-analysis.md
  .claude/senior-pm-phase-2-plan.md
  .claude/settings.local.json
  .claude/sql-validation-report.md
  .claude/uni-171-phase-2-completion.md
  \n## 2026-04-01 19:47 — Session End\n.capacitor-native-notes/APP-STORE-SETUP-GUIDE.md
  .capacitor-native-notes/SE-SETUP-INSTRUCTIONS.md
  .capacitor-native-notes/app-store-metadata.md
  .claude/ARCHITECTURE.md
  .claude/PROGRESS.md
  .claude/STANDARDS.md
  .claude/TESTING.md
  .claude/WORKFLOWS.md
  .claude/commands/orchestrator-reviewer.md
  .claude/commands/pr-manager.md
  .claude/commands/review-batch.md
  .claude/commands/review-pr.md
  .claude/plans/V1.1-NIR-DATA-ENTRY.md
  .claude/rules/review-dimensions.md
  .claude/rules/verification-gate.md
  .claude/senior-pm-backlog-analysis.md
  .claude/senior-pm-phase-2-plan.md
  .claude/settings.local.json
  .claude/sql-validation-report.md
  .claude/uni-171-phase-2-completion.md
  \n## 2026-04-02 05:47 — Session End\n.capacitor-native-notes/APP-STORE-SETUP-GUIDE.md
  .capacitor-native-notes/SE-SETUP-INSTRUCTIONS.md
  .capacitor-native-notes/app-store-metadata.md
  .claude/ARCHITECTURE.md
  .claude/PROGRESS.md
  .claude/STANDARDS.md
  .claude/TESTING.md
  .claude/WORKFLOWS.md
  .claude/commands/orchestrator-reviewer.md
  .claude/commands/pr-manager.md
  .claude/commands/review-batch.md
  .claude/commands/review-pr.md
  .claude/plans/V1.1-NIR-DATA-ENTRY.md
  .claude/rules/review-dimensions.md
  .claude/rules/verification-gate.md
  .claude/senior-pm-backlog-analysis.md
  .claude/senior-pm-phase-2-plan.md
  .claude/settings.local.json
  .claude/sql-validation-report.md
  .claude/uni-171-phase-2-completion.md
  \n## 2026-04-02 06:07 — Session End\n.capacitor-native-notes/APP-STORE-SETUP-GUIDE.md
  .capacitor-native-notes/SE-SETUP-INSTRUCTIONS.md
  .capacitor-native-notes/app-store-metadata.md
  .claude/ARCHITECTURE.md
  .claude/PROGRESS.md
  .claude/STANDARDS.md
  .claude/TESTING.md
  .claude/WORKFLOWS.md
  .claude/commands/orchestrator-reviewer.md
  .claude/commands/pr-manager.md
  .claude/commands/review-batch.md
  .claude/commands/review-pr.md
  .claude/plans/V1.1-NIR-DATA-ENTRY.md
  .claude/rules/review-dimensions.md
  .claude/rules/verification-gate.md
  .claude/senior-pm-backlog-analysis.md
  .claude/senior-pm-phase-2-plan.md
  .claude/settings.local.json
  .claude/sql-validation-report.md
  .claude/uni-171-phase-2-completion.md
