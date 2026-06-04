# RestoreAssist Senior PM Handoff Brief

Date: 2026-05-28
Last refreshed: 2026-05-28 11:59 AEST
Audience: non-coder owner, senior PM swarm, release commander
Source of truth: `SHIP_GATE_PM_DASHBOARD_2026-05-28.md`
Cross-system matrix: `LINEAR_GITHUB_VERCEL_TRACEABILITY_2026-05-28.md`
Done vs remaining: `DONE_VS_REMAINING_INVENTORY_2026-05-28.md`
Risk register: `SHIP_GATE_RISK_REGISTER_2026-05-28.md`
Evidence templates: `OWNER_SAFE_EVIDENCE_TEMPLATES_2026-05-28.md`
Next execution plan: `NEXT_48H_SHIP_GATE_EXECUTION_PLAN_2026-05-28.md`

## One-Line Decision

Do not start the pilot yet. Production is healthy, but the release proof chain is still red.

## What Is Working

| Area                         | Current evidence                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| Production health            | `https://restoreassist.app/api/health` returns `status=ok`, database ok, env ok.                  |
| Production smoke             | GitHub run `26549841376` passed on `main@10452554`; the two prior main smoke runs also passed.    |
| Main quality baseline        | Clean `origin/main@10452554` passed type-check, lint, prod audit, full Vitest, and focused tests. |
| Smoke cancellation loop      | Fixed through PR #1201 and #1203.                                                                 |
| Pilot harness dependency bug | The old `tough-cookie` failure is fixed; the current failure is missing canary secrets/config.    |
| Front-door/reopen recovery   | PR #1205 and #1206 shipped sign-in redirects, reopen route coverage, and terminal-job reopen UI.  |
| RLS release spine            | RA-4970 is Done in Linear unless a fresh Supabase advisor run contradicts the recorded evidence.  |

## What Is Still Blocking Ship Approval

| Rank | Issue                       | Owner lane         | Current evidence                                                                                           | Exact next action                                                                                                                    |
| ---- | --------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | RA-5615                     | Canary / QA        | GitHub Actions secret listing shows only generic `DATABASE_URL`; canary run `26548257111` still failed.    | Add sandbox-only `PILOT_TESTER_USER_POOL_JSON` and `PILOT_TESTER_DATABASE_URL`, then rerun `Pilot tester canary` on `main`.          |
| 2    | RA-5624                     | DevOps / Vercel    | Sandbox health is `status=degraded`; missing `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `XERO_WEBHOOK_KEY`.    | Repair sandbox runtime env, remove or formally exception `NODE_TLS_REJECT_UNAUTHORIZED`, redeploy/current-alias, verify health `ok`. |
| 3    | RA-2989 / RA-3034 / RA-3012 | Security           | Secret rotation, service-role closure, access-log review, and wrapper-adoption proof are still incomplete. | Attach rotation/revocation/access-log/wrapper proof or a formal dated exception to each issue.                                       |
| 4    | RA-5628                     | Owner Evidence     | `D1`, `D3`, `E1`, `E2`, and `F1` evidence files exist but are deferred/fail-closed.                        | Attach current owner proof, then change only proven files to `status: pass`.                                                         |
| 5    | RA-5629                     | GitHub Review      | PR #1199 is the only open PR, green but 238 files; CodeRabbit skipped full review earlier due size.        | Split #1199 into surgical PRs or get explicit senior-engineer full-diff sign-off before merge.                                       |
| 6    | RA-5630                     | Dependency Steward | Dependabot #1204 was closed unmerged after dirty/red preview state.                                        | Recreate dependency updates as small lane-specific PRs only after the release gate blockers are controlled.                          |
| 7    | RA-4956                     | Release Commander  | Gate exists, but strict current score is not 100/100 while the blockers above remain red.                  | After ranks 1-6 are green, run `STRICT_GATE_RERUN_RUNBOOK_2026-05-28.md` and require strict scorer 100/100.                          |

## Swarm Assignment

| Role                          | First work block                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Senior PM / Release Commander | Keep the team on the ranked blocker list; reject roadmap work until the first six blockers are controlled.      |
| DevOps / Vercel Lead          | Own RA-5624 from Vercel env repair through sandbox health `status=ok`.                                          |
| Canary / QA Lead              | Own RA-5615 from GitHub secret presence through a passing real canary run on `main`.                            |
| Security Lead                 | Own RA-2989, RA-3034, and RA-3012 proof; do not let code hardening substitute for rotation/revocation evidence. |
| Owner Evidence Lead           | Convert RA-5628 evidence from deferred to pass only when proof is current and traceable.                        |
| GitHub Review Lead            | Keep #1199 out of the ship path until split or senior-reviewed.                                                 |
| Dependency Steward            | Keep dependency updates out of the ship path until recreated as small, reviewable PRs.                          |

## Phill's Immediate Checklist

1. Add the two GitHub Actions secrets for RA-5615 using sandbox-only values.
2. Repair sandbox Vercel production env for RA-5624 and remove or formally exception `NODE_TLS_REJECT_UNAUTHORIZED`.
3. Attach security evidence for RA-2989, RA-3034, and RA-3012 without exposing values.
4. Attach owner evidence for RA-5628, then update evidence files only where proof is complete.
5. Keep PR #1199 on hold until the split/senior-review decision is recorded.
6. Use `STRICT_GATE_RERUN_RUNBOOK_2026-05-28.md` only after the blockers above are green.

## What Not To Do

- Do not start Beyond Clean / Elite / CRSA pilot rollout.
- Do not call RA-4956 Done as current ship approval.
- Do not merge #1199 as-is.
- Do not revive Dependabot #1204 as one broad PR.
- Do not paste secret values into GitHub, Linear, chat, screenshots, shell output, or logs.

## Fast Status Checks

These commands show status or presence only.

```bash
gh run list --repo CleanExpo/RestoreAssist --limit 10
gh pr list --repo CleanExpo/RestoreAssist --state open
gh secret list --repo CleanExpo/RestoreAssist --app actions | rg 'PILOT_TESTER|DATABASE_URL|USER_POOL|^Name'
curl -fsS https://restoreassist.app/api/health
curl -fsS https://restoreassist-sandbox.vercel.app/api/health
```

## Gate Rule

The first green ship decision can only happen after:

- Real pilot tester canary passes on `main`.
- Sandbox health is `status=ok`.
- Security evidence is closed or formally excepted.
- Owner evidence files are `status: pass` only where proof is current.
- #1199 and dependency update risk are outside the release path.
- `pnpm tsx scripts/release-gate-score.ts --strict` returns 100/100 from a clean checkout.
