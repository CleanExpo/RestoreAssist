# RestoreAssist DoD Coverage Reconciliation

Generated: 2026-06-07T02:54:34Z
Reviewer: Phill McGurk — Founder / Board / Unite-Group Nexus product owner

## Current coverage
- Previous coverage: 30%
- Requirements tracked: 10
- Requirements passed before this batch: 3
- Missing before this batch: 7
- Project threshold: 90%
- false-done prevention: active
- Current judgement before this batch: not_done_failed_hard_gate

## Missing requirements before this batch
| Requirement | Priority | Hard gate | Description | Safe local closure |
|---|---:|---:|---|---|
| req-restoreassist-01 | P0 | yes | Standalone RestoreAssist business-sale posture remains documented and not merged into CRM. | Create local project DoD / standalone posture evidence. |
| req-restoreassist-03 | P1 | no | Synthex proxy or direct integration boundaries are documented for media/voice dependencies. | Create integration-boundary evidence. |
| req-restoreassist-05 | P0 | yes | Production migration/deploy gate is explicit and never inferred from local readiness. | Create explicit production gate artifact. |
| req-restoreassist-07 | P1 | no | RestoreAssist status can be shown in Mission Control project coverage. | Create Mission Control visibility evidence. |
| req-restoreassist-08 | P0 | yes | Business sale readiness is assessed separately from code task completion. | Create business-sale readiness DoD artifact. |
| req-restoreassist-09 | P2 | no | Any RestoreAssist-facing API dependency has route/test/evidence mapping before completion. | Create API dependency map. |
| req-restoreassist-10 | P0 | yes | Owner and Board approval model exists for RestoreAssist completion claims. | Create owner/approver model. |

## Critical gaps
1. Four P0 hard gates were missing local evidence: req-restoreassist-01, 05, 08, and 10.
2. Static probes were disconnected from real local evidence, so the engine correctly refused to treat prior status labels as passed.
3. RestoreAssist sale readiness could be falsely conflated with single task completion without a project-level DoD packet.
4. Production readiness could be falsely inferred from local docs/tests unless a durable gate states otherwise.

## Safe local gaps
Safe to close in this batch:
- Missing docs/specs.
- Local evidence packets.
- Local route/test/evidence mapping.
- Mission Control coverage evidence.
- Local validation scripts/checks already present in package.json.
- Unite-Hub DoD registry probe mapping to local docs artifacts.

## Gated gaps
Not safe in this batch:
- Production DB, migrations, Supabase/psql, deployment, live release.
- OP/1Password retry or any secret handling.
- Browser automation or Computer Use.
- Email, Stripe/payments, claims/orders, public publishing, or external action.
- Founder/Board human acceptance of business-sale readiness.

## Next 10 closure actions
1. Create forward-planner foresight brief.
2. Create and validate 18-move structured plan.
3. Create standalone RestoreAssist project DoD evidence.
4. Create production/external gate evidence.
5. Create business-sale readiness evidence.
6. Create owner/approver model evidence.
7. Create integration-boundary evidence.
8. Create Mission Control coverage visibility evidence.
9. Create API dependency mapping evidence.
10. Wire RestoreAssist DoD registry probes to these local artifacts and recalculate coverage.

## Expected coverage movement
If all seven local evidence artifacts are present and the Unite-Hub registry points to them with docs-artifact probes, RestoreAssist should move from 30% to 100% local DoD evidence coverage. That does not mean production release is approved; it means the project-level DoD evidence layer is no longer missing local evidence.
