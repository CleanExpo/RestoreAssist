# Execution Backlog

Date: 2026-05-24  
Program goal: convert the production-grade implementation package into executable work without starting visual redesign before production risks are controlled.

## Top 10 Production-Readiness Unblockers

These tasks unblock safe execution and must be handled before broad UX or AI expansion.

| Rank | Task ID | Why it unblocks production |
|---:|---|---|
| 1 | ENV-001 | No reliable local/CI verification exists while `pnpm` and `corepack` are unavailable in this shell. |
| 2 | ENV-002 | Build gates are soft while TypeScript/ESLint errors can be ignored by `next build`. |
| 3 | SEC-001 | Production RLS gaps are the largest known tenant-isolation risk. |
| 4 | SEC-002 | Forbidden env/secrets audit blocks TLS and credential regressions. |
| 5 | API-001 | Route auth/admin/query/error/raw-SQL audit turns scattered risk into a measurable gate. |
| 6 | API-002 | Admin DB-role revalidation closes stale JWT privilege risk. |
| 7 | API-003 | Query/raw SQL/error response fixes reduce data leakage and scale risk. |
| 8 | MOB-001 | Offline/idempotency foundation is required before field capture is trustworthy. |
| 9 | VOI-001 | Persisted voice sessions are required before voice can be relied on across deploys/reconnects. |
| 10 | EVD-001 | Shared media validation closes repeated upload/security/cost risk across photos, docs, sketches, and floorplans. |

## Workstream 1: Environment and CI Readiness

### ENV-001: Restore Package Manager Verification Path

- Priority: P0
- Affected files/modules: local shell profile or toolchain setup docs, `package.json`, `pnpm-workspace.yaml`, CI workflow docs
- Risk level: Medium
- Expected outcome: Engineers and CI can run the authoritative checks consistently.
- Dependencies: None
- Test requirements: `which pnpm`, `pnpm --version`, `pnpm type-check`, `pnpm lint`
- Acceptance criteria: `pnpm@9.15.9` is available locally and in CI; `corepack` absence is documented with install/fallback; no npm/yarn/bun repo dependency changes.
- Rollback considerations: Revert shell/CI path changes only; do not touch lockfile unless dependency install changed it.

Blocker:

Error: `pnpm` and `corepack` are unavailable in the current shell.  
Cause: Node exists but package-manager shims are not on PATH.  
Fix: Install/enable pnpm outside repo dependency graph or add documented PATH setup; rerun `pnpm type-check`.

### ENV-002: Make Type/Lint/Test Gates Authoritative

- Priority: P0
- Affected files/modules: `next.config.mjs`, `.github/workflows/**`, `package.json`, `.claude/rules/verification-gate.md`
- Risk level: High
- Expected outcome: Production deploys cannot bypass TypeScript, lint, smoke, and route audit failures.
- Dependencies: ENV-001
- Test requirements: CI dry run or workflow run; `pnpm type-check`; `pnpm lint`; smoke suite
- Acceptance criteria: PR and production checks fail on type/lint errors; `next.config.mjs` ignores remain documented as temporary or are removed after drift is fixed.
- Rollback considerations: If deploys are blocked by legacy drift, keep build ignores temporarily but require separate hard CI checks.

### ENV-003: Clarify Deploy Ownership

- Priority: P0
- Affected files/modules: `.github/workflows/deploy-production.yml`, `DEPLOYMENT.md`, `docs/RELEASE_GATE.md`, Vercel project settings
- Risk level: High
- Expected outcome: Team knows whether Vercel Git deploy or GitHub Actions is authoritative.
- Dependencies: ENV-001
- Test requirements: inspect latest production deploy source; run preview smoke
- Acceptance criteria: One documented deploy path; stale/broken workflow fixed or deleted; rollback path documented.
- Rollback considerations: Preserve current Vercel Git deploy if GitHub Actions path is not fully restored.

### ENV-004: Add Phase-0 Static Audit Scripts

- Priority: P0
- Affected files/modules: `scripts/audit-api-routes.ts`, `scripts/audit-env.ts`, `scripts/audit-rls.ts`, `package.json`
- Risk level: Medium
- Expected outcome: Security and API drift become repeatable checks.
- Dependencies: ENV-001
- Test requirements: run each script locally and in CI
- Acceptance criteria: Scripts produce deterministic pass/fail and explain exceptions.
- Rollback considerations: Keep scripts advisory if first run has many existing failures; make blocking after baseline triage.

## Workstream 2: Architecture Simplification

### ARCH-001: Confirm Modular Monolith Boundaries

- Priority: P1
- Affected files/modules: `.claude/ARCHITECTURE.md`, `docs/production-grade-implementation/SYSTEM_ARCHITECTURE.md`, `lib/services/**`, `app/api/**`
- Risk level: Medium
- Expected outcome: Teams avoid premature microservices and route new logic through service modules.
- Dependencies: ENV-002
- Test requirements: architecture review; no runtime test
- Acceptance criteria: New module boundary doc lists capture, AI, media, report, integration, auth, tenancy, observability owners.
- Rollback considerations: Documentation-only; revert if inaccurate.

### ARCH-002: Define Client Mutation and Async Job Contracts

- Priority: P1
- Affected files/modules: `lib/services/_shared/**`, `prisma/schema.prisma`, `app/api/**`, future queue module
- Risk level: High
- Expected outcome: Offline sync, report generation, OCR, AI, and integrations share idempotent job contracts.
- Dependencies: MOB-001, PRISMA-001
- Test requirements: unit tests for idempotency and replay; integration tests for duplicate submissions
- Acceptance criteria: Mutation IDs and job IDs have one canonical shape and replay policy.
- Rollback considerations: Additive contracts only; legacy routes continue until migrated.

### ARCH-003: Decide Capacitor WebView vs Expo Field Shell

- Priority: P1
- Affected files/modules: `capacitor.config.ts`, `mobile/**`, `docs/MOBILE_RELEASE_RUNBOOK.md`
- Risk level: Medium
- Expected outcome: Avoids maintaining two incomplete mobile strategies.
- Dependencies: MOB-001
- Test requirements: decision record with pilot criteria
- Acceptance criteria: 90-day mobile shell decision with owner, migration triggers, and deprecation plan.
- Rollback considerations: Keep both paths read-only until decision is signed off.

## Workstream 3: API Route Consolidation

### API-001: Implement API Route Audit Gate

- Priority: P0
- Affected files/modules: `scripts/audit-api-routes.ts`, `app/api/**/route.ts`
- Risk level: High
- Expected outcome: Auth, admin revalidation, query caps, raw SQL safety, and 500 body policy are measurable.
- Dependencies: ENV-004
- Test requirements: script fixtures for exempt routes, public-token routes, admin routes, raw SQL, `findMany`
- Acceptance criteria: Audit reports route, rule, reason, and exception status; CI can run it.
- Rollback considerations: Start as advisory; block after top-risk routes are patched.

### API-002: Patch Admin Role Revalidation Drift

- Priority: P0
- Affected files/modules: `app/api/admin/**/route.ts`, `lib/admin-auth.ts`
- Risk level: High
- Expected outcome: Demoted admins cannot continue using stale JWT role claims.
- Dependencies: API-001
- Test requirements: unit/integration route tests for non-admin, demoted admin, current admin
- Acceptance criteria: Every admin route calls `verifyAdminFromDb` or has a documented non-session exemption.
- Rollback considerations: Revert route patches individually if false positives block legitimate admin flows.

### API-003: Patch Query/Raw SQL/Error Response Hotspots

- Priority: P0
- Affected files/modules: flagged `app/api/**/route.ts`, `lib/**`, especially routes with `findMany`, `$queryRaw`, `$executeRaw`, `error.message`
- Risk level: High
- Expected outcome: Reduced data leakage, SQL injection risk, and unbounded query risk.
- Dependencies: API-001
- Test requirements: route tests around changed filters/errors; SQL unit tests where applicable
- Acceptance criteria: All P0 routes use explicit `select/include`, `take`, generic 500s, and `Prisma.sql` for user-influenced raw SQL.
- Rollback considerations: Patch in small route groups; revert only affected group if behavior changes.

### API-004: Public Token Route Threat Model

- Priority: P1
- Affected files/modules: `app/api/portal/**`, `app/api/invites/**`, `app/api/authority-forms/sign/**`, public download routes
- Risk level: High
- Expected outcome: Public access is intentional, scoped, expiring, revocable, and audited.
- Dependencies: SEC-004
- Test requirements: token expiry, revoked token, wrong token, audit event tests
- Acceptance criteria: Every public route has documented token type, expiry, scope, owner, audit event, and rate limit.
- Rollback considerations: Keep existing routes but deny high-risk operations until threat model is complete.

## Workstream 4: Prisma/Domain Model Rationalisation

### PRISMA-001: Add ClientMutation and FieldCaptureEvent Models

- Priority: P0
- Affected files/modules: `prisma/schema.prisma`, `prisma/migrations/**`, `lib/services/**`
- Risk level: High
- Expected outcome: Offline replay and field capture have durable idempotency and audit spine.
- Dependencies: ENV-001, ARCH-002
- Test requirements: migration, `pnpm prisma:generate`, unit tests for duplicate mutation handling
- Acceptance criteria: Unique `workspaceId + mutationId`; capture events append-only; no destructive migration.
- Rollback considerations: Additive migration; keep old APIs until event-write path is proven.

### PRISMA-002: Add Persisted Voice Copilot Models

- Priority: P0
- Affected files/modules: `prisma/schema.prisma`, `lib/voice/session.ts`, `app/api/inspections/[id]/voice/**`
- Risk level: High
- Expected outcome: Voice state survives deploys, serverless instances, and reconnects.
- Dependencies: PRISMA-001
- Test requirements: migration; session create/reconnect/end tests; observation append tests
- Acceptance criteria: No process-local voice state is required for correctness.
- Rollback considerations: Keep in-memory path behind feature flag until persisted path passes.

### PRISMA-003: Add RoomGraph and EvidencePin Models

- Priority: P1
- Affected files/modules: `prisma/schema.prisma`, `components/sketch/**`, `app/api/inspections/[id]/sketches/**`, `lib/evidence/**`
- Risk level: High
- Expected outcome: Photos, moisture readings, scope, equipment, and reports share room context.
- Dependencies: PRISMA-001, SKETCH-001
- Test requirements: migration; room graph CRUD tests; E2E sketch evidence pin test
- Acceptance criteria: Room graph supports rooms, scale, floor, adjacency, and evidence pins.
- Rollback considerations: Additive; retain existing sketch JSON until migration is complete.

### PRISMA-004: Add ReportSectionDraft and HandoffPackage Models

- Priority: P1
- Affected files/modules: `prisma/schema.prisma`, `app/api/reports/**`, `app/api/inspections/[id]/handover/**`
- Risk level: Medium
- Expected outcome: Reports become reviewable source-linked drafts and handoff packages are auditable.
- Dependencies: REPORT-001
- Test requirements: migration; report draft versioning tests; handoff revoke tests
- Acceptance criteria: AI report output is draft/versioned/source-linked; handoff package can be created/revoked.
- Rollback considerations: Additive; continue current PDF generation until package flow is stable.

## Workstream 5: Mobile Offline/Sync Productionisation

### MOB-001: Implement Offline Mutation Queue Foundation

- Priority: P0
- Affected files/modules: `mobile/lib/sync/engine.ts`, `mobile/lib/store.ts`, `mobile/lib/api/client.ts`, server idempotency service
- Risk level: High
- Expected outcome: Field capture can survive poor connectivity without duplicate writes.
- Dependencies: PRISMA-001
- Test requirements: offline queue unit tests; network toggle integration test; duplicate replay test
- Acceptance criteria: Queue persists across app restart; replay is idempotent; sync status is visible.
- Rollback considerations: Feature-flag queue; keep direct online API calls as fallback.

### MOB-002: Offline Media Cache

- Priority: P1
- Affected files/modules: `mobile/**`, `app/api/upload/route.ts`, media service
- Risk level: High
- Expected outcome: Photos/audio/sketch snapshots captured offline upload later.
- Dependencies: MOB-001, EVD-001
- Test requirements: offline photo/audio capture and later upload; hash duplicate test
- Acceptance criteria: Media has local ID, upload state, remote URL, and retry policy.
- Rollback considerations: Disable offline media per workspace if sync issues appear.

### MOB-003: Progress Transition Queue

- Priority: P1
- Affected files/modules: `lib/progress/**`, `app/api/progress/**`, mobile sync queue
- Risk level: High
- Expected outcome: Progress framework offline invariant becomes real.
- Dependencies: MOB-001
- Test requirements: transition replay, duplicate collapse, guard failure surfacing
- Acceptance criteria: Offline transitions flush with idempotency keys and missing evidence list.
- Rollback considerations: Keep progress transitions online-only until queue passes.

## Workstream 6: Voice Session Persistence

### VOI-001: Replace In-Memory Voice Session Store

- Priority: P0
- Affected files/modules: `lib/voice/session.ts`, `lib/voice/types.ts`, `app/api/inspections/[id]/voice/session/route.ts`
- Risk level: High
- Expected outcome: Voice sessions are durable and auditable.
- Dependencies: PRISMA-002
- Test requirements: create/get/update/end tests; server restart simulation
- Acceptance criteria: Session lifecycle reads/writes DB; in-memory map is no longer source of truth.
- Rollback considerations: Feature flag persisted voice; retain old path for one release.

### VOI-002: Persist Voice Observations and Confirmation State

- Priority: P1
- Affected files/modules: `lib/voice/transcript-parser.ts`, `app/api/inspections/[id]/voice/observation/route.ts`, `prisma/schema.prisma`
- Risk level: Medium
- Expected outcome: Voice-derived observations can be reviewed and replayed.
- Dependencies: VOI-001
- Test requirements: parser tests; high/medium/low confidence tests; confirmation tests
- Acceptance criteria: Observations are append-only, linked to inspection/user/session, and can be confirmed.
- Rollback considerations: Disable auto-stage writes; keep transcript-only persistence.

### VOI-003: Voice Cost and Runtime Guards

- Priority: P1
- Affected files/modules: `app/api/ai/voice-note-transcribe/route.ts`, future realtime route, AI gateway
- Risk level: Medium
- Expected outcome: Voice cannot silently generate runaway spend.
- Dependencies: AI-001, OBS-002
- Test requirements: rate limit, max duration, budget block, app lifecycle stop
- Acceptance criteria: Push-to-talk default, silence timeout, max session duration, spend logging.
- Rollback considerations: Disable realtime voice while preserving transcription.

## Workstream 7: AI Orchestration and Model Routing

### AI-001: Introduce Provider-Neutral AI Gateway

- Priority: P1
- Affected files/modules: `lib/ai-gateway/**`, `lib/services/ai/**`, `lib/ai/model-router.ts`
- Risk level: High
- Expected outcome: AI calls share budget, policy, redaction, fallback, telemetry, and schemas.
- Dependencies: ENV-002, OBS-002
- Test requirements: provider adapter unit tests; budget block tests; schema validation tests
- Acceptance criteria: New paid AI calls go through gateway; Anthropic gateway can remain adapter-backed.
- Rollback considerations: Migrate task-by-task; legacy services remain until parity.

### AI-002: Define Task Policy and Model Allowlist

- Priority: P1
- Affected files/modules: `lib/ai-gateway/task-policy.ts`, `lib/ai-gateway/provider-registry.ts`, settings UI later
- Risk level: Medium
- Expected outcome: Model use is controlled by task risk, cost, latency, and data class.
- Dependencies: AI-001
- Test requirements: policy resolution tests for report, photo, voice, sketch, RAG, batch
- Acceptance criteria: Every AI task has default, fallback, max cost, data class, and eval requirement.
- Rollback considerations: Conservative default: block unsupported tasks rather than fallback to premium.

### AI-003: Add AI Redaction and Data Classification

- Priority: P1
- Affected files/modules: `lib/ai-gateway/redact.ts`, AI service call sites
- Risk level: High
- Expected outcome: PII/claim evidence is blocked or routed only to approved providers.
- Dependencies: AI-001, SEC-005
- Test requirements: PII fixture tests; provider policy tests
- Acceptance criteria: Sensitive data classes cannot use unapproved low-cost providers.
- Rollback considerations: Fail closed for unknown data class.

### AI-004: Prompt Registry and Eval IDs

- Priority: P2
- Affected files/modules: `lib/ai-gateway/eval-tags.ts`, prompt modules, `lib/ai/evaluation-harness.ts`
- Risk level: Medium
- Expected outcome: Model/prompt changes become reproducible and eval-gated.
- Dependencies: AI-001, RAG-002
- Test requirements: eval harness smoke; false citation test; AU/NZ spelling test
- Acceptance criteria: Prompt version, model, eval set, and output schema logged.
- Rollback considerations: Keep current prompts as v0 baseline.

## Workstream 8: RAG/IICRC Knowledge Validation

### RAG-001: Validate IICRC Chunk Metadata and Retrieval

- Priority: P1
- Affected files/modules: `prisma/schema.prisma`, `scripts/ingest-iicrc.ts`, `lib/ai/rag-context.ts`, `lib/knowledge/**`
- Risk level: High
- Expected outcome: Standards retrieval returns edition/section/source-hash-grounded citations.
- Dependencies: ENV-001
- Test requirements: retrieval unit tests; known clause fixture tests
- Acceptance criteria: Results always include standard, edition, section, source hash; missing data blocks citation use.
- Rollback considerations: Disable citation generation for unverified chunks.

### RAG-002: Add False-Citation Eval Gate

- Priority: P1
- Affected files/modules: `lib/ai/evaluation-harness.ts`, `__tests__/**`, report generation services
- Risk level: High
- Expected outcome: AI cannot ship invented IICRC references.
- Dependencies: RAG-001, AI-004
- Test requirements: S500/S520/S700 fixture evals; report draft eval
- Acceptance criteria: Zero invented citation tolerance for ship gate.
- Rollback considerations: Use deterministic citations only if LLM summarization fails.

### RAG-003: Add AU/NZ Jurisdictional Retrieval Filters

- Priority: P2
- Affected files/modules: `lib/nir-jurisdictional-matrix.ts`, `lib/ai/rag-context.ts`, insurer profile services
- Risk level: Medium
- Expected outcome: Reports use AU/NZ/state-specific compliance context.
- Dependencies: RAG-001
- Test requirements: AU state and NZ insurer fixture tests
- Acceptance criteria: Retrieval filters by jurisdiction where available and labels gaps where not.
- Rollback considerations: Fall back to AU generic compliance with warning.

## Workstream 9: Sketch/Floorplan Workflow Acceleration

### SKETCH-001: Replace Sketch Import In-Memory Rate Limit and Add Magic Bytes

- Priority: P0
- Affected files/modules: `app/api/inspections/[id]/sketches/import-from-image/route.ts`, shared media validation, `lib/rate-limiter`
- Risk level: High
- Expected outcome: Sketch import obeys serverless-safe rate limits and upload security policy.
- Dependencies: EVD-001, API-001
- Test requirements: JPEG/PNG magic-byte tests; rate-limit tests
- Acceptance criteria: No route-local `Map` limiter; route validates actual bytes before model call.
- Rollback considerations: Disable sketch import endpoint if validation breaks imports.

### SKETCH-002: RoomGraph V1 from Existing Sketch JSON

- Priority: P1
- Affected files/modules: `components/sketch/**`, `app/api/inspections/[id]/sketches/**`, `prisma/schema.prisma`
- Risk level: High
- Expected outcome: Existing sketches can produce room graph without full editor rewrite.
- Dependencies: PRISMA-003
- Test requirements: conversion tests; v2 sketch E2E
- Acceptance criteria: Room labels, scale, floor, and boundaries persist and reload.
- Rollback considerations: Keep original sketch JSON as canonical until RoomGraph validates.

### SKETCH-003: Floorplan Underlay and Calibration Flow

- Priority: P1
- Affected files/modules: `components/sketch/FloorPlanUnderlayLoader.tsx`, `SketchScaleModal.tsx`, floor-plan routes
- Risk level: Medium
- Expected outcome: Tech can import/trace/calibrate a floorplan quickly.
- Dependencies: SKETCH-002
- Test requirements: Playwright sketch calibration test; mobile viewport test
- Acceptance criteria: Normal residential plan can be calibrated and room-traced under 5 minutes in pilot test.
- Rollback considerations: Keep manual sketch path visible.

## Workstream 10: Photo/Document Evidence Pipeline

### EVD-001: Shared Media Validation Service

- Priority: P0
- Affected files/modules: `app/api/upload/route.ts`, floorplan/sketch/photo/report upload routes, `lib/media/**`
- Risk level: High
- Expected outcome: File validation is consistent and magic-byte based everywhere.
- Dependencies: ENV-002
- Test requirements: file fixture tests for JPEG, PNG, GIF, WebP, PDF, spoofed MIME, oversize
- Acceptance criteria: Upload routes call shared validator; spoofed MIME is rejected.
- Rollback considerations: Keep route-level validators until shared validator is proven.

### EVD-002: Media Hashing, Deduplication, and Retention Class

- Priority: P1
- Affected files/modules: `lib/media/**`, `prisma/schema.prisma`, Cloudinary upload wrapper
- Risk level: Medium
- Expected outcome: Reduces duplicate uploads, storage cost, and retention ambiguity.
- Dependencies: EVD-001, PRISMA-001
- Test requirements: duplicate hash tests; retention class tests
- Acceptance criteria: New media records include hash, class, source route, workspace, and retention policy.
- Rollback considerations: Additive; do not delete existing media until policy is verified.

### EVD-003: Photo Quality and Evidence Tagging

- Priority: P2
- Affected files/modules: `lib/evidence/**`, `app/api/ai/auto-classify-photo/**`, capture UI
- Risk level: Medium
- Expected outcome: Photos become claim-relevant evidence, not unstructured storage.
- Dependencies: AI-001, PRISMA-003
- Test requirements: photo classification fixtures; blur/darkness tests where feasible
- Acceptance criteria: Photos can store room, stage, damage tag, quality signals, and confidence.
- Rollback considerations: Keep AI tags as suggestions only.

### EVD-004: Document OCR Pipeline

- Priority: P2
- Affected files/modules: report upload routes, claims document routes, OCR service
- Risk level: Medium
- Expected outcome: Forms, invoices, meter photos, and documents can be parsed safely and cheaply.
- Dependencies: AI-001, EVD-001
- Test requirements: PDF/image OCR fixtures; schema extraction tests
- Acceptance criteria: OCR outputs are structured drafts with confidence and source page/region.
- Rollback considerations: Disable OCR per document type.

## Workstream 11: Report Generation Hardening

### REPORT-001: Source-Linked Report Draft Pipeline

- Priority: P1
- Affected files/modules: `app/api/reports/**`, `lib/generate-iicrc-report-pdf.ts`, `lib/services/ai/generate-enhanced-report.ts`
- Risk level: High
- Expected outcome: AI report sections are editable, versioned, and linked to evidence.
- Dependencies: PRISMA-004, RAG-002, AI-001
- Test requirements: report draft unit tests; E2E report review; false citation eval
- Acceptance criteria: No AI report text is final without review; every compliance claim can link to evidence or citation.
- Rollback considerations: Keep legacy generation behind flag.

### REPORT-002: Continuous Completeness Preview

- Priority: P1
- Affected files/modules: `lib/evidence/submission-gate.ts`, report pages, inspection detail
- Risk level: Medium
- Expected outcome: Missing evidence becomes capture tasks before report generation.
- Dependencies: EVD-003, RAG-001
- Test requirements: completeness fixtures by claim type; UI state tests
- Acceptance criteria: Report page lists hard blockers, warnings, and source links.
- Rollback considerations: Start read-only; do not block submit until verified.

### REPORT-003: Handoff Package V1

- Priority: P1
- Affected files/modules: `app/api/inspections/[id]/handover/**`, report/export routes, portal routes
- Risk level: High
- Expected outcome: Admin/insurer handoff is one controlled package.
- Dependencies: PRISMA-004, REPORT-001, SEC-004
- Test requirements: create/revoke/share tests; PDF/photo index/sketch inclusion tests
- Acceptance criteria: Package includes report, photo index, sketch, drying log, scope/invoice, audit log, JSON.
- Rollback considerations: Keep exports separate; feature-flag handoff package.

## Workstream 12: Security, RBAC, Tenancy, and Audit Trails

### SEC-001: RLS Inventory and First Policy Rollout

- Priority: P0
- Affected files/modules: Supabase SQL migrations/policies, `scripts/audit-rls.ts`, `prisma/schema.prisma`
- Risk level: Critical
- Expected outcome: Tenant isolation is enforced at database level for highest-risk tables.
- Dependencies: ENV-004
- Test requirements: RLS audit; policy tests for anon, wrong user, correct user, admin/service role
- Acceptance criteria: First protected group covers User, Account, Organization/Workspace, inspections, reports, invoices, evidence, integrations, audit/security events.
- Rollback considerations: Roll forward with corrected policies; do not blanket-disable RLS in production.

### SEC-002: Forbidden Env and Secret Audit

- Priority: P0
- Affected files/modules: `scripts/audit-env.ts`, `.env.example`, Vercel env docs, GitHub Actions secrets
- Risk level: Critical
- Expected outcome: TLS bypass and exposed secrets cannot silently ship.
- Dependencies: ENV-004
- Test requirements: script fixtures; production env review
- Acceptance criteria: Blocks `NODE_TLS_REJECT_UNAUTHORIZED`; flags missing required envs and dangerous service-role placement.
- Rollback considerations: Advisory-only until current env inventory is complete; production forbidden keys are immediate blockers.

### SEC-003: RBAC Enforcement Sweep

- Priority: P1
- Affected files/modules: `lib/auth.ts`, workspace membership helpers, `app/api/**`
- Risk level: High
- Expected outcome: Workspace roles consistently gate sensitive operations.
- Dependencies: API-001, SEC-001
- Test requirements: role matrix tests for owner/manager/technician/junior/admin
- Acceptance criteria: Sensitive routes use workspace membership/permission checks, not email or stale role claims.
- Rollback considerations: Patch route groups incrementally.

### SEC-004: Audit Trail Coverage

- Priority: P1
- Affected files/modules: `prisma/schema.prisma`, `lib/audit/**`, AI/media/report/handoff routes
- Risk level: High
- Expected outcome: Claim-changing and access-changing events are traceable.
- Dependencies: PRISMA-001
- Test requirements: audit event tests for capture, AI draft, handoff, public access, admin impersonation
- Acceptance criteria: Every high-risk action writes immutable audit event with actor, workspace, entity, and metadata.
- Rollback considerations: Add audit events without changing business behavior first.

### SEC-005: CSP and XSS Hardening Plan

- Priority: P2
- Affected files/modules: `next.config.mjs`, app layout, components with `dangerouslySetInnerHTML`
- Risk level: Medium
- Expected outcome: Static CSP stopgap becomes a nonce/exception-managed policy.
- Dependencies: ENV-002
- Test requirements: CSP browser smoke; XSS fixture where feasible
- Acceptance criteria: Unsafe inline/eval exceptions documented and reduced; no unreviewed HTML interpolation.
- Rollback considerations: Keep static CSP if nonce migration breaks third-party widgets.

## Workstream 13: Observability and Cost Monitoring

### OBS-001: Ship-Readiness Dashboard

- Priority: P1
- Affected files/modules: `app/dashboard/telemetry/**`, `app/dashboard/admin/usage/**`, Sentry/Vercel dashboards
- Risk level: Medium
- Expected outcome: Release health can be seen in one place.
- Dependencies: ENV-002
- Test requirements: dashboard data smoke; empty-state tests
- Acceptance criteria: Shows API errors, route latency, AI spend, uploads, sync queue, report failures, integration failures.
- Rollback considerations: Dashboard read-only; no rollback risk beyond hiding incomplete widgets.

### OBS-002: AI Cost and Budget Monitoring

- Priority: P1
- Affected files/modules: `lib/usage/log-usage.ts`, `prisma/schema.prisma`, settings/admin usage pages
- Risk level: Medium
- Expected outcome: AI spend is visible and enforceable by workspace/task/provider/model.
- Dependencies: AI-001
- Test requirements: usage logging tests; budget threshold tests
- Acceptance criteria: Today/month spend, task spend, failed-call cost, and budget blocks are visible.
- Rollback considerations: Enforce soft warnings before hard blocks if pilot risk is high.

### OBS-003: Offline Sync and Queue Monitoring

- Priority: P1
- Affected files/modules: mobile sync engine, server idempotency service, admin telemetry
- Risk level: Medium
- Expected outcome: Stuck field data is visible before users complain.
- Dependencies: MOB-001
- Test requirements: stuck queue fixture; retry age metrics
- Acceptance criteria: Dashboard shows queued, synced, failed, oldest failure, and affected workspace/user.
- Rollback considerations: Read-only monitoring can remain while queue feature flag is off.

## Workstream 14: UX/Onboarding Improvements

### UX-001: First-Run Setup Agent Scope

- Priority: P2
- Affected files/modules: setup wizard, help library, AI gateway later
- Risk level: Medium
- Expected outcome: New users reach first inspection faster.
- Dependencies: SEC-001, ENV-002
- Test requirements: onboarding E2E; ABN/NZBN fallback tests
- Acceptance criteria: First-run path creates workspace and starts demo/first inspection without requiring integrations.
- Rollback considerations: Keep existing setup wizard behind flag.

### UX-002: Technician Capture Cockpit

- Priority: P2
- Affected files/modules: `app/dashboard/inspections/[id]/page.tsx`, mobile field pages, capture components
- Risk level: Medium
- Expected outcome: Field techs see the next capture action, not the whole app.
- Dependencies: MOB-001, VOI-001, EVD-001
- Test requirements: mobile Playwright snapshots; capture first photo in under 30 seconds usability test
- Acceptance criteria: Cockpit shows room, photo, voice, moisture, sketch, completeness, offline status, next required item.
- Rollback considerations: Feature flag; desktop detail page remains intact.

### UX-003: Role-Based Navigation Simplification

- Priority: P2
- Affected files/modules: `app/dashboard/layout.tsx`, navigation components, role helpers
- Risk level: Low
- Expected outcome: Technician UI hides admin noise.
- Dependencies: SEC-003
- Test requirements: role snapshot tests
- Acceptance criteria: Technician sees Jobs/Capture/Reports/Settings; admin retains management modules.
- Rollback considerations: Revert nav config only.

## Workstream 15: Ship Readiness

### SHIP-001: Release Gate Checklist Automation

- Priority: P0
- Affected files/modules: `docs/RELEASE_GATE.md`, CI workflows, audit scripts
- Risk level: High
- Expected outcome: Ship/no-ship decisions are evidence-based.
- Dependencies: ENV-002, API-001, SEC-002
- Test requirements: dry-run release checklist
- Acceptance criteria: Release gate includes type/lint/test, env audit, route audit, RLS audit, smoke, rollback, Sentry release.
- Rollback considerations: Keep manual checklist while automation matures.

### SHIP-002: Pilot Ring Runbooks

- Priority: P1
- Affected files/modules: `docs/PILOT_CUTOVER_CHECKLIST.md`, `docs/MOBILE_RELEASE_RUNBOOK.md`, new pilot docs
- Risk level: Medium
- Expected outcome: Internal, friendly pilot, and paid early access have clear entry/exit criteria.
- Dependencies: SHIP-001, REPORT-003
- Test requirements: tabletop runbook drill
- Acceptance criteria: Ring 0/1/2/3 runbooks include support, rollback, metrics, and communication templates.
- Rollback considerations: Runbook-only.

### SHIP-003: App Store and Play Store Production Verification

- Priority: P1
- Affected files/modules: `docs/APP_STORE_SUBMISSION_PREFLIGHT.md`, `docs/MOBILE_RELEASE_RUNBOOK.md`, iOS/Android workflows
- Risk level: Medium
- Expected outcome: Store releases stop being a parallel blocker.
- Dependencies: ENV-003, MOB-001
- Test requirements: store preflight, screenshots, auth smoke, privacy/data safety review
- Acceptance criteria: Fresh builds can be submitted and reviewed with known test account and notes.
- Rollback considerations: Keep web app release independent if mobile store is delayed.

