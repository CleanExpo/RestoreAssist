# Implementation Roadmap

Date: 2026-05-24

## Roadmap Shape

This roadmap optimizes for shipping a credible AU/NZ restoration operations platform without overbuilding a generic field-service suite.

## Phase 0: Ship Gate Stabilisation

Duration: 1 week  
Outcome: production risk is contained and CI is trustworthy.

Tasks:

- Fix local/dev dependency path so `pnpm type-check` is runnable everywhere.
- Close RA-4956 go-live gate.
- Remove or justify `NODE_TLS_REJECT_UNAUTHORIZED`.
- Create P0 RLS epic and begin highest-risk policy rollout.
- Add API route audit script for auth, admin role revalidation, query caps, raw SQL, and 500 bodies.
- Make deploy workflow status explicit: Vercel Git deploy vs GitHub Actions.
- Document production Supabase project and decommission decision for old project.

Exit criteria:

- `pnpm type-check`, `pnpm lint`, smoke tests, and route audit pass in CI.
- Production forbidden-env audit is green.
- RLS rollout plan has owners and first protected table group deployed.

## Phase 1: Mobile Field Core

Duration: 2-3 weeks  
Outcome: a technician can capture job evidence quickly and safely, even with poor connectivity.

Tasks:

- Build field capture cockpit.
- Implement local event queue and idempotency API.
- Persist photos/audio/sketch/readings offline.
- Add sync status and conflict UI.
- Persist voice sessions and observations.
- Add room selector and evidence status ring.
- Add required-photo/stage checklist.

Exit criteria:

- Network-off test can capture photo, moisture reading, voice note, sketch change, and sync later.
- No duplicated server writes after replay.
- Technician can start a job and capture first evidence in under 30 seconds.

## Phase 2: AI Gateway and Cost Controls

Duration: 2 weeks  
Outcome: AI is cheaper, safer, and provider-portable.

Tasks:

- Add provider-neutral AI gateway.
- Define task policy and model allowlist.
- Move OpenAI transcription and Anthropic services behind gateway.
- Add per-workspace/task/model budget enforcement.
- Add redaction/data classification.
- Add prompt registry and eval IDs.
- Implement low-cost model defaults for basic tasks.
- Add AI cost dashboard.

Exit criteria:

- Every paid AI call logs `AiUsageLog`.
- Every paid AI call passes subscription/budget gate.
- A model swap requires eval pass.
- Basic tasks route to low-cost/local provider by default.

## Phase 3: Floorplan and Sketch Acceleration

Duration: 3-4 weeks  
Outcome: a normal residential water loss can be mapped in under 5 minutes.

Tasks:

- Introduce `RoomGraph` data model.
- Normalize manual sketch, floorplan image, and property-data underlay into room graph.
- Replace in-memory sketch-import rate limiter.
- Add magic-byte validation to sketch import.
- Add calibration, snap, room labels, moisture pins, and photo pins.
- Add property-data prefetch behind workspace setting.
- Export floorplan in report package.

Exit criteria:

- E2E sketch workflow creates rooms, scale, moisture pins, photo pins, and report export.
- Room graph is used by moisture, photos, scope, and report sections.

## Phase 4: Claim-Ready Report and Handoff

Duration: 3 weeks  
Outcome: admin/insurer handoff is one controlled package, not scattered exports.

Tasks:

- Build continuous report preview.
- Link report sections to evidence.
- Add handoff package model and UI.
- Include PDF, photo index, sketch, drying log, scope, invoice, audit log, JSON.
- Add insurer profile requirements to completeness checks.
- Add retry CTA for integration sync failures.

Exit criteria:

- A completed pilot job can generate a handoff package with all evidence and blocker status.
- Admin can send/share/revoke access.

## Phase 5: Integrations and Automation

Duration: 3-5 weeks  
Outcome: RestoreAssist fits into existing contractor operations.

Tasks:

- Stabilize Xero sprint.
- Strengthen ServiceM8/Simpro/Ascora import/export strategy.
- Add async integration queue with retry and dead-letter UI.
- Add customer/admin automations: reminders, daily progress, missing evidence, invoice follow-up.
- Add Google Drive/OneDrive storage mirror status and recovery.

Exit criteria:

- Job -> report -> invoice -> payment sync path passes real pilot smoke.
- Integration failures are visible and retryable.

## Phase 6: Scale, Security, and Market Readiness

Duration: ongoing  
Outcome: platform can scale to multi-tenant AU/NZ restoration teams.

Tasks:

- Complete RLS coverage.
- Remove TypeScript/ESLint build ignores.
- Add tenant RBAC UI.
- Add security monitoring and audit exports.
- Add performance budgets.
- Add onboarding and support analytics.
- Harden App Store/Play Store release pipeline.

Exit criteria:

- Production readiness score is green.
- App store submissions are accepted.
- Pilot rollout completes without rollback.

## Workstreams

| Workstream | Owner Type | First Deliverable |
|---|---|---|
| Security | Senior backend | RLS policies and route audit |
| Mobile/offline | Mobile/full-stack | Local queue and sync cockpit |
| AI | AI platform engineer | Provider-neutral gateway |
| Sketch/floorplan | Frontend/product engineer | RoomGraph + import/trace flow |
| Reporting | Full-stack | Handoff package |
| Integrations | Backend | Xero stability and sync retries |
| UX/onboarding | Product/full-stack | Technician cockpit and setup agent |

