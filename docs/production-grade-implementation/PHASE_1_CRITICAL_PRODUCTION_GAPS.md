# Phase 1: Critical Production Gaps

Date: 2026-05-24  
Goal: close the risks that make production unsafe or unreliable for pilots.

## Scope

Included backlog tasks:

- SEC-001: RLS Inventory and First Policy Rollout
- SEC-002: Forbidden Env and Secret Audit
- API-001: Implement API Route Audit Gate
- API-002: Patch Admin Role Revalidation Drift
- API-003: Patch Query/Raw SQL/Error Response Hotspots
- API-004: Public Token Route Threat Model
- EVD-001: Shared Media Validation Service
- SKETCH-001: Replace Sketch Import In-Memory Rate Limit and Add Magic Bytes
- PRISMA-001: Add ClientMutation and FieldCaptureEvent Models
- MOB-001: Implement Offline Mutation Queue Foundation
- VOI-001: Replace In-Memory Voice Session Store
- SHIP-001: Release Gate Checklist Automation

## Blockers

### RLS Disabled on Sensitive Tables

Error: Master plan reports RLS disabled on 119 of about 180 production tables.  
Cause: Server-side route ownership checks are not backed by database policy coverage.  
Fix: Inventory production tables, classify tenant ownership, deploy first RLS policy group, and add policy tests.

First protected group:

- `User`
- `Account`
- `Session`
- `Organization`
- `Workspace`
- `WorkspaceMember`
- `Inspection`
- `Report`
- `Invoice`
- evidence/media tables
- integration credential/log tables
- audit/security event tables

### Forbidden TLS/Secret Environment

Error: `NODE_TLS_REJECT_UNAUTHORIZED` is reported in production env vars.  
Cause: Likely leftover debugging configuration.  
Fix: Remove or create signed exception with expiry; audit Vercel/GitHub envs and `.env.example`.

### API Route Drift

Error: Coarse audit found missing auth/admin/query/raw-SQL/error response risks.  
Cause: 442 API route files and older route patterns.  
Fix: Use the route audit from Phase 0 to patch top-risk route groups first.

### Offline and Voice Reliability

Error: offline sync is a stub and voice sessions are process-local.  
Cause: prototype field features exist without durable queue/session backing.  
Fix: Add `ClientMutation`, `FieldCaptureEvent`, persisted voice session models, and first idempotent sync path.

## Execution Order

1. Run Phase 0 checks and freeze baseline.
2. Run env audit and remove/exception forbidden envs.
3. Run route audit and patch P0 admin/auth/query/error/raw-SQL routes.
4. Build shared media validation and migrate sketch import to it.
5. Replace sketch import in-memory limiter with shared limiter.
6. Add additive Prisma migration for `ClientMutation` and `FieldCaptureEvent`.
7. Add first server-side idempotency service.
8. Add additive Prisma migration for persisted voice sessions.
9. Move voice session lifecycle to DB behind a feature flag.
10. Start RLS first-policy rollout in sandbox, then production with explicit validation.

## Test Requirements

- `pnpm prisma:generate` after schema changes.
- `pnpm type-check`.
- `pnpm lint`.
- Route audit passes for patched route groups.
- RLS tests:
  - anon cannot read tenant tables
  - wrong user cannot read another workspace
  - correct member can read allowed workspace
  - admin/service role paths are explicit
- Media validation tests:
  - accepts real JPEG/PNG/WebP/PDF where allowed
  - rejects spoofed MIME
  - rejects oversized files
- Voice tests:
  - create session
  - reconnect session
  - end session
  - server restart simulation does not lose session
- Idempotency tests:
  - duplicate mutation returns prior result
  - conflicting mutation returns conflict response

## Acceptance Criteria

Phase 1 is complete when:

- Production forbidden-env audit is green.
- First RLS policy group is deployed and tested.
- Admin routes have DB role revalidation or documented exemption.
- P0 query/raw SQL/error leakage routes are patched.
- Shared media validator is used by canonical upload and sketch import.
- Sketch import has no process-local limiter and validates magic bytes.
- Offline mutation idempotency foundation exists.
- Voice sessions no longer depend on process-local state for correctness.

## Rollback

- RLS: roll forward with corrected policies; do not blanket-disable production RLS.
- Prisma migrations: keep additive; disable new code paths with feature flags.
- Route fixes: patch small groups and revert only the group that regresses.
- Media validator: keep old route-level validation as fallback until migrated.
- Voice persistence: keep old in-memory path behind temporary flag for one release.

## Out of Scope

- Full capture cockpit visual redesign.
- Full AI gateway migration.
- Full room graph/floorplan rebuild.
- Handoff package UI.

