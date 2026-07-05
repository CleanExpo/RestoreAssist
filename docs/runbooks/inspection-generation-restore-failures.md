---
title: Runbook — Report generation failures / restore-flow failures
version: 1.0.0
owner: Phill McGurk
applies_from: 2026-07-05
severity_default: P1 (P2 for a single ungrounded/degraded report, P1 for a systemic failure)
---

# Runbook — Report generation failures / restore-flow failures

This runbook covers two related but distinct failure classes named in the
release gate's "restore/job workflow failures" criterion:

1. **Inspection report generation** (`POST
   /api/reports/generate-inspection-report`) failing outright, or
   succeeding but producing a report **not grounded in real IICRC
   standards** (RA-6934).
2. **File restore jobs** (`StorageRestoreJob`) — restoring an original file
   from the Google Drive mirror back into primary storage — failing or
   stalling.

## Part A — Inspection report generation

### Symptom

- The report-generation UI shows an error / spinner that never resolves.
- A report is generated but reads generically (no `S500:2021 §N.x`-style
  citations) — this is the silent-degradation case RA-6934 exists to catch.
- HTTP 402 from the route when a workspace has no configured AI key
  (`NoWorkspaceKeyError`, expected behaviour post-RA-6932/RA-6921 — not a
  bug, no platform-key fallback by design).

### How to detect

Every degradation path in `app/api/reports/generate-inspection-report/route.ts`
(lines ~242-267) and in the composer itself
(`lib/standards-retrieval.ts` `degradedStandards()`, lines ~47-66) fires
`reportError()` with `stage` set to one of:

| `stage` | Meaning |
|---|---|
| `standards-ungrounded-report` | Report generated, but IICRC standards could not be grounded (`degradedReason` sub-tagged: `no_ai_key`, `drive_access_error`, `empty_standards_folder`, `retrieval_fatal_error`) |
| `standards-retrieval-threw` | The retrieval call itself threw before returning a degraded context (e.g. dynamic-import failure) |
| `standards-retrieval-degraded` | Fired inside the composer itself (`lib/standards-retrieval.ts`), one level below the route-level alert above |

These are structured `console.error("[error]", JSON.stringify(payload))`
calls (`lib/observability.ts` `reportError`) — Vercel Observability indexes
the `[error]` prefix. Filter Function logs for:

```
"stage":"standards-ungrounded-report"
```

There is no persisted per-document `degraded` flag queryable via SQL today
— `StandardsContext.degraded` is a return value consumed synchronously by
the route, not written to the `Report` row. The only durable record of a
degraded generation is the `[error]` log line above. **This is a real gap**
(see Monitoring gaps section in `docs/runbooks/README.md`): if you need to
know how many documents over the last 24h were ungrounded, you must scan
Vercel Function logs for the tag, not query the database.

### Triage steps

1. Filter logs for `stage:standards-ungrounded-report` over the incident
   window and read `degradedReason`:
   - `no_ai_key` → the workspace (or the composer's key resolution) has no
     usable Anthropic key. Check `resolveWorkspaceAiKey` results for the
     affected workspace — this is usually a BYOK configuration issue, not
     a platform outage.
   - `drive_access_error` → Google Drive service-account credentials
     invalid/expired, or the IICRC Standards folder permissions changed.
     Check `GOOGLE_DRIVE_STANDARDS_FOLDER_ID` and the service account's
     Drive access.
   - `empty_standards_folder` → the Drive folder itself has been emptied
     or moved. Verify folder ID `1lFqpslQZ0kGovGh6WiHhgC3_gs9Rzbl1` still
     resolves and still contains files.
   - `retrieval_fatal_error` → an unexpected exception in the retrieval
     composer; read the accompanying error message/stack in the same log
     line for the root cause.
2. If failures are widespread (`no_ai_key` or `drive_access_error` across
   many workspaces), treat as P1 — this is a systemic dependency outage,
   not a single customer's misconfiguration.
3. If it's a single ungrounded document for one workspace, this is P2 —
   fix the workspace's key/Drive config and have them regenerate.
4. Check `pnpm check:standards` (`scripts/check-standards-citations.ts`) is
   green in the latest CI run — this is a separate, build-time gate that
   catches stale-edition/fabricated-section citations in source code and
   the standards corpus JSON; it does not catch runtime degradation, but a
   red result here after a standards-corpus update is a related "why did
   this document look wrong" lead.

### Rollback / mitigation

- **Drive access broken:** this blocks ALL new generation from being
  properly grounded — treat as P1, prioritise restoring Drive
  service-account access over any other fix. Documents generated during
  the outage are ungrounded, not wrong-but-recoverable; once Drive access
  is restored, affected documents should be regenerated, not silently
  accepted.
- **No rollback for a bad AI response** — the fix is always
  root-cause-then-regenerate, since there's no cached "last known good"
  document to fall back to.

## Part B — File restore-job failures

### Symptom

A file that should have been restored from the Drive mirror back to
primary storage (`StorageRestoreJob`) is missing, or the restore UI shows
a stuck/failed job.

### How to detect

`StorageRestoreJob` (`prisma/schema.prisma` line ~5711) has a `status`
field (`RestoreJobStatus`: `PENDING` and others — check the enum in schema
for the full set). The `storage-restore` cron
(`app/api/cron/storage-restore`, `vercel.json` schedule `* * * * *`, every
minute) drains this queue via `processNextRestoreBatch`
(`lib/queue/storage-restore.ts`).

```sql
select "status", count(*), max("updatedAt") as most_recent
from "StorageRestoreJob"
group by 1
order by 2 desc;
```

A large `PENDING` backlog with an old `most_recent` update means the
per-minute cron has stopped draining the queue — check `CronJobRun` (if
`storage-restore` is wrapped in `runCronJob`; confirm at
`app/api/cron/storage-restore/route.ts`) or the raw route's own
`console.error("[Storage Restore Cron] Error:", err)` output in Vercel
Function logs for `route=/api/cron/storage-restore`.

There is also `storage-mirror-recovery` (`app/api/cron/storage-mirror-recovery`)
which handles the forward-direction mirror-job recovery — check both
crons' recent runs if files are neither mirroring out nor restoring back.

### Triage steps

1. Run the `StorageRestoreJob` status query above. Growing `PENDING`
   backlog → cron is stuck or erroring; check its logs.
2. A single job stuck (not a systemic backlog) → inspect that job's row
   for `sourceStoragePath`/`driveFileId` validity; the source Drive file
   may have been deleted or moved outside the app.
3. Verify `CRON_SECRET` is set correctly in the deploy environment —
   `verifyCronAuth` (`lib/cron/auth.ts`) rejects the cron's own scheduled
   invocation if the bearer token Vercel sends doesn't match, which looks
   identical to "cron stopped running" from the outside.

### Rollback / mitigation

- No destructive rollback needed — restore jobs are idempotent retries
  against the Drive mirror, not one-shot operations. Fixing the blocking
  cause (credentials, `CRON_SECRET`, Drive file availability) and letting
  the per-minute cron resume is the mitigation.

## Escalation

Widespread ungrounded-document generation or a stalled restore-job queue
affecting multiple customers is P1 per `docs/SUPPORT_SLA.md` ("AI
generation 5xx >5%" is the explicit P1 example there; a wave of
degraded/ungrounded documents is the same class of harm even though it
returns 200, not 5xx). A single ungrounded document or single stuck
restore job for one customer is P2. Any IICRC-miscitation-adjacent
incident (a customer relied on an ungrounded document as if it were
standards-cited) escalates to the founder immediately and uses
`docs/CUSTOMER_COMMS_TEMPLATE.md` Template E (compliance-grade incident),
not Template A.
