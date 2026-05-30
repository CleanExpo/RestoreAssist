# RestoreAssist Overnight Goal

## Objective

Continue RestoreAssist from the green Phase 0 baseline and work through the remaining production-readiness backlog safely and autonomously.

The goal is to move RestoreAssist toward a production-grade, ship-ready AU/NZ restoration platform without touching unrelated local changes or starting risky broad refactors.

## Current Baseline

- Phase 0 local validation: PASS
- GitHub CI: PASS on PR #1176
- Phase 1 plan exists
- PR #1176 must be merged or used as the clean green baseline before implementation
- Do not touch unrelated local changes:
  - .github/PULL_REQUEST_TEMPLATE.md
  - .agents/skills/appshots/

## Before Coding

1. Confirm the current branch and working tree state.
2. Confirm PR #1176 is merged or branch cleanly from its green baseline.
3. Confirm Node policy. Prefer Node 22.22.3 if that matches green CI evidence.
4. Read the production implementation docs:
   - EXECUTION_BACKLOG.md
   - PHASE_1_EXECUTION_PLAN.md
   - PHASE_1_CRITICAL_PRODUCTION_GAPS.md
   - PHASE_2_AI_AND_WORKFLOW_UPGRADES.md
   - PHASE_3_SHIPIT_VALIDATION.md
   - RELEASE_GATE.md

## Execution Order

### Phase 1 — Critical Production Gaps

Prioritise:

1. Mobile offline/sync productionisation
2. Voice session persistence
3. Report generation hardening
4. Upload/evidence-chain reliability
5. Auth/RBAC/tenant security validation

Phase 1 must be completed or safely blocked before Phase 2 starts.

### Phase 2 — AI and Workflow Upgrades

Only after Phase 1 validation passes, continue to:

1. AI orchestration/model routing
2. Cost controls
3. RAG/IICRC validation
4. OCR/image pipeline improvements
5. Sketch/floorplan acceleration
6. Technician workflow automation

### Phase 3 — Ship Readiness

Only after Phase 2 validation passes, continue to:

1. Security checks
2. Regression testing
3. Observability checks
4. Release documentation
5. Final production readiness report

## Rules

- Work autonomously.
- Do not ask for permission for obvious next steps.
- Do not touch unrelated local changes.
- Do not redesign UI before critical production risks are fixed.
- Do not copy competitor IP, UI, wording, layouts, colours, or proprietary workflows.
- Keep changes small, safe, testable, and reviewable.
- Run validation after meaningful changes.
- Do not fake test results.
- Do not mark work complete unless validation proves it.
- If a task is too risky, document it and move to the next safe task.
- If blocked, use Error / Cause / Fix / Next action.
- Prefer production safety over speed.

## Required Reports

Create or update:

- PHASE_1_PROGRESS_LOG.md
- PHASE_1_COMPLETION_REPORT.md
- PHASE_2_PROGRESS_LOG.md
- PHASE_2_COMPLETION_REPORT.md
- PHASE_3_PROGRESS_LOG.md
- FINAL_SHIPIT_READINESS_REPORT.md

Each report must include:

- completed tasks
- files changed
- validation run
- passing/failing checks
- unresolved risks
- rollback notes
- next safe action

## Validation Gates

Run relevant checks before marking each phase complete:

- pnpm install --frozen-lockfile
- pnpm prisma:generate
- pnpm type-check
- pnpm lint
- pnpm exec vitest run
- pnpm build
- pnpm audit --audit-level=high --prod
- git diff --check
- targeted tests for changed modules

## Done When

Stop only when:

- all safe backlog items have been completed or documented
- validation has run
- progress and completion reports exist
- unresolved blockers are clearly listed
- RestoreAssist has a final ship-readiness status
- unrelated local changes remain untouched
