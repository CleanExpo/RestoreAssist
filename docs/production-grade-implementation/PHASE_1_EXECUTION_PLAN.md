# Phase 1 Execution Plan

Date: 2026-05-24  
Status: Preparation only. No Phase 1 code changes have started.

## Entry Baseline

Phase 1 may start from PR #1176 after Phase 0 CI passed:

- `pnpm install --frozen-lockfile`
- `pnpm prisma:generate`
- `pnpm type-check`
- `pnpm lint`
- `pnpm exec vitest run`
- `pnpm build`
- `pnpm audit --audit-level=high --prod`
- pgvector Prisma migration drift with `pnpm exec prisma migrate deploy` and `pnpm exec prisma migrate status`

## First 5 Critical Production Tasks

### 1. MOB-001: Mobile Offline Mutation Queue Foundation

- Priority: P0
- Implementation order: first
- Likely affected files/modules: `mobile/lib/sync/engine.ts`, `mobile/lib/store.ts`, `mobile/lib/api/client.ts`, `lib/services/**`, `app/api/**` routes selected for first idempotent replay path, `prisma/schema.prisma`
- Expected risks: duplicate field writes, stale local state, replay ordering bugs, schema churn if the mutation model is too broad
- Test plan: migration test, `pnpm prisma:generate`, queue unit tests, duplicate replay test, app restart persistence test, network toggle integration test where available
- Rollback plan: additive schema only; gate server replay behind a feature flag; keep direct online API calls as fallback for one release
- Acceptance criteria: queued mutations persist across restart, replay is idempotent, duplicate mutation IDs return the prior result, conflicts are surfaced clearly, sync status is visible to the field app

### 2. VOI-001: Replace In-Memory Voice Session Store

- Priority: P0
- Implementation order: second
- Likely affected files/modules: `lib/voice/session.ts`, `lib/voice/types.ts`, `app/api/inspections/[id]/voice/session/route.ts`, `app/api/inspections/[id]/voice/observation/route.ts`, `prisma/schema.prisma`
- Expected risks: losing active session state during migration, reconnect edge cases, transcript ordering drift, over-coupling voice to inspection writes
- Test plan: migration test, create/get/update/end session tests, reconnect test, server restart simulation, observation append test
- Rollback plan: keep existing in-memory path behind a temporary feature flag; disable persisted voice per environment if reconnect behavior regresses
- Acceptance criteria: voice session lifecycle reads/writes durable storage, process-local memory is not the source of truth, reconnect works after server restart, ended sessions cannot receive new observations

### 3. REPORT-001: Report Generation Hardening

- Priority: P0
- Implementation order: third
- Likely affected files/modules: `app/api/reports/**`, `lib/reports/**`, `lib/generate-iicrc-report-pdf.ts`, `lib/generate-sketch-pdf.ts`, report download/export routes
- Expected risks: breaking current PDF/export behavior, surfacing internal errors, long-running generation timeouts, inconsistent source evidence references
- Test plan: unit tests for report section generation, route tests for generic 500 bodies, PDF smoke generation, fixture-based report regression tests
- Rollback plan: keep existing generation path as default until hardened path passes; feature-flag any new generation pipeline behavior
- Acceptance criteria: report generation returns generic 500s on internal errors, source/evidence references remain stable, large report generation has a bounded failure mode, core report fixtures produce valid outputs

### 4. EVD-001: Upload and Evidence-Chain Reliability

- Priority: P0
- Implementation order: fourth
- Likely affected files/modules: `app/api/upload/route.ts`, `app/api/inspections/[id]/photos/**`, `app/api/inspections/[id]/sketches/import-from-image/route.ts`, `lib/media/**`, `lib/storage/**`
- Expected risks: rejecting valid field files, inconsistent hash/metadata calculation, upload retries creating duplicates, breaking sketch import
- Test plan: magic-byte tests for JPEG/PNG/WebP/PDF, spoofed MIME rejection tests, oversized file tests, duplicate hash tests, sketch import validation tests
- Rollback plan: keep current upload route behavior behind a compatibility flag; migrate one route group at a time
- Acceptance criteria: shared validator is used by canonical upload and sketch import, spoofed files are rejected, accepted files get stable hash/metadata, duplicate media handling is deterministic

### 5. SEC-001/API-002: Auth, RBAC, Tenant, and Admin Validation

- Priority: P0
- Implementation order: fifth, with audit inventory allowed before code changes
- Likely affected files/modules: `app/api/admin/**/route.ts`, `app/api/**/route.ts` high-risk groups, `lib/admin-auth.ts`, `lib/auth/**`, `prisma/schema.prisma`, future RLS audit scripts
- Expected risks: locking out legitimate admins, false positives in public-token routes, tenant filters missing on older routes, policy rollout affecting production data access
- Test plan: admin/non-admin/demoted-admin route tests, tenant-crossing denial tests, public-token route threat-model tests, RLS inventory tests before policy rollout
- Rollback plan: patch routes in small groups; keep RLS rollout additive and staged; roll forward policy corrections instead of blanket-disabling RLS
- Acceptance criteria: admin routes use DB role revalidation or documented exemption, high-risk tenant routes enforce workspace/user scope, public-token routes have explicit scope/expiry/audit rules, first RLS inventory is ready before policies are applied

## Implementation Order

1. Freeze Phase 0 baseline and create a Phase 1 branch from the verified PR head after merge/rebase.
2. Add additive Prisma models needed by offline mutation and voice persistence.
3. Implement the smallest offline mutation path that proves idempotent replay.
4. Persist voice session lifecycle behind a feature flag.
5. Harden report generation error handling and fixture coverage.
6. Extract shared media validation and migrate upload plus sketch import.
7. Run auth/RBAC/tenant audits and patch only the first high-risk route group.

## Do Not Touch Yet

- No visual redesign.
- No competitor-inspired UX changes.
- No broad architecture refactor.
- No AI model routing or provider-gateway migration unless it is required to unblock a Phase 1 P0.
- No full room graph/floorplan rebuild.
- No full RLS production rollout before inventory and first policy tests exist.
- No package manager changes beyond the Phase 0 Node/pnpm baseline.

## Acceptance Criteria For Phase 1 Start

- Phase 0 PR remains green after the Phase 1 plan commit.
- The Phase 1 branch starts from a green baseline.
- First Phase 1 PR scope is limited to one P0 task group.
- Every schema change is additive and followed by `pnpm prisma:generate`.
- Every changed API route keeps auth, tenant scope, generic 500s, and bounded Prisma queries in review scope.
