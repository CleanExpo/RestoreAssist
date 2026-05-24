# Phase 3: Ship-It Validation

Date: 2026-05-24  
Goal: prove RestoreAssist can ship through controlled rings with safety, support, observability, and rollback.

## Scope

Included backlog tasks:

- REPORT-003: Handoff Package V1
- OBS-001: Ship-Readiness Dashboard
- OBS-002: AI Cost and Budget Monitoring
- OBS-003: Offline Sync and Queue Monitoring
- UX-001: First-Run Setup Agent Scope
- UX-003: Role-Based Navigation Simplification
- SHIP-001: Release Gate Checklist Automation
- SHIP-002: Pilot Ring Runbooks
- SHIP-003: App Store and Play Store Production Verification
- SEC-003: RBAC Enforcement Sweep
- SEC-004: Audit Trail Coverage
- SEC-005: CSP and XSS Hardening Plan

## Release Rings

### Ring 0: Internal

Required flows:

- Create user/workspace.
- Create inspection.
- Capture photo.
- Capture moisture reading.
- Capture voice observation.
- Import/draw floorplan.
- Generate source-linked report draft.
- Prepare handoff package.
- Sync after offline capture.

Exit:

- No manual database fix required.
- Release dashboard shows the run.
- No P0/P1 security or data-loss issue.

### Ring 1: Friendly Pilot

Scope:

- One business.
- One real job if possible.
- Hard AI and media spend caps.
- Human support on standby.

Exit:

- No lost evidence.
- Technician completes job flow without training over 15 minutes.
- Office accepts handoff package.
- Any integration failure is visible and retryable.

### Ring 2: Remaining Pilots

Scope:

- Two additional businesses.
- Multi-user invite and role validation.
- Offline scenario explicitly tested.

Exit:

- No tenant-isolation issue.
- No duplicate replay issue.
- Support burden is manageable.

### Ring 3: Paid Early Access

Scope:

- Up to 10 businesses.
- Up to 100 technicians.
- Feature flags for AI gateway, capture cockpit, room graph, and handoff package.

Exit:

- Activation, retention, cost per inspection, and support volume are measured.
- Production readiness gate remains green.

## Test Requirements

- Full release gate:
  - `pnpm type-check`
  - `pnpm lint`
  - unit tests
  - route audit
  - env audit
  - RLS audit
  - smoke tests
- E2E:
  - auth/login
  - onboarding
  - field capture
  - offline replay
  - voice observation
  - sketch/floorplan
  - report generation
  - handoff package
  - public token revoke/expiry
- Security:
  - RBAC matrix
  - public token threat model
  - audit trail assertions
  - CSP/XSS smoke
- Observability:
  - API errors
  - AI cost
  - media cost
  - queue failures
  - sync failures
  - integration failures

## Acceptance Criteria

Phase 3 is complete when:

- Release gate automation is blocking.
- Ship-readiness dashboard covers API, AI, media, sync, reports, integrations, and security.
- Handoff package can be created, sent/shared, and revoked.
- Pilot ring runbooks are complete and tabletop-tested.
- RBAC and audit trail coverage meet release gate.
- App Store and Play Store preflight is documented and passable.
- Rollback plan is tested for feature flags and deploy rollback.

## Rollback

- Feature-flag capture cockpit, AI gateway task groups, RoomGraph use, handoff package, and realtime voice.
- Keep additive migrations; avoid destructive schema changes during pilot rings.
- Disable integrations independently.
- Preserve offline queue data across rollback.
- RLS fixes roll forward only.
- Communicate pilot rollback with exact affected workflow and next action.

## Out of Scope

- Large-scale paid launch.
- Full estimator marketplace.
- Full ESX/FML export.
- Full 3D scan requirement.

