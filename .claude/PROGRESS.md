# Progress — RestoreAssist

**Phase:** Active Build — V2 stabilisation + mobile launch prep
**Last updated:** 2026-04-03

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
