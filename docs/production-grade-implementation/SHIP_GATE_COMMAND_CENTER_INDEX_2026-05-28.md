# RestoreAssist Ship-Gate Command Center Index

Date: 2026-05-28
Last refreshed: 2026-05-28 11:56 AEST
Status: active release-recovery control set

## Start Here

| Question                                       | Open this                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| "What is the one-page handoff?"                | `SENIOR_PM_HANDOFF_BRIEF_2026-05-28.md`                                                                |
| "What PRs should Rana make next?"              | `RANA_FINAL_PR_PACKETS_2026-05-28.md`                                                                  |
| "What is done vs still remaining?"             | `DONE_VS_REMAINING_INVENTORY_2026-05-28.md`                                                            |
| "What are the release risks?"                  | `SHIP_GATE_RISK_REGISTER_2026-05-28.md`                                                                |
| "How do I report proof safely?"                | `OWNER_SAFE_EVIDENCE_TEMPLATES_2026-05-28.md`                                                          |
| "What should the swarm do in the next 48h?"    | `NEXT_48H_SHIP_GATE_EXECUTION_PLAN_2026-05-28.md`                                                      |
| "How do Linear, GitHub, and Vercel connect?"   | `LINEAR_GITHUB_VERCEL_TRACEABILITY_2026-05-28.md`                                                      |
| "What do I personally need to do next?"        | `PHILL_ACTION_BOARD_2026-05-28.md`                                                                     |
| "What is the full PM truth with evidence?"     | `SHIP_GATE_PM_DASHBOARD_2026-05-28.md`                                                                 |
| "How should the senior swarm divide the work?" | `SENIOR_PM_SWARM_OPERATING_MODEL_2026-05-28.md`                                                        |
| "How do we rerun the final gate cleanly?"      | `STRICT_GATE_RERUN_RUNBOOK_2026-05-28.md`                                                              |
| "Where is this represented in Linear?"         | https://linear.app/unite-group/document/restoreassist-ship-gate-command-center-2026-05-28-8eb616107bd5 |
| "What decides ship/no-ship?"                   | RA-4956 plus `pnpm tsx scripts/release-gate-score.ts --strict` at 100/100                              |

## Current Release Decision

No pilot yet.

Production is live and healthy, but current ship approval is not proven. The project needs the remaining proof chain closed before Beyond Clean / Elite / CRSA pilot rollout.

## Current Critical Path

| Order | Issue                       | Why it matters                                                                                 |
| ----- | --------------------------- | ---------------------------------------------------------------------------------------------- |
| 1     | RA-5615                     | Pilot tester canary cannot run real swarm until GitHub Actions secrets exist.                  |
| 2     | RA-5624                     | Sandbox is the release-gate smoke target; it is still degraded.                                |
| 3     | RA-2989 / RA-3034 / RA-3012 | Security exposure work has code hardening but not enough rotation/revocation/process evidence. |
| 4     | RA-5628                     | Owner evidence for billing, revenue, App Store, TestFlight, and monitoring is deferred.        |
| 5     | RA-5629                     | PR #1199 is too broad to merge or use as ship evidence without split/review.                   |
| 6     | RA-5630                     | Closed Dependabot #1204 must return only as smaller safe PRs.                                  |
| 7     | RA-4956                     | Strict release gate must pass 100/100 from a clean checkout.                                   |

## Artifact Map

| Artifact                                          | Role                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| `SHIP_GATE_COMMAND_CENTER_INDEX_2026-05-28.md`    | Navigation front door.                                                    |
| `RANA_FINAL_PR_PACKETS_2026-05-28.md`             | Finalized PR packets, file lists, bodies, and commit order for Rana.      |
| `SENIOR_PM_HANDOFF_BRIEF_2026-05-28.md`           | One-page operational handoff for the next work block.                     |
| `DONE_VS_REMAINING_INVENTORY_2026-05-28.md`       | Outcome inventory of accomplished work, remaining work, and proof needed. |
| `SHIP_GATE_RISK_REGISTER_2026-05-28.md`           | Ranked release risks, mitigations, and exit conditions.                   |
| `OWNER_SAFE_EVIDENCE_TEMPLATES_2026-05-28.md`     | Copy/paste-safe proof templates for open blocker issues.                  |
| `NEXT_48H_SHIP_GATE_EXECUTION_PLAN_2026-05-28.md` | Time-boxed execution plan for the senior-PM swarm.                        |
| `LINEAR_GITHUB_VERCEL_TRACEABILITY_2026-05-28.md` | Cross-system map from blockers to evidence and next proof.                |
| `PHILL_ACTION_BOARD_2026-05-28.md`                | Owner-facing checklist and critical path.                                 |
| `SHIP_GATE_PM_DASHBOARD_2026-05-28.md`            | Detailed evidence ledger across GitHub, Vercel, Linear, and local checks. |
| `SENIOR_PM_SWARM_OPERATING_MODEL_2026-05-28.md`   | Specialist lane map and operating rules.                                  |
| `STRICT_GATE_RERUN_RUNBOOK_2026-05-28.md`         | Clean rerun procedure for RA-4956 after blockers are green.               |
| `docs/evidence/release-gate/1.0.0/*.md`           | Release-gate owner evidence files read by the scorer.                     |
| `scripts/release-gate-score.ts`                   | Machine scorer for RA-4956.                                               |

## Fast State Checks

These commands show presence/status only. Do not print secret values.

```bash
gh pr list --repo CleanExpo/RestoreAssist --state open
gh run list --repo CleanExpo/RestoreAssist --limit 8
gh secret list --repo CleanExpo/RestoreAssist --app actions | rg 'PILOT_TESTER|DATABASE_URL|USER_POOL|^Name'
curl -fsS https://restoreassist.app/api/health
curl -fsS https://restoreassist-sandbox.vercel.app/api/health
```

## Operating Rule

If a new task does not directly move RA-5615, RA-5624, RA-2989, RA-3034, RA-3012, RA-5628, RA-5629, RA-5630, or RA-4956, it waits.
