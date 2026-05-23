# Kanban audit — Prisma / Xero / Margot proxy / Mission Control lanes

Timestamp: 2026-05-23T03:50:24Z
Task: t_18068c67
Branch: chore/cleanup-do-refs-and-prisma-pin

## Executive recommendation

Do not commit the remaining dirty tree as one unit. The branch already has five coherent commits ahead of origin; the remaining workspace is a mixed audit surface with one commit-ready Nexus/Mission Control lane, one already-committed Prisma/Xero lane, one small pricing-copy lane, and several broad line-ending / route-cleanup / UI lanes that should stay split.

## Current git state audited

- Branch is ahead of origin by 5 commits:
  - eb8fd19d chore: stabilize lint guardrails
  - a94b8c7d feat(xero): add sync status lifecycle
  - 07f9b6b5 fix(deps): pin minimatch brace-expansion override
  - 3f2ef40c chore(lint): declare Next ESLint plugin
  - 0a0e64c7 fix(admin): parameterise vectorise queries
- Dirty tracked files: 52 modified tracked files.
- Untracked key lanes:
  - app/api/margot/hermes-proxy/route.ts
  - app/api/mission-control/context/route.ts
  - app/dashboard/mission-control/page.tsx
  - content/nexus-hub/*
  - lib/nexus-hub-context.ts
  - docs/handoff/*
  - MISSION_REPORTS/*
  - app/dashboard/clients/components/*
  - scripts/overnight-audit-linear-push.mjs

## Lane audit and commit readiness

### Lane A — Prisma / Xero sync-status

Status: already commit-ready and already committed in a prior child/parent pass.

Findings:
- No remaining dirty files under prisma/, app/api/integrations/xero, or lib/integrations/xero.
- Prisma schema validates with dummy DATABASE_URL / DIRECT_URL.
- Xero sync-status targeted tests pass.

Verification:
- DIRECT_URL=<redacted-db-url> DATABASE_URL=<redacted-db-url> npx prisma validate — PASS. Pre-existing Prisma SetNull warning remains.
- npx vitest run lib/integrations/xero/__tests__/sync-status.test.ts — PASS as part of combined run, 21 tests.

Recommendation:
- No further Prisma/Xero commit from this audit lane.
- Keep the SetNull warning as a separate schema-quality task; do not bundle with Mission Control or dirty UI fixes.

### Lane B — Nexus Hub / Margot proxy / Mission Control

Status: commit-ready after review, but should be its own PR because it crosses RestoreAssist product UI with Unite-Group Nexus Hub context.

Files:
- .env.example
- app/api/margot/chat/route.ts
- app/api/margot/hermes-proxy/route.ts
- app/api/mission-control/context/route.ts
- app/dashboard/mission-control/page.tsx
- content/nexus-hub/AGENTS.full.md
- content/nexus-hub/AGENTS.snippet.md
- content/nexus-hub/README.md
- content/nexus-hub/design-tokens.md
- content/nexus-hub/icp-positioning.md
- content/nexus-hub/voice-profile.md
- lib/nexus-hub-context.ts

Findings:
- API routes use getServerSession + verifyAdminFromDb, satisfying the admin-route auth rule.
- The context loader reads only synced content/nexus-hub from the app bundle and optionally fetches HERMES_BASE_URL; no secrets found in content/nexus-hub.
- Margot chat injection is default-on through MARGOT_NEXUS_CONTEXT with opt-out for production control.
- Mission Control page is correctly framed as a RestoreAssist deep link, not the group command centre itself.
- Risk: /api/margot/hermes-proxy duplicates chat capability and directly streams Claude without the existing tool set. That is acceptable as a Tier 2 prototype, but should be reviewed by governance because it introduces another AI endpoint and another Anthropic call path.

Verification:
- pnpm exec eslint --quiet app/api/margot/chat/route.ts app/api/margot/hermes-proxy/route.ts app/api/mission-control/context/route.ts app/dashboard/mission-control/page.tsx lib/nexus-hub-context.ts lib/pricing.ts lib/__tests__/pricing-integrity.test.ts — PASS.
- pnpm type-check — PASS.
- git diff --check on the Mission Control/Margot/pricing subset — PASS.
- Secret scan over content/nexus-hub — no matches for API_KEY/SECRET/TOKEN/PASSWORD/sk-/BEGIN/etc.

Recommendation:
- Commit as a standalone Nexus/Mission Control lane only after Pi governance / CEO Board review because it is an external-facing group-context surface inside RestoreAssist.
- Suggested commit title: feat(margot): add Nexus Hub context bridge.

### Lane C — Pricing copy integrity

Status: low-risk, commit-ready either standalone or bundled with a tiny marketing copy PR.

Files:
- lib/pricing.ts
- lib/__tests__/pricing-integrity.test.ts
- app/pricing/page.tsx also has dirty copy changes and should be reviewed with this lane before commit.

Findings:
- Adds explicit free tier config and a regression test preventing 30-vs-3 free report drift.
- The targeted pricing integrity test passes.

Verification:
- npx vitest run lib/__tests__/pricing-integrity.test.ts — PASS as part of combined run, 7 tests.
- Included in targeted ESLint pass above.

Recommendation:
- Commit as its own small lane after checking app/pricing/page.tsx diff for copy consistency.
- Suggested commit title: fix(pricing): align free tier report copy.

### Lane D — Dirty inspection/report/user API route cleanup

Status: not commit-ready as a batch.

Files include:
- app/api/cron/backfill-progress/route.ts
- app/api/inspections/[id]/* routes
- app/api/reports/* routes
- app/api/scopes/[id]/route.ts
- app/api/user/profile/route.ts

Findings:
- Full raw diff is large, but ignoring EOL whitespace reduces it substantially, confirming line-ending churn is masking small logic edits.
- Prior handoff says targeted route ESLint passed after one regex correction, but these files still need per-route diff review before staging.

Recommendation:
- Split into 2–4 route micro-lanes: inspection routes, report download/export routes, profile/scope routes, cron route.
- Use git diff --ignore-space-at-eol for review, then stage only intentional hunks.
- Avoid normalising line endings in the same PR.

### Lane E — Dashboard/component/pilot-tester churn

Status: not commit-ready.

Files include:
- app/dashboard/analytics/*
- app/dashboard/field/page.tsx
- app/dashboard/inspections/[id]/capture/page.tsx
- app/dashboard/reports/new/page.tsx
- components/*
- pilot-tester/src/*

Findings:
- Significant line-ending churn remains, especially components/NIRTechnicianInputForm.tsx, lib/generate-forensic-report-pdf.ts, lib/invoices/pdf-generator.ts, and several dashboard pages.
- Some files have real small edits after ignoring EOL whitespace, but they are mixed with mechanical churn.

Recommendation:
- Do not stage this lane yet.
- First classify each file with git diff --ignore-space-at-eol, then either revert pure churn or create one mechanical EOL-only PR before functional edits.

### Lane F — Reports / Linear / handoff docs

Status: docs-only but mixed provenance; review before commit.

Files:
- MISSION_REPORTS/2026-05-19-overnight-consumer-audit.md
- MISSION_REPORTS/linear-issues-manual.md
- docs/handoff/*
- scripts/overnight-audit-linear-push.mjs

Findings:
- No raw API key value surfaced in the scanned new report/handoff docs, but several docs mention LINEAR_API_KEY availability/401. That is acceptable operationally but should stay internal.
- Live Linear remains blocked by HTTP 401 from prior handoffs.

Recommendation:
- Commit only the final durable handoff docs needed for audit continuity; leave transient continuation notes uncommitted unless the board wants a full audit trail in-repo.
- Do not run or commit the Linear push script until credentials are repaired and script is reviewed.

## Verification summary

Passed:
- pnpm type-check
- DIRECT_URL=<redacted-db-url> DATABASE_URL=<redacted-db-url> npx prisma validate
- pnpm exec eslint --quiet targeted Mission Control / Margot / pricing files
- npx vitest run lib/__tests__/pricing-integrity.test.ts lib/integrations/xero/__tests__/sync-status.test.ts — 2 files, 28 tests
- git diff --check on Mission Control / Margot / pricing subset
- secret-string scan over content/nexus-hub

Known non-blocking warning:
- Prisma validates but emits the pre-existing SetNull relation warning.

## Next action

Recommended next commit lane: Nexus Hub / Mission Control bridge, after governance review. It is the cleanest remaining feature lane and has targeted validation green.

Recommended follow-up split after that:
1. Pricing copy integrity lane.
2. Inspection/report API route micro-lanes.
3. Dashboard/component/pilot-tester churn triage.
4. Docs/report retention lane.

Labour accounting for this audit: 0.45 hr × $85 AUD/hr = $38.25 AUD.
