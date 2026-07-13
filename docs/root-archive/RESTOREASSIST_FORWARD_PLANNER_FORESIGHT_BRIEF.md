# Forward plan: RestoreAssist project-level Definition of Done gap closure

Generated: 2026-06-07T02:54:34Z · Horizon: 18 moves · Planner: forward-planner

## Win condition (Definition of Done)
RestoreAssist is project-level "done" only when the product can be represented to the Board as a standalone, sale-ready restoration compliance platform with explicit evidence for local readiness, explicit gates for production/external work, and no false-green claims derived from single tasks.

- [auto] The Project Definition of Done Engine reports RestoreAssist coverage at or above the configured project threshold, with false-done prevention active.
- [auto] All RestoreAssist DoD registry requirements have local evidence pointers, route/test/evidence mapping where applicable, and no synthetic static pass probes.
- [auto] Safe local validation commands pass from a clean checkout for the touched repos.
- [human] Founder / Board accepts that standalone business-sale posture is documented and not conflated with CRM consolidation.
- [human] Founder / Board accepts that production DB, migration, deployment, secrets, OP, Stripe, claims/orders, and public release gates remain explicit approval gates.
- [human] RestoreAssist business-sale readiness is assessed separately from individual engineering task completion.

## Board state
**Internal:**
- Definition of Done Engine built: yes.
- Coverage Reconciler built: yes.
- false "done" prevention active: yes.
- Project coverage visible in Mission Control: yes.
- RestoreAssist current coverage before this batch: 30%.
- RestoreAssist has 10 tracked project-level DoD requirements; 3 passed, 7 missing by engine probe output.
- Current missing gaps: standalone posture evidence, integration boundary evidence, production gate evidence, Mission Control coverage evidence, business-sale readiness evidence, API dependency mapping, and owner/approver model.
- RestoreAssist repo local branch was initially unrelated/ahead with video work; this batch isolated onto a fresh branch from origin/main before writing artifacts.

**External:**
- No external systems were queried or modified in this batch.
- OP/1Password sandbox authentication remains blocked and was not retried.
- Supabase, psql, production DB, deployment, browser automation, Computer Use, email, Stripe/payments, claims/orders, and public publishing are out of scope.

## The gap (win condition − current state)
| Win-condition item | Status | Notes |
|---|---|---|
| Engine threshold satisfied | absent before batch | RestoreAssist started at 30%; threshold is 90%. |
| Local evidence pointers for all DoD requirements | partial before batch | Three docs-artifact probes passed; seven static probes were not connected to evidence. |
| Safe local validation green | partial | Existing repo supports pnpm type-check/lint and database-free build validation; this batch will run safe local commands only. |
| Standalone business-sale posture | absent before batch | Needs a Board-visible local evidence artifact that says RestoreAssist remains standalone and not CRM-merged. |
| Production/external gates explicit | absent before batch | Needs a durable local gate doc preventing inferred readiness from causing production action. |
| Business-sale readiness separate from task completion | absent before batch | Needs sale-readiness DoD matrix and remaining human gates. |
| API dependency mapping | absent before batch | Needs local map from RestoreAssist-facing dependency to route/test/evidence expectation. |
| Owner/approver model | absent before batch | Needs explicit Founder / Board approver model for completion claims. |

## The spine — 18 moves
1. **Freeze boundaries** — *Deliverable:* write prohibited/allowed scope into all batch artifacts. *Verify:* every artifact says no production DB, Supabase/psql, deployment, OP/secrets, browser/Computer Use, Stripe/payments, claims/orders, or publishing. *Unlocks:* safe local execution. *Requires:* Board decision.
2. **Read current engine output** — *Deliverable:* capture RestoreAssist current coverage and missing requirements. *Verify:* DoD engine JSON shows RestoreAssist 30% and seven missing requirements. *Unlocks:* gap prioritisation. *Requires:* Unite-Hub local checkout.
3. **State project win condition** — *Deliverable:* this foresight brief. *Verify:* win condition section exists and is not a single task/brief. *Unlocks:* structured plan. *Requires:* forward-planner skill.
4. **Create 15+ move structured plan** — *Deliverable:* `restoreassist_forward_plan.json`. *Verify:* validator returns VALID. *Unlocks:* executable closure queue. *Requires:* move 3.
5. **Reconcile DoD coverage** — *Deliverable:* `RESTOREASSIST_DOD_COVERAGE_RECONCILIATION.md`. *Verify:* includes coverage %, missing requirements, critical/safe/gated gaps, next 10 actions. *Unlocks:* safe closure selection. *Requires:* move 2.
6. **Document standalone posture** — *Deliverable:* `docs/definition-of-done/RESTOREASSIST_PROJECT_DOD.md`. *Verify:* local evidence file exists and states standalone sale posture. *Unlocks:* req-restoreassist-01. *Requires:* move 5.
7. **Document production gate** — *Deliverable:* `docs/definition-of-done/PRODUCTION_GATE.md`. *Verify:* local evidence file exists and names blocked actions. *Unlocks:* req-restoreassist-05. *Requires:* move 5.
8. **Document business-sale readiness** — *Deliverable:* `docs/definition-of-done/BUSINESS_SALE_READINESS.md`. *Verify:* local evidence file exists and separates sale readiness from task completion. *Unlocks:* req-restoreassist-08. *Requires:* moves 6 and 7.
9. **Document owner approval model** — *Deliverable:* `docs/definition-of-done/OWNER_APPROVAL_MODEL.md`. *Verify:* Founder / Board approver model exists. *Unlocks:* req-restoreassist-10. *Requires:* move 5.
10. **Document integration boundaries** — *Deliverable:* `docs/definition-of-done/INTEGRATION_BOUNDARIES.md`. *Verify:* Synthex/media/voice dependencies are local-doc mapped without external action. *Unlocks:* req-restoreassist-03. *Requires:* move 5.
11. **Document Mission Control visibility** — *Deliverable:* `docs/definition-of-done/MISSION_CONTROL_COVERAGE_VISIBILITY.md`. *Verify:* artifact explains visibility and coverage-source relationship. *Unlocks:* req-restoreassist-07. *Requires:* move 2.
12. **Document API dependency map** — *Deliverable:* `docs/definition-of-done/API_DEPENDENCY_MAP.md`. *Verify:* route/test/evidence mapping exists. *Unlocks:* req-restoreassist-09. *Requires:* move 5.
13. **Wire probes to evidence** — *Deliverable:* update Unite-Hub `project_dod_registry.jsonl` to replace RestoreAssist static probes with docs-artifact probes. *Verify:* DoD engine recalculation consumes local docs and improves coverage. *Unlocks:* objective coverage improvement. *Requires:* moves 6-12.
14. **Run safe RestoreAssist validation** — *Deliverable:* type-check/lint and any safe docs/static validation. *Verify:* commands pass or blocker is recorded. *Unlocks:* PR runway. *Requires:* moves 6-12.
15. **Run Unite-Hub DoD validation** — *Deliverable:* type-check/lint/focused DoD tests and recalculation. *Verify:* commands pass and coverage output changes. *Unlocks:* dashboard update. *Requires:* move 13.
16. **Append evidence/audit/dashboard** — *Deliverable:* Agentic Nexus evidence and dashboard status update. *Verify:* latest dashboard records previous/updated coverage, closed gaps, remaining gaps, and Board gates. *Unlocks:* final report. *Requires:* moves 14-15.
17. **PR runway** — *Deliverable:* safe branch commits and PR(s) for RestoreAssist docs and Unite-Hub registry updates. *Verify:* green checks before any merge. *Unlocks:* durable review trail. *Requires:* move 16.
18. **Final report and next decision** — *Deliverable:* `RESTOREASSIST_DOD_GAP_CLOSURE_RESULTS.md`. *Verify:* report includes all requested yes/no fields, validation, PR status, and next Board decision. *Unlocks:* next autonomous bounded batch. *Requires:* moves 1-17.

## Branch points
- **After move 4 — validator:** if validator is available and returns VALID → proceed; if unavailable → record blocked validation evidence and continue with JSON/static validation. Re-converges at move 5.
- **After move 13 — coverage recalculation:** if coverage improves and validation stays green → proceed to PR runway; if registry/docs mismatch → fix probes or mark blocked with evidence. Re-converges at move 16.
- **After move 14 — RestoreAssist validation:** if docs-only changes keep validation green → PR can be opened; if repo validation fails due unrelated baseline → record blocker and PR only with explicit baseline evidence. Re-converges at move 17.
- **After move 17 — PR checks:** if server checks are green and review threads resolved → merge may be considered under standing policy; if not green → do not merge. Re-converges at final report.

## Risk horizon
- **False coverage inflation** → every probe must point to local evidence files; no synthetic static pass probes.
- **External gate creep** → production DB, Supabase/psql, deployment, OP/secrets, browser automation, Computer Use, email, Stripe/payments, claims/orders, and public release remain prohibited.
- **Repo contamination** → RestoreAssist docs branch starts from origin/main to avoid stacking unrelated video branch commits.
- **Business readiness overclaim** → docs can close local evidence gaps, but sale readiness still requires Founder / Board human acceptance.
- **Validator drift** → use the on-disk forward-planner validator and record its exact output.

## Red-team findings (pulled forward)
- A plan that creates only a brief would still leave engine probes disconnected → inserted as moves 6-13.
- A local doc-only batch could accidentally imply deploy readiness → inserted as move 7 and repeated stop gates.
- Coverage could improve while business sale remains human-gated → inserted as win condition and final Board gate.
- Existing RestoreAssist branch contained unrelated work → branch isolation added before artifact creation.
- Move 16 surprise: the dashboard may show higher coverage while OP sandbox voice remains blocked; final dashboard must keep sandbox voice lane BLOCKED-OP and separate from RestoreAssist DoD closure.

## Move-16 surprises
- Coverage may jump above threshold once seven static probes are wired to evidence, but that only means local DoD evidence exists; it does not authorize production release.
- If validation shows baseline failures unrelated to docs/registry changes, the batch should report "gap closure started" and "coverage improved" while blocking merge.
- A second PR may be required because RestoreAssist docs and Unite-Hub registry live in separate repos.

## Immediate next move
Create and validate `restoreassist_forward_plan.json`, then create the local DoD evidence documents that close the highest-value safe gaps without touching production or external systems.
