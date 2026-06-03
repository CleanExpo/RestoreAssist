# RestoreAssist Phill Action Board

Date: 2026-05-28
Last refreshed: 2026-05-28 11:56 AEST
Index: `SHIP_GATE_COMMAND_CENTER_INDEX_2026-05-28.md`
Senior PM handoff: `SENIOR_PM_HANDOFF_BRIEF_2026-05-28.md`
Source of truth: `SHIP_GATE_PM_DASHBOARD_2026-05-28.md`
Strict gate runbook: `STRICT_GATE_RERUN_RUNBOOK_2026-05-28.md`
Linear command center: https://linear.app/unite-group/document/restoreassist-ship-gate-command-center-2026-05-28-8eb616107bd5
Swarm operating model: `SENIOR_PM_SWARM_OPERATING_MODEL_2026-05-28.md`

## Current Decision

Do not start or announce a production pilot yet.

Production is live and healthy, but the ship gate is still red. The remaining work is mostly owner-controlled configuration, security evidence, and release proof rather than broad feature building.

## Green Right Now

| Area                            | Evidence                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Production app                  | `https://restoreassist.app/api/health` returns `status=ok`, database ok, env ok.                                               |
| Main production smoke           | GitHub run `26549841376` passed on `main@10452554`; two prior main smoke runs also passed.                                     |
| Clean local machine gates       | Type-check, lint, prod audit, full Vitest, middleware tests, and billing/webhook tests passed on clean `origin/main@10452554`. |
| Smoke cancellation loop         | Fixed through PR #1201 / #1203.                                                                                                |
| Pilot canary harness dependency | The old `tough-cookie` failure is fixed; current canary failure is missing secrets/config.                                     |
| Reopen/signin recovery          | PR #1205 and #1206 shipped reopen route/UI and front-door redirects.                                                           |

## Do These In Order

| Order | Linear  | Owner action                                                                                                                                                                                                                                         | Done when                                                                                                                               |
| ----- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | RA-5615 | Add GitHub Actions secrets `PILOT_TESTER_USER_POOL_JSON` and `PILOT_TESTER_DATABASE_URL` using sandbox-only values.                                                                                                                                  | `Pilot tester canary` passes both `dry-run` and `swarm` on `main`.                                                                      |
| 2     | RA-5624 | In Vercel project `restoreassist-sandbox`, repair runtime env: verify `STRIPE_SECRET_KEY` is non-empty, add/repair `RESEND_API_KEY` and `XERO_WEBHOOK_KEY`, remove or exception `NODE_TLS_REJECT_UNAUTHORIZED`, then redeploy/current-alias sandbox. | `https://restoreassist-sandbox.vercel.app/api/health` returns `status=ok`, database ok, env ok.                                         |
| 3     | RA-2989 | Rotate/revoke the exposed credentials and reconcile 1Password/local/Vercel/Railway/GitHub/Linear/provider stores without printing values.                                                                                                            | Rotation log, revocation proof where available, downstream env refresh proof, and no-raw-secret audit note are attached.                |
| 4     | RA-3034 | Finish Supabase service-role incident closure. PR #247 removed the code fallback, but rotation/history/access-log proof is still missing.                                                                                                            | Service-role rotation proof, affected env refresh proof, git-history decision or exception, and Supabase access-log audit are attached. |
| 5     | RA-3012 | Prove `scripts/railway_check.sh` is adopted, not merely merged.                                                                                                                                                                                      | Fresh wrapper run proof shows masked output, and shell alias/pre-commit/docs prevent raw `railway variables` usage.                     |
| 6     | RA-5628 | Attach owner proof for billing flows, revenue reconciliation, App Store metadata, TestFlight stability, and Sentry/alerting.                                                                                                                         | Deferred evidence files `D1`, `D3`, `E1`, `E2`, and `F1` are changed to `status: pass` only where proof is current.                     |
| 7     | RA-5629 | Decide PR #1199: split into surgical PRs or get explicit senior-engineer full-diff sign-off.                                                                                                                                                         | #1199 is not used as ship approval unless RA-5629 acceptance is met.                                                                    |
| 8     | RA-5630 | Recreate closed Dependabot #1204 as smaller dependency PRs by lane.                                                                                                                                                                                  | Replacement PRs are small, green, reviewed, and merged one at a time after smoke remains healthy.                                       |
| 9     | RA-4956 | Rerun strict release gate from a clean checkout using `STRICT_GATE_RERUN_RUNBOOK_2026-05-28.md`.                                                                                                                                                     | `pnpm tsx scripts/release-gate-score.ts --strict` passes 100/100.                                                                       |

## Critical Path

This is the dependency chain. Work outside this chain should wait unless it directly removes one of these blockers.

```text
RA-5615 pilot canary secrets
  -> pilot canary passes on main

RA-5624 sandbox env and smoke path
  -> sandbox health ok
  -> sandbox smoke A1/B4 can run

RA-2989 + RA-3034 + RA-3012 security evidence
  -> no open security release blocker

RA-5628 owner evidence
  -> D1/D3/E1/E2/F1 evidence can count

RA-5629 PR #1199 decision
  -> broad Phase 2 work cannot accidentally become ship approval

RA-5630 dependency recreation
  -> dependency updates return as small, reviewable PRs

All of the above green
  -> rerun RA-4956 strict gate
  -> 100/100 required before pilot
```

## What Not To Do Yet

- Do not merge PR #1199 as-is.
- Do not revive Dependabot #1204 as one broad batch.
- Do not start Beyond Clean / Elite / CRSA pilot rollout.
- Do not paste secret values into GitHub, Linear, chat, screenshots, shell output, or logs.
- Do not treat Linear RA-4956 being historically Done as current ship approval.

## Fast Owner Checks

Use these checks to know whether owner actions landed. They reveal presence/status only, not secret values.

```bash
gh secret list --repo CleanExpo/RestoreAssist --app actions | rg 'PILOT_TESTER|DATABASE_URL|USER_POOL|^Name'
curl -fsS https://restoreassist.app/api/health
curl -fsS https://restoreassist-sandbox.vercel.app/api/health
vercel env ls production --scope unite-group | rg 'NODE_TLS_REJECT_UNAUTHORIZED|DATABASE_URL|DIRECT_URL|STRIPE_SECRET_KEY|RESEND_API_KEY|XERO_WEBHOOK_KEY|NEXT_PUBLIC_SUPABASE_URL'
```

For the sandbox project, run the Vercel env check from the sandbox-linked working directory:

```bash
vercel env ls production --scope unite-group --cwd /tmp/ra-vercel-sandbox-env | rg 'NODE_TLS_REJECT_UNAUTHORIZED|DATABASE_URL|DIRECT_URL|STRIPE_SECRET_KEY|RESEND_API_KEY|XERO_WEBHOOK_KEY|NEXT_PUBLIC_SUPABASE_URL'
```

## Senior PM Read

The product is not failing because the app is dead. The app is live. The release is blocked because the proof chain is not complete: canary secrets, sandbox runtime env, security rotation evidence, owner launch evidence, oversized PR risk, dependency batch risk, and strict gate evidence.

Once RA-5615 and RA-5624 are green, rerun the strict gate. If it still fails, fix only the next red gate item and rerun. No broad roadmap work should jump ahead of that loop.
