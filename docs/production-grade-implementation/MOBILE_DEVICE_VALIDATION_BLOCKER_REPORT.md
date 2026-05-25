# Mobile Device Validation Blocker Report

Date: 2026-05-25

## Scope

This report covers the remaining MOB-001 validation gap after the mobile offline queue, durable replay/idempotency, conflict fail-fast handling, and API reachability-backed online/offline state were implemented and validated locally.

## Current Verified State

- Worktree: `/private/tmp/RestoreAssist-phase1-main`
- Branch: `codex/phase-1-production-readiness-clean`
- Mobile validation path: standalone Expo package
- Mobile unit validation: `pnpm --dir mobile exec vitest run --config vitest.config.ts`
- Mobile type validation: `pnpm --dir mobile --ignore-workspace type-check`

Implemented and locally validated:

- queued JSON mutations persist in SQLite-backed storage
- duplicate mutation IDs return the existing queued row
- replay sends `Idempotency-Key` and `X-RestoreAssist-Mutation-Id`
- successful replay removes queued rows and triggers refresh
- retryable `5xx` / `408` responses remain pending until retry exhaustion
- non-retryable rejections, including `409` conflicts, fail fast and are not replayed again
- `/api/health` reachability updates the shared mobile `isOnline` state
- offline banner, sync status, settings status, and queue drain guard consume that shared state

## Blocker

Error: device/emulator network-toggle validation has not been run.

Cause: this shell has no authenticated/interactive iOS or Android simulator session, Expo Go runtime, or physical device session to toggle network state and observe app UI plus queue replay behavior end-to-end.

Fix: run the manual device validation below on a simulator or physical device with the mobile app pointed at the intended API environment.

Next action: execute the manual validation checklist and attach screenshots/logs before claiming MOB-001 fully device-validated.

## Manual Validation Commands

From `/private/tmp/RestoreAssist-phase1-main`:

```bash
pnpm --dir mobile --ignore-workspace type-check
pnpm --dir mobile exec vitest run --config vitest.config.ts
pnpm --dir mobile start
```

Then run one of:

```bash
pnpm --dir mobile ios
pnpm --dir mobile android
```

## Manual Device Checklist

1. Launch the app while the device has network access.
2. Confirm Settings shows `Network Status` as `Online`.
3. Confirm inspection screens do not show the offline banner while `/api/health` is reachable.
4. Disable device network access or enable airplane mode.
5. Wait for the reachability interval or background/foreground the app.
6. Confirm Settings shows `Offline` and inspection screens show the offline banner.
7. Create queued offline mutations for environmental data, moisture reading, and affected area.
8. Confirm queued count increases and the queue does not drain while offline.
9. Re-enable network access.
10. Confirm `/api/health` reachability flips the app back to online.
11. Confirm queued mutations drain successfully and do not duplicate server rows.
12. Force or simulate a `409` mutation conflict and confirm the row moves to failed without repeated replay attempts.

## Rollback Notes

- Reverting `mobile/lib/network/use-network-status.ts` and the root layout import returns mobile to the previous static online default.
- Reverting the conflict fail-fast slice returns non-retryable rejections to retry-until-exhaustion behavior.
- No package or native dependency changes were introduced by the reachability slice.
