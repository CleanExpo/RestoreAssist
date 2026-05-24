# Ship-It Plan

Date: 2026-05-24

## Ship Strategy

Ship in controlled rings:

1. Internal dogfood.
2. One friendly pilot.
3. Two remaining pilots.
4. Paid early access.
5. Broader AU/NZ release.

Do not ship broad until security and offline capture are credible.

## Release Gates

### Gate 1: Security

Must pass:

- RLS policy coverage for production-exposed tables.
- Forbidden env audit.
- Secret rotation/audit complete.
- Admin route revalidation audit.
- Public token route audit.
- Upload validation audit.

Blockers:

- RLS disabled on sensitive tenant tables.
- `NODE_TLS_REJECT_UNAUTHORIZED` in production.
- Service-role or provider secrets in repo/history.

### Gate 2: Build and Test

Must pass:

- `pnpm type-check`.
- `pnpm lint`.
- Unit tests for AI gateway, voice parser, upload validation, progress guards.
- E2E smoke for auth, onboarding, field capture, sketch, report, handoff.
- No ignored critical dependency advisories.

Current issue:

- In this shell, `pnpm` and `corepack` are not on PATH, so local verification could not run.

### Gate 3: Field Workflow

Must pass:

- Create job.
- Capture photo evidence.
- Capture moisture reading.
- Capture voice observation.
- Draw/import floorplan.
- Generate report draft.
- Prepare handoff package.
- Sync after offline capture.

### Gate 4: AI Safety and Cost

Must pass:

- Subscription gate before paid AI calls.
- Atomic credit deduction where credits apply.
- Workspace daily budget.
- Per-task max cost.
- Prompt/model version logged.
- AI output shown as editable draft.
- No invented IICRC citations in eval set.

### Gate 5: Operational Readiness

Must pass:

- Sentry errors visible.
- AI cost dashboard visible.
- Queue/dead-letter dashboard visible.
- Cloudinary/storage usage visible.
- Integration failure retry path visible.
- Rollback runbook tested.

## Pilot Ring Plan

### Ring 0: Internal

Use synthetic jobs:

- Cat 1/Class 1 small bathroom.
- Cat 2/Class 2 kitchen/living.
- Cat 3/Class 4 multi-room.
- Mould condition 2.
- Fire/smoke small contained.

Success:

- Every flow reaches handoff package without manual database fixes.

### Ring 1: Friendly Pilot

Run one Beyond Clean-style pilot.

Success:

- One real job captured.
- No lost evidence.
- Office accepts report/handoff.
- Technician completes without training session longer than 15 minutes.

### Ring 2: Remaining Pilots

Add two teams.

Success:

- Multi-user workspace and invites pass.
- Integration sync does not block field work.
- Support burden is manageable.

### Ring 3: Paid Early Access

Limit:

- 10 businesses.
- 100 technicians.
- Hard AI spend caps.

Success:

- Activation and retention measured.
- Cost per inspection within target.
- No P0 security incidents.

## Daily Ship Checklist

- Latest commit and branch known.
- Database migrations reviewed.
- Prisma generate run after schema changes.
- Type-check/lint/test gate green.
- Env diff reviewed.
- RLS/policy diffs reviewed.
- Rollback command known.
- Sentry release created.
- Smoke test run against preview.
- Pilot user notified only after smoke passes.

## Rollback Plan

- Keep migrations additive until pilot stability.
- Feature-flag capture cockpit, AI gateway, floorplan import, and handoff package.
- Disable paid AI task types independently.
- Disable integrations independently.
- Preserve offline queue data during rollback.
- Do not roll back RLS by blanket disabling; fix policy exceptions deliberately.

## Support Readiness

Create support macros for:

- Cannot sign in.
- App offline or sync stuck.
- Photo failed to upload.
- Voice transcript wrong.
- Floorplan import wrong.
- Report missing evidence.
- Integration sync failed.
- AI budget reached.

## Ship-Ready Definition

RestoreAssist is ship-ready when a new AU/NZ restoration technician can:

1. Accept invite.
2. Open assigned job.
3. Capture evidence with minimal taps.
4. Use voice where typing is painful.
5. Build or import a floorplan quickly.
6. See what is missing before leaving site.
7. Generate a claim-ready report package.
8. Recover safely from offline conditions.

