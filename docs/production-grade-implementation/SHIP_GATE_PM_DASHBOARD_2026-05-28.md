# RestoreAssist Ship-Gate PM Dashboard

Date: 2026-05-28 08:20 AEST
Branch: `codex/ship-gate-recovery`
Repo: `CleanExpo/RestoreAssist`

## Executive Read

RestoreAssist is live and serving production traffic, but it is not ship-ready. The release spine remains RA-4956. The most important change since the stale aggregation snapshot is that local baseline checks now pass after the ship-gate recovery fixes, while live GitHub still shows the production smoke workflow cancelling on `main@adbcd19c` and the pilot canary failing from missing `tough-cookie` wiring until this branch lands.

## Evidence Sources

- Local repo: `git log --oneline -10`, `git status --short --branch`, targeted diffs on this branch.
- Local verification from this branch: `pnpm type-check`, `pnpm lint`, `pnpm exec vitest run`, `pnpm build`, `pnpm audit --prod --audit-level=moderate`, `pnpm --filter @restoreassist/pilot-tester test`, `pnpm --filter @restoreassist/pilot-tester dryrun`.
- GitHub live: `gh pr list --repo CleanExpo/RestoreAssist --state open`, `gh run list`, `gh run view`.
- Vercel live: connected Vercel project `prj_Aw90JJ2x7mTMatTxa3ymgcU7WPV2`, production deployment list, production env list, HTTP smoke.
- Linear: local snapshot `.claude/aggregation/linear/inventory.md` only. Live Linear tools were not exposed in this session, so this must be refreshed when the connector is available.

## Current Live State

| Area                     | Status                       | Evidence                                                                                                                           |
| ------------------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Production website       | Up                           | `https://restoreassist.app/` returned HTTP 200.                                                                                    |
| Production health        | Up                           | `/api/health` returned `status=ok`, `database.status=ok`, latency 1201 ms.                                                         |
| Vercel production deploy | Ready                        | `dpl_E74G3FfRAJkxmHGz3VFsBrNhSRmh`, target `production`, `main@adbcd19c`, state `READY`.                                           |
| Vercel project           | Ready                        | `restoreassist`, Next.js, Node `24.x`, domains include `restoreassist.app`.                                                        |
| Supabase env wiring      | Looks correct                | `NEXT_PUBLIC_SUPABASE_URL` points at `udooysjajglluvuxkijp`; `DATABASE_URL` and `DIRECT_URL` exist for production.                 |
| TLS env blocker          | Cleared from current listing | `NODE_TLS_REJECT_UNAUTHORIZED` did not appear in the current Vercel production env listing.                                        |
| GitHub PR queue          | Mixed                        | 6 open PRs: 4 green/mergeable, 2 red.                                                                                              |
| Main production smoke    | Not healthy                  | Latest `Smoke - Production` run was still stuck in dependency install; prior scheduled runs repeatedly cancelled around 5 minutes. |
| Pilot tester canary      | Red on main                  | Fails with `ERR_MODULE_NOT_FOUND: Cannot find package 'tough-cookie'` from `pilot-tester/src/client/auth.ts`.                      |
| Strict release gate      | Not green                    | Local rerun stalled inside `A1-core-journeys`; process was stopped after producing `FAIL (0/10)` for A1 and beginning A2.          |

## Implemented On This Branch

- Added `pilot-tester` to `pnpm-workspace.yaml`.
- Switched pilot canary dry-run wiring to pnpm workspace install and filtered commands.
- Updated pilot tester dev dependencies and lockfile so `tough-cookie` resolves through workspace install.
- Increased production smoke workflow timeout from 5 to 12 minutes.
- Added production audit overrides for `dompurify`, `tmp`, `ws`, and `qs`; `pnpm audit --prod --audit-level=moderate` now passes locally.
- Extended sandbox-only `/api/test/sign-in-as` to support custom `email` and setup-incomplete sessions.
- Reworked Google Drive smoke to use the sandbox helper instead of public signup, which BotID blocks in sandbox/prod.
- Added regression coverage for the new helper contract.
- Added `docs/production-grade-implementation/RLS_P0_WORKSTREAM.md` for the P0 RLS policy workstream.

## GitHub PR Triage

| PR                               | State                                      | Recommendation                                                                   |
| -------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| #1200 `actions/checkout 4 -> 6`  | Green, mergeable                           | Merge after main smoke is healthy or after this branch fixes smoke/canary on PR. |
| #1199 Phase 2 AI Guardrails      | Green, mergeable                           | Treat as readiness artifact only, not ship approval. Review scope before merge.  |
| #1197 `googleapis 172`           | Green, mergeable                           | Merge one-at-a-time after smoke health is restored.                              |
| #1196 `puppeteer 25`             | Green, mergeable                           | Merge one-at-a-time after smoke health is restored.                              |
| #1195 `react-resizable-panels 4` | Red quality checks                         | Hold or close/recreate smaller.                                                  |
| #1194 minor-and-patch group      | Red quality checks and red Vercel previews | Hold or close/recreate smaller.                                                  |

## Linear Release Spine

Live Linear refresh is still required. Using the local snapshot, RA-4956 is the release gate and these remain the controlling tracks:

- RA-4951: CI Prisma test env stabilisation.
- RA-4952: middleware trial/auth regressions.
- RA-4953: Google Drive onboarding smoke.
- RA-4954: TypeScript route validator drift.
- RA-4955: production audit vulnerabilities.
- RA-4859: handover route verification.
- New P0: RLS disabled on 119 production tables.
- Security blockers before pilot: RA-2989, RA-3009, RA-3034, RA-3004, API auth audit.

## Remaining Ship-Gate Work

1. Land this branch through a clean PR so GitHub can verify the workflow, workspace, lockfile, audit, and smoke-helper changes in CI.
2. Re-run main `Smoke - Production`; prove it completes instead of cancelling.
3. Re-run pilot canary; prove `tough-cookie` resolves and the canary reaches application-level assertions.
4. Deploy the smoke-helper change to sandbox, then rerun `pnpm test:smoke:sandbox` against the deployed sandbox.
5. Refresh live Linear and reconcile RA-4951/4952/4953/4954/4955/4859 statuses against actual merged code.
6. Open or update the P0 RLS issue from `RLS_P0_WORKSTREAM.md` and schedule the first sandbox-only policy batch.
7. Complete owner evidence for billing flows, revenue reconciliation, app store metadata, TestFlight stability, and monitoring alerting.
8. Run `pnpm tsx scripts/release-gate-score.ts --strict` again from a clean, non-dirty checkout and require 100/100 before pilot.

## PM Decision

Do not start Beyond Clean soft pilot yet. The product is live and healthier than the stale reports implied, but the release gate is still red because CI smoke, pilot canary, RLS, and owner evidence are not closed.
