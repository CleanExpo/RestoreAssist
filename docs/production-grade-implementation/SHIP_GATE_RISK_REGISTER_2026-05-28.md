# RestoreAssist Ship-Gate Risk Register

Date: 2026-05-28
Last refreshed: 2026-05-28 12:08 AEST
Purpose: rank release risks across Linear, GitHub, Vercel, security, owner evidence, and ship-gate proof.

## Risk Posture

Overall posture: high until sandbox, canary, security evidence, owner evidence, and strict gate are green.

Production is currently healthy, but that lowers operational risk only. It does not clear release risk because pilot canary, sandbox, security, owner evidence, and strict-gate proof are still incomplete.

Owner reported credits were added on 2026-05-28. That reduces the credit-balance symptom in RA-2989, but it does not reduce the critical security risk until rotation, revocation, and store reconciliation evidence is attached.

## Active Release Risks

| ID  | Risk                                                                     | Severity | Likelihood | Trigger / evidence                                                                                                                                     | Owner lane                         | Mitigation                                                                                     | Exit condition                                                          |
| --- | ------------------------------------------------------------------------ | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| R1  | Real pilot canary cannot run, so synthetic pilot readiness is unproven.  | Critical | High       | RA-5615; GitHub Actions secrets list lacks canary secret names; run `26548257111` failed.                                                              | Canary / QA                        | Add sandbox-only canary secrets and rerun `Pilot tester canary` on `main`.                     | Passing canary run URL attached to RA-5615.                             |
| R2  | Sandbox is not a valid release-gate target.                              | Critical | High       | RA-5624; sandbox health returns `status=degraded`, missing runtime env names.                                                                          | DevOps / Vercel                    | Repair sandbox env, remove or formally exception TLS override, redeploy/current-alias sandbox. | Sandbox health returns `status=ok`, database ok, env ok.                |
| R3  | Security exposure is not proven closed.                                  | Critical | Medium     | RA-2989, RA-3034, RA-3012 still lack rotation/revocation/access-log/wrapper-adoption proof; owner-reported added credits do not prove secret rotation. | Security                           | Use owner-safe evidence templates to attach proof or formal exceptions.                        | Each security issue has dated proof or exception.                       |
| R4  | Manual owner evidence is incomplete, so the gate cannot score 100/100.   | High     | High       | RA-5628; `D1`, `D3`, `E1`, `E2`, and `F1` evidence files are deferred.                                                                                 | Owner Evidence                     | Gather owner proof and change only proven evidence files to `status: pass`.                    | RA-5628 evidence files pass with current proof.                         |
| R5  | A broad unreviewed PR enters the release path.                           | High     | Medium     | PR #1199 is green but 238 files and not safe as ship evidence.                                                                                         | GitHub Review                      | Hold, split, or require explicit senior full-diff sign-off.                                    | RA-5629 accepted: split PRs or senior sign-off recorded.                |
| R6  | Dependency churn destabilizes the gate.                                  | Medium   | Medium     | Closed #1204 mixed 29 packages and had dirty/red preview state.                                                                                        | Dependency Steward                 | Recreate dependency updates by lane after higher blockers are controlled.                      | Small green replacement PRs merged one at a time.                       |
| R7  | Historical Linear Done status is mistaken for current ship approval.     | Critical | Medium     | RA-4956 is Done historically, but current evidence is not 100/100.                                                                                     | Release Commander                  | Keep command center decision as no-pilot until strict rerun passes.                            | `pnpm tsx scripts/release-gate-score.ts --strict` returns 100/100.      |
| R8  | Production health creates false confidence while sandbox/canary are red. | High     | Medium     | Production health and smoke are green, but sandbox and canary are red.                                                                                 | Senior PM                          | Communicate green production as necessary but not sufficient.                                  | Stakeholders use the done-vs-remaining inventory before any go/no-go.   |
| R9  | Secret values leak during evidence collection.                           | Critical | Medium     | Remaining work requires env/security proof across GitHub, Vercel, Supabase, Railway, and owner stores.                                                 | Security / Owner                   | Use owner-safe evidence templates; paste names/status only.                                    | Proof is attached with no raw values in comments, screenshots, or logs. |
| R10 | Pilot starts before support/monitoring/business proof is complete.       | High     | Medium     | Owner launch evidence is deferred; monitoring and TestFlight proof not complete.                                                                       | Owner Evidence / Release Commander | Keep Beyond Clean / Elite / CRSA pilot on hold until evidence files pass.                      | RA-5628 green and RA-4956 strict gate 100/100.                          |

## Watch Risks

| Risk                                              | Watch signal                                                        | Action if triggered                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Production smoke regresses                        | Latest `Smoke - Production` on `main` fails or cancels.             | Stop release work, open/update blocker, restore smoke before more merges. |
| Production health degrades                        | `https://restoreassist.app/api/health` stops returning `status=ok`. | Treat as incident, not release planning.                                  |
| Supabase RLS evidence changes                     | Fresh advisor run contradicts RA-4970 Done evidence.                | Reopen RLS workstream and block RA-4956.                                  |
| #1199 changes scope further                       | File count or touched domains increase.                             | Refresh RA-5629 split plan and keep out of ship path.                     |
| Sandbox env listing disagrees with runtime health | Env names appear present but health says missing.                   | Trust runtime health; inspect Vercel target/scope and redeploy.           |

## Risk Burn-Down Order

1. R1 and R2 first: prove canary and sandbox.
2. R3 and R9 next: close security evidence safely.
3. R4 and R10 next: close owner launch evidence.
4. R5 and R6 next: contain GitHub/dependency change risk.
5. R7 and R8 last: run strict gate and communicate go/no-go using proof, not optimism.

## Decision Thresholds

| Decision                           | Required risk state                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| Continue recovery work             | Any risk open; no pilot.                                                        |
| Run strict gate as final proof     | R1-R6 and R9-R10 green or formally excepted.                                    |
| Start soft pilot                   | RA-4956 strict gate 100/100 and no open critical/high unexcepted release risks. |
| Expand pilot beyond first customer | Soft pilot monitoring stable for the agreed window and no new Sev1/Sev2 issues. |
