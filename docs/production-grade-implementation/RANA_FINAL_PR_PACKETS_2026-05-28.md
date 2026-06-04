# RestoreAssist Final PR Packets For Rana

Date: 2026-05-28
Prepared for: Rana
Purpose: split the current ship-gate recovery work into reviewable PRs that can be committed to `main` without pulling in the unrelated dirty tree.

## Merge Order

1. PR-1: Ship-gate PM command center.
2. PR-2: Deferred release-gate owner evidence files.

Do not include unrelated modified docs, app code, vendor files, or generated artifacts in either PR.

## PR-1 - Ship-Gate PM Command Center

Branch:

```bash
codex/ra-ship-gate-command-center
```

Title:

```text
docs(release): add ship-gate PM command center
```

Files to include:

```text
docs/production-grade-implementation/SHIP_GATE_PM_DASHBOARD_2026-05-28.md
docs/production-grade-implementation/SHIP_GATE_COMMAND_CENTER_INDEX_2026-05-28.md
docs/production-grade-implementation/SENIOR_PM_HANDOFF_BRIEF_2026-05-28.md
docs/production-grade-implementation/DONE_VS_REMAINING_INVENTORY_2026-05-28.md
docs/production-grade-implementation/SHIP_GATE_RISK_REGISTER_2026-05-28.md
docs/production-grade-implementation/OWNER_SAFE_EVIDENCE_TEMPLATES_2026-05-28.md
docs/production-grade-implementation/NEXT_48H_SHIP_GATE_EXECUTION_PLAN_2026-05-28.md
docs/production-grade-implementation/LINEAR_GITHUB_VERCEL_TRACEABILITY_2026-05-28.md
docs/production-grade-implementation/SENIOR_PM_SWARM_OPERATING_MODEL_2026-05-28.md
docs/production-grade-implementation/STRICT_GATE_RERUN_RUNBOOK_2026-05-28.md
```

Do not include:

```text
docs/production-grade-implementation/AI_STACK_RECOMMENDATIONS.md
docs/production-grade-implementation/COMPETITOR_RESEARCH.md
docs/production-grade-implementation/COST_OPTIMIZATION_PLAN.md
docs/production-grade-implementation/EXECUTION_BACKLOG.md
docs/production-grade-implementation/GAP_ANALYSIS.md
docs/production-grade-implementation/IMPLEMENTATION_ROADMAP.md
docs/production-grade-implementation/PHASE_*.md
docs/production-grade-implementation/SHIPIT_PLAN.md
docs/production-grade-implementation/SYSTEM_ARCHITECTURE.md
docs/production-grade-implementation/TECH_DEBT_REPORT.md
docs/production-grade-implementation/UX_REDESIGN.md
docs/production-grade-implementation/CHECKOUT_STATE_REPORT.md
```

PR body:

```md
## Summary

Adds the RestoreAssist ship-gate PM command center for current release recovery.

This PR creates the owner/senior-PM operating layer around the current verified state:

- production is live and healthy,
- production smoke is green,
- sandbox health remains degraded,
- pilot canary remains blocked by missing GitHub Actions secrets,
- #1199 is held as a broad Phase 2 readiness artifact, not ship approval,
- RA-4956 is the historical gate implementation, not current go-live approval.

## Added artifacts

- Command-center index and front door.
- One-page senior PM handoff brief.
- Done-vs-remaining inventory.
- Release risk register.
- Owner-safe evidence templates.
- Next 48h execution plan.
- Linear/GitHub/Vercel traceability matrix.
- Senior PM swarm operating model.
- Strict gate rerun runbook.
- Updated PM dashboard.

## Release decision

No pilot yet.

The app is live, but ship approval remains fail-closed until RA-5615, RA-5624, RA-2989, RA-3034, RA-3012, RA-5628, RA-5629, RA-5630, and RA-4956 are proven green or formally excepted.

## Verification

- `git diff --check -- <included files>`
- `LC_ALL=C rg -n "[^\\x00-\\x7F]" <included files>` returned no matches

Docs-only change. No runtime code changed.

## Reviewer notes

Please confirm:

- the command center does not overclaim ship readiness,
- no secret values are included,
- the no-pilot decision is clear,
- the next owner actions are actionable for a non-coder.
```

Recommended local commands:

```bash
git switch -c codex/ra-ship-gate-command-center origin/main
git add \
  docs/production-grade-implementation/SHIP_GATE_PM_DASHBOARD_2026-05-28.md \
  docs/production-grade-implementation/SHIP_GATE_COMMAND_CENTER_INDEX_2026-05-28.md \
  docs/production-grade-implementation/SENIOR_PM_HANDOFF_BRIEF_2026-05-28.md \
  docs/production-grade-implementation/DONE_VS_REMAINING_INVENTORY_2026-05-28.md \
  docs/production-grade-implementation/SHIP_GATE_RISK_REGISTER_2026-05-28.md \
  docs/production-grade-implementation/OWNER_SAFE_EVIDENCE_TEMPLATES_2026-05-28.md \
  docs/production-grade-implementation/NEXT_48H_SHIP_GATE_EXECUTION_PLAN_2026-05-28.md \
  docs/production-grade-implementation/LINEAR_GITHUB_VERCEL_TRACEABILITY_2026-05-28.md \
  docs/production-grade-implementation/SENIOR_PM_SWARM_OPERATING_MODEL_2026-05-28.md \
  docs/production-grade-implementation/STRICT_GATE_RERUN_RUNBOOK_2026-05-28.md
git diff --cached --check
git commit -m "docs(release): add ship-gate PM command center"
git push -u origin codex/ra-ship-gate-command-center
```

## PR-2 - Deferred Release-Gate Owner Evidence Files

Branch:

```bash
codex/ra5628-release-gate-owner-evidence-files
```

Title:

```text
docs(release-gate): add deferred owner evidence files
```

Files to include:

```text
docs/evidence/release-gate/1.0.0/D1-billing-flows.md
docs/evidence/release-gate/1.0.0/D3-revenue-reconciliation.md
docs/evidence/release-gate/1.0.0/E1-app-store-metadata.md
docs/evidence/release-gate/1.0.0/E2-testflight-stability.md
docs/evidence/release-gate/1.0.0/F1-monitoring-alerting.md
```

Do not include unless Rana separately reviews them:

```text
docs/evidence/release-gate/1.0.0/A3-no-sev1-sev2-open.md
docs/evidence/release-gate/1.0.0/C2-secrets-scan.md
docs/evidence/release-gate/1.0.0/F2-runbooks-sla.md
docs/evidence/release-gate/1.0.0/README.md
```

PR body:

```md
## Summary

Adds the missing RA-5628 release-gate owner evidence files as fail-closed deferred criteria.

The files intentionally use `status: deferred`, not `status: pass`, because current owner proof is not yet attached for:

- D1 billing flows,
- D3 revenue reconciliation,
- E1 App Store metadata,
- E2 TestFlight stability,
- F1 monitoring and alerting.

## Release decision

This PR does not make the release gate green.

It makes the missing owner-evidence requirements explicit and fail-closed so the scorer and PM process cannot accidentally treat missing proof as pass.

## Verification

- `git diff --check -- <included files>`
- `LC_ALL=C rg -n "[^\\x00-\\x7F]" <included files>` returned no matches

Docs-only release-gate evidence change. No runtime code changed.

## Reviewer notes

Please confirm:

- each file remains `status: deferred`,
- each criterion has clear required proof to mark PASS,
- no private customer data or secret values are included,
- RA-5628 remains open until owner proof is attached.
```

Recommended local commands:

```bash
git switch -c codex/ra5628-release-gate-owner-evidence-files origin/main
git add \
  docs/evidence/release-gate/1.0.0/D1-billing-flows.md \
  docs/evidence/release-gate/1.0.0/D3-revenue-reconciliation.md \
  docs/evidence/release-gate/1.0.0/E1-app-store-metadata.md \
  docs/evidence/release-gate/1.0.0/E2-testflight-stability.md \
  docs/evidence/release-gate/1.0.0/F1-monitoring-alerting.md
git diff --cached --check
git commit -m "docs(release-gate): add deferred owner evidence files"
git push -u origin codex/ra5628-release-gate-owner-evidence-files
```

## After These PRs Merge

Rana should not start pilot from these docs alone.

Next operational work remains:

1. RA-5615: add pilot canary GitHub Actions secrets and rerun canary.
2. RA-5624: repair sandbox Vercel env and confirm sandbox health `status=ok`.
3. RA-2989 / RA-3034 / RA-3012: attach security closure evidence or formal exceptions.
4. RA-5628: replace deferred owner evidence with current proof and `status: pass` only where complete.
5. RA-5629: split or senior-review #1199.
6. RA-5630: recreate dependency updates as smaller PRs after top blockers are controlled.
7. RA-4956: run strict gate from a clean checkout and require 100/100.
