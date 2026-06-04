# RestoreAssist Next 48 Hours Ship-Gate Execution Plan

Date: 2026-05-28
Last refreshed: 2026-05-28 12:02 AEST
Purpose: turn the command-center evidence into a short execution plan for the next senior-PM swarm work block.
Risk register: `SHIP_GATE_RISK_REGISTER_2026-05-28.md`
Evidence templates: `OWNER_SAFE_EVIDENCE_TEMPLATES_2026-05-28.md`

## Release Decision For This Window

No pilot in the next work block unless every gate below flips green and RA-4956 scores 100/100 from a clean checkout.

Production is live and healthy. The next 48 hours should focus on proof-chain closure, not roadmap expansion.

## Success Criteria For This Plan

The work block is successful when:

- RA-5615 real canary passes on `main`.
- RA-5624 sandbox health returns `status=ok`.
- RA-2989, RA-3034, and RA-3012 have rotation/revocation/access-log/wrapper proof or formal exceptions.
- RA-5628 owner evidence files are `status: pass` only where current proof exists.
- PR #1199 is split or explicitly senior-reviewed before merge.
- Dependency update work is kept out of the release path until recreated as smaller PRs.
- RA-4956 strict gate is rerun from a clean checkout and returns 100/100.

## Work Block 1 - First 2 Hours

| Owner lane      | Linear  | Task                                                                                                                | Proof to attach                                                                                          |
| --------------- | ------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Canary / QA     | RA-5615 | Add sandbox-only `PILOT_TESTER_USER_POOL_JSON` and `PILOT_TESTER_DATABASE_URL` to GitHub Actions secrets.           | Presence-only secret list showing the two names, then a passing `Pilot tester canary` run URL on `main`. |
| DevOps / Vercel | RA-5624 | Repair sandbox runtime env for `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, and `XERO_WEBHOOK_KEY`.                       | `https://restoreassist-sandbox.vercel.app/api/health` returning `status=ok`, database ok, env ok.        |
| DevOps / Vercel | RA-5624 | Remove `NODE_TLS_REJECT_UNAUTHORIZED` from sandbox production env or attach formal exception with owner and expiry. | Vercel env-name listing without the key, or dated exception comment on RA-5624.                          |
| Release PM      | RA-4956 | Keep production smoke visible while owner/config changes happen.                                                    | Latest `Smoke - Production` run remains green on `main@10452554` or newer.                               |

Stop condition: if RA-5615 secrets cannot be provided safely or sandbox env cannot be repaired without exposing secret values, stop and log the exact owner action needed. Do not paste values.

## Work Block 2 - Same Day

| Owner lane      | Linear  | Task                                                                      | Proof to attach                                                                                                  |
| --------------- | ------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Security        | RA-2989 | Prove exposed credential rotation/revocation and downstream env refresh.  | Rotation log by credential name, revocation proof where available, downstream refresh proof, no-raw-secret note. |
| Security        | RA-3034 | Close Supabase service-role exposure evidence gap.                        | Service-role rotation proof, affected env refresh proof, git-history decision/exception, access-log audit note.  |
| Security        | RA-3012 | Prove `railway_check.sh` adoption and raw-command prevention.             | Masked wrapper run proof plus shell alias, pre-commit hook, or documented prohibition.                           |
| Owner Evidence  | RA-5628 | Gather evidence for `D1`, `D3`, `E1`, `E2`, and `F1`.                     | Dated proof links or screenshots summarized without secrets; update only proven files to `status: pass`.         |
| GitHub Review   | RA-5629 | Keep #1199 out of the ship path.                                          | GitHub comment or Linear note confirming split plan or senior full-diff review requirement.                      |
| Dependency Lead | RA-5630 | Do not recreate dependency PRs until top release blockers are controlled. | If work starts, open small PRs by lane with filled templates and targeted tests.                                 |

Stop condition: if evidence is not current or owner-verifiable, keep the evidence file deferred. A missing proof item is a red gate, not a judgement call.

## Work Block 3 - Final Gate Attempt

Only start this block after Work Blocks 1 and 2 are green or formally excepted.

| Step | Command / action                                                                    | Expected result                                              |
| ---- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1    | Open `STRICT_GATE_RERUN_RUNBOOK_2026-05-28.md`.                                     | Preconditions match current state.                           |
| 2    | Create a fresh worktree from current `origin/main`.                                 | No dirty local work affects the result.                      |
| 3    | Run the local verification sequence from the runbook.                               | Type-check, lint, unit tests, focused tests, and audit pass. |
| 4    | Run `pnpm test:smoke:sandbox`.                                                      | Sandbox smoke passes without hanging.                        |
| 5    | Run `pnpm tsx scripts/release-gate-score.ts --strict`.                              | Score is 100/100.                                            |
| 6    | Attach results to RA-4956, update the PM dashboard, and make the go/no-go decision. | Evidence is dated, linked, and contains no secret values.    |

## Communication Cadence

| Moment              | Update                                                              |
| ------------------- | ------------------------------------------------------------------- |
| Start of block      | Confirm no-pilot decision, ranked blockers, and owner assignments.  |
| After RA-5615 move  | Post canary secret presence and run result to RA-5615.              |
| After RA-5624 move  | Post sandbox health and TLS/env decision to RA-5624.                |
| After security move | Post evidence or formal exception to RA-2989, RA-3034, and RA-3012. |
| After owner proof   | Post which evidence files changed to `status: pass` and why.        |
| Before any pilot    | Post RA-4956 strict 100/100 result and explicit go/no-go note.      |

## Fast Commands

These commands show status or presence only.

```bash
gh run list --repo CleanExpo/RestoreAssist --limit 8
gh pr list --repo CleanExpo/RestoreAssist --state open
gh secret list --repo CleanExpo/RestoreAssist --app actions | rg 'PILOT_TESTER|DATABASE_URL|USER_POOL|^Name'
curl -fsS https://restoreassist.app/api/health
curl -fsS https://restoreassist-sandbox.vercel.app/api/health
```

## PM Guardrails

- Keep RA-5615 and RA-5624 ahead of roadmap work.
- Do not let green production smoke hide red sandbox/canary evidence.
- Do not use #1199 as ship evidence while it remains broad.
- Do not change deferred owner evidence to pass without current proof.
- Do not paste secret values anywhere.
