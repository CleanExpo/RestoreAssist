# Progress — RestoreAssist

**Phase:** Active Build — V2 stabilisation + mobile launch prep
**Last updated:** 2026-04-01

## Active Tasks

| Task                      | Status  | Notes                                                               |
| ------------------------- | ------- | ------------------------------------------------------------------- |
| Android CI/CD pipeline    | Done    | PR #127 merged — first signed AAB built (Java 21, pnpm, gradlew +x) |
| iOS native project init   | Done    | `ios/` directory committed (builds require macOS / Capgo cloud)     |
| RA-384 mobile scaffold    | Done    | PR #132 merged — Expo SDK 52 / React Native 0.76 / expo-router      |
| RA-317 environmental edit | Done    | Already in main (confirmed 2026-04-01)                              |
| RA-321 photo upload       | Done    | Already in main (confirmed 2026-04-01)                              |
| RA-328 cost CSV import    | Done    | PR #129 merged                                                      |
| RA-287 V2 deploy to prod  | Blocked | Needs human: merge PR #33 + set DO/Vercel env vars                  |
| RA-238 YouTube rebrand    | Blocked | Needs human: YouTube Studio channel rename                          |
| RA-246 mobile env config  | Blocked | Needs human: Supabase env vars + EAS project ID                     |
| RA-383 pilot pipeline     | Blocked | Needs human: IICRC Australasia contacts                             |

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

## 2026-04-01 20:15 — Session End

## 2026-04-02 03:09 — Session End

## 2026-04-02 17:17 — Session End

## 2026-04-02 20:19 — Session End

## 2026-04-03 02:03 — Session End

## 2026-04-03 03:14 — Session End

## 2026-04-03 06:17 — Session End

## 2026-04-04 16:54 — Session End

