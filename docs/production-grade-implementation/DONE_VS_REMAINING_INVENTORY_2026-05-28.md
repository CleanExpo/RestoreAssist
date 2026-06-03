# RestoreAssist Done vs Remaining Inventory

Date: 2026-05-28
Last refreshed: 2026-05-28 12:04 AEST
Purpose: show what has actually been accomplished, what remains, and what proof is needed before pilot.

## Executive Inventory

| Outcome bucket                 | State          | Senior PM read                                                                                    |
| ------------------------------ | -------------- | ------------------------------------------------------------------------------------------------- |
| Production app health          | Done / green   | Production is live and `/api/health` returns `status=ok`, database ok, env ok.                    |
| Main production smoke          | Done / green   | `Smoke - Production` run `26549841376` passed on `main@10452554`; two prior main runs passed.     |
| Local quality baseline         | Done / green   | Clean `origin/main@10452554` passed type-check, lint, prod audit, full Vitest, and focused tests. |
| Smoke cancellation recovery    | Done / green   | PR #1201 / #1203 fixed the production-smoke cancellation loop.                                    |
| Pilot tester dependency wiring | Done / partial | The old `tough-cookie` blocker is fixed; the canary now fails on missing secrets/config.          |
| Reopen/sign-in recovery        | Done / green   | PR #1205 and #1206 shipped front-door redirects, reopen API coverage, and reopen UI.              |
| RLS release spine              | Done / watch   | RA-4970 is Done in Linear; keep watching for any fresh Supabase advisor contradiction.            |
| Pilot canary                   | Remaining      | RA-5615 is red until sandbox-only GitHub Actions secrets exist and real canary passes.            |
| Sandbox release target         | Remaining      | RA-5624 is red until sandbox health is `status=ok` and TLS/env decision is resolved.              |
| Security closure evidence      | Remaining      | RA-2989, RA-3034, and RA-3012 need rotation/revocation/access-log/wrapper-adoption proof.         |
| Owner launch evidence          | Remaining      | RA-5628 evidence files exist but are deferred until owner proof is attached.                      |
| PR #1199 Phase 2 continuation  | Remaining      | Green but too broad; must be split or senior-reviewed before merge.                               |
| Dependency update continuation | Remaining      | Closed #1204 must return only as smaller lane-specific PRs.                                       |
| Current ship approval          | Remaining      | RA-4956 strict gate must return 100/100 from a clean checkout after blockers are green.           |

## Accomplished Work

| Area                   | Evidence                                                                                                     | Residual watch item                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Production deployment  | Vercel production serves `restoreassist.app`; health endpoint is green.                                      | Recheck after any release-path merge or env change.                                                 |
| Production smoke       | Latest green run `26549841376`; prior green runs `26548420795` and `26548324626`.                            | Keep production smoke visible while sandbox/canary work proceeds.                                   |
| Main branch quality    | Clean-gate audit recorded type-check, lint, prod audit, full Vitest, middleware, and billing/webhook passes. | Strict gate still red because sandbox/evidence criteria are broader.                                |
| Workflow repair        | Production smoke cancellation loop fixed; canary dependency wiring advanced past `tough-cookie`.             | Canary now needs real sandbox secrets/config, not another dependency patch.                         |
| User recovery flows    | Reopen route/UI and sign-in redirect recovery shipped through #1205 and #1206.                               | Keep covered in strict gate and smoke after sandbox is repaired.                                    |
| Release command center | PM dashboard, action board, handoff brief, traceability matrix, 48h execution plan, and rerun runbook exist. | Keep documents reconciled to live GitHub/Vercel/Linear evidence.                                    |
| Credits balance        | Owner reported credits were added on 2026-05-28.                                                             | Still needs verification if used as release evidence; does not close RA-2989 secret-rotation proof. |

## Remaining Work By Outcome

| Outcome needed           | Linear owner                | Why it remains open                                                                                                                                     | Done means                                                                                                     |
| ------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Real pilot canary        | RA-5615                     | GitHub Actions secrets list does not show `PILOT_TESTER_USER_POOL_JSON` or `PILOT_TESTER_DATABASE_URL`.                                                 | `Pilot tester canary` passes `dry-run` and `swarm` on `main`, with passing run URL attached.                   |
| Sandbox smoke target     | RA-5624                     | Sandbox health is `status=degraded`, missing `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `XERO_WEBHOOK_KEY`.                                                 | Sandbox health returns `status=ok`, database ok, env ok; TLS env removed or formally excepted.                 |
| Security release closure | RA-2989 / RA-3034 / RA-3012 | Code hardening and owner-reported credit replenishment are not enough; rotation, revocation, service-role, logs, and wrapper adoption proof is missing. | Each issue has dated proof or formal exception, without exposing values.                                       |
| Owner evidence           | RA-5628                     | `D1`, `D3`, `E1`, `E2`, and `F1` evidence files are intentionally fail-closed.                                                                          | Only files with current proof change to `status: pass`; missing proof stays deferred.                          |
| Reviewable Phase 2 path  | RA-5629                     | PR #1199 is green but 238 files and too broad for normal ship-path review.                                                                              | #1199 is split into surgical PRs or receives explicit senior-engineer full-diff sign-off.                      |
| Safe dependency path     | RA-5630                     | Closed Dependabot #1204 mixed high-risk packages and had dirty/red preview state.                                                                       | Replacement PRs are small, lane-specific, green, reviewed, and merged one at a time after smoke stays healthy. |
| Current ship approval    | RA-4956                     | Historical Done status only proves the gate exists; current evidence is not 100/100.                                                                    | Strict release gate rerun from clean checkout returns 100/100.                                                 |

## Deferred Or Watch Work

| Workstream               | Why it waits                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Wave 2 broad AI upgrades | #1199 must not enter the ship path until split or senior-reviewed.                                            |
| Dependency modernization | Recreate only after top release blockers are controlled.                                                      |
| Beyond Clean pilot       | Cannot start until RA-5615, RA-5624, security proof, owner evidence, and RA-4956 are green.                   |
| Elite / CRSA pilot       | Same as Beyond Clean; do not expand until the soft-pilot proof chain is complete.                             |
| Roadmap polish           | Any work not moving RA-5615, RA-5624, RA-2989, RA-3034, RA-3012, RA-5628, RA-5629, RA-5630, or RA-4956 waits. |

## Next Decision Points

| Decision                       | Make it when                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------- |
| Rerun pilot canary             | After RA-5615 secrets are present by name in GitHub Actions.                 |
| Rerun sandbox smoke            | After RA-5624 health returns `status=ok`.                                    |
| Change evidence files to pass  | After owner proof is current, dated, and attached.                           |
| Touch #1199                    | After a split plan or senior full-diff review is recorded.                   |
| Recreate dependency update PRs | After top release blockers are controlled and smoke remains green.           |
| Call ship-ready                | Only after strict gate returns 100/100 and no P0/P1 release blockers remain. |
