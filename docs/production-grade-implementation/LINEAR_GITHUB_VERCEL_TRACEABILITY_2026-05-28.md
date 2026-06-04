# RestoreAssist Linear/GitHub/Vercel Traceability Matrix

Date: 2026-05-28
Last refreshed: 2026-05-28 12:01 AEST
Purpose: connect each ship-gate blocker to its live Linear owner, GitHub evidence, Vercel/runtime evidence, repo evidence, and next proof required.

## Current Decision

Do not start the pilot. Production is live and healthy, but ship approval is still fail-closed until the red rows below are resolved and RA-4956 scores 100/100 from a clean checkout.

## Cross-System Matrix

| Status | Linear issue              | Owner lane         | GitHub evidence                                                                                                 | Vercel/runtime evidence                                                                                      | Repo evidence                                                                                                   | Next proof required                                                                                                                    |
| ------ | ------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Green  | Production smoke baseline | Release Commander  | `Smoke - Production` run `26549841376` passed on `main@10452554`; two prior smoke runs passed.                  | `https://restoreassist.app/api/health` returns `status=ok`, database ok, env ok.                             | PM dashboard records clean `origin/main@10452554` type-check, lint, prod audit, full Vitest, and focused tests. | Keep monitoring; rerun after any release-path change.                                                                                  |
| Red    | RA-5615                   | Canary / QA        | `Pilot tester canary` run `26548257111` failed on `main@10452554`; Actions secrets list lacks the canary names. | Canary targets sandbox; cannot prove real swarm until secrets exist.                                         | `SENIOR_PM_HANDOFF_BRIEF_2026-05-28.md` and action board rank this as blocker 1.                                | Add sandbox-only `PILOT_TESTER_USER_POOL_JSON` and `PILOT_TESTER_DATABASE_URL`, rerun canary, attach passing run URL.                  |
| Red    | RA-5624                   | DevOps / Vercel    | No passing sandbox smoke/strict gate evidence on current main.                                                  | Sandbox health returns `status=degraded`; missing `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `XERO_WEBHOOK_KEY`. | `STRICT_GATE_RERUN_RUNBOOK_2026-05-28.md` requires sandbox health ok before ship-approval rerun.                | Repair sandbox env, remove or exception `NODE_TLS_REJECT_UNAUTHORIZED`, redeploy/current-alias, prove sandbox health `status=ok`.      |
| Red    | RA-2989                   | Security           | No current GitHub proof attached that all exposed credentials were rotated/revoked.                             | Downstream env refresh proof is missing.                                                                     | PM dashboard lists rotation/revocation evidence as required before pilot.                                       | Attach rotation log, revocation proof where possible, downstream env refresh proof, and final no-raw-secret audit note.                |
| Red    | RA-3034                   | Security           | Pi-Dev-Ops code hardening landed, but service-role rotation/history/access-log proof is missing.                | Supabase access-log review and affected env refresh proof are missing.                                       | PM dashboard marks code hardening as partial and evidence closure as incomplete.                                | Attach service-role rotation proof, affected env refresh proof, git-history decision/exception, and Supabase access-log audit summary. |
| Red    | RA-3012                   | Security           | Wrapper code exists in Pi-Dev-Ops evidence, but adoption proof is missing.                                      | Not a Vercel runtime issue; it is process hardening for secret-safe ops.                                     | PM dashboard requires wrapper run proof plus muscle-memory prevention/docs.                                     | Attach fresh masked wrapper run proof and prevention mechanism such as alias, hook, or documented prohibition.                         |
| Red    | RA-5628                   | Owner Evidence     | No GitHub run can satisfy the manual owner evidence without current proof files marked pass.                    | Billing/App Store/TestFlight/monitoring proof comes from owner systems, not Vercel health.                   | `D1`, `D3`, `E1`, `E2`, and `F1` evidence files exist but remain deferred/fail-closed.                          | Attach current proof and change only proven evidence files to `status: pass`.                                                          |
| Amber  | RA-5629                   | GitHub Review      | PR #1199 is open, green, non-draft, clean, but 238 files and previously too large for full automated review.    | Vercel preview state is not ship approval for this broad PR.                                                 | Handoff and action board say #1199 must not be used as ship approval.                                           | Split #1199 into surgical PRs or record explicit senior-engineer full-diff sign-off before merge.                                      |
| Amber  | RA-5630                   | Dependency Steward | Dependabot #1204 is closed unmerged after dirty/red preview state.                                              | Prior broad dependency batch had red Vercel previews.                                                        | PM dashboard and action board require smaller dependency lanes.                                                 | Recreate dependency updates as small PRs after the top release blockers are controlled.                                                |
| Red    | RA-4956                   | Release Commander  | Current GitHub checks are not enough: pilot canary is still red and strict scorer is not 100/100.               | Production health is green, but sandbox health is red.                                                       | `scripts/release-gate-score.ts` and evidence files fail closed until all required proof exists.                 | After all red/amber release rows are controlled, run `STRICT_GATE_RERUN_RUNBOOK_2026-05-28.md` and require strict score 100/100.       |

## What Counts As Evidence

| System | Counts                                                                                                  | Does not count                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Linear | Current issue status, attached proof, dated comments, explicit exception with owner and expiry.         | Historical Done status that no longer matches live evidence.                                    |
| GitHub | Passing run URL, PR with reviewable scope, filled PR template, targeted tests, passing required checks. | Broad green PRs with skipped review, stale runs, or checks from a different branch/commit.      |
| Vercel | Health endpoint `status=ok`, deployment `READY`, env-name presence audit with no secret values.         | Env name presence alone when runtime health still says the value is missing.                    |
| Repo   | Versioned docs, evidence frontmatter `status: pass`, scorer output, tests on clean `origin/main`.       | Deferred evidence files, stale local generated output, or reports not reconciled to live state. |

## Operating Sequence

1. RA-5615 and RA-5624 first: canary and sandbox are the live release-gate nervous system.
2. Security evidence next: RA-2989, RA-3034, and RA-3012 must close or carry formal exceptions.
3. Owner evidence next: RA-5628 evidence files can pass only with dated proof.
4. GitHub risk control next: keep #1199 and dependency updates outside the ship path until split/reviewed.
5. RA-4956 last: strict gate rerun is a final proof step, not a debugging substitute.

## Quick Refresh Commands

These commands show status and presence only.

```bash
gh pr list --repo CleanExpo/RestoreAssist --state open
gh run list --repo CleanExpo/RestoreAssist --limit 8
gh secret list --repo CleanExpo/RestoreAssist --app actions | rg 'PILOT_TESTER|DATABASE_URL|USER_POOL|^Name'
curl -fsS https://restoreassist.app/api/health
curl -fsS https://restoreassist-sandbox.vercel.app/api/health
```
