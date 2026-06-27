# Re-hydrate Primary Storage from Google Drive — Design (v1)

**Date:** 2026-06-27
**Status:** Approved — ready for implementation plan
**Author:** Phill McGurk (with Claude Code)
**Scope:** Product feature in RestoreAssist. This is spec #2 of the Google Drive work; the personal machine-backup tool was spec #1 (separate).

---

## Background

RestoreAssist already has a mature per-organization Google Drive integration: a **dual-write** model where Supabase is the primary hot path and Google Drive is an **async mirror**, driven by a durable Prisma-backed `StorageMirrorJob` queue (retry + exponential backoff + dead-letter), per-org OAuth/PKCE connect, AES-256-GCM encrypted tokens, and a weekly token-refresh cron. Photos, reports, invoices, job packages, handover packages, and audit logs all enqueue to the customer's Drive on the relevant events.

The notable hole: **Drive is write-only today.** On the Drive provider, `download()`, `delete()`, `getSignedUrl()`, and `listByInspection()` throw `NotImplementedError`. You can push a customer's data to their Drive but cannot pull it back. This spec closes the highest-value half of that gap: **re-hydrating lost/pruned Supabase file data from the org's Drive.**

## Goal

Let an org **admin** deliberately restore lost or pruned **file blobs** back into Supabase from the org's own Google Drive, using the existing mirror-job records as the recovery index, with **chain-of-custody integrity verification**.

## Scope boundary (important)

- Restores **blob data** (the files: photos, reports, invoices, job/handover package ZIPs, audit-log files) and **relinks them to existing DB rows**.
- Does **NOT** reconstruct deleted DB rows — Postgres rows are covered by Supabase PITR, a separate concern.
- A restore job only targets files that have a `COMPLETED` `StorageMirrorJob` (something we verifiably pushed to Drive, with a `driveFileId`).
- v1 trigger is **manual admin action only**. Automatic reconciliation sweep and on-access lazy fallback are explicitly future specs.

## Success criteria

1. An org admin can preview (count + estimated bytes) and then run a restore scoped to the **whole org** or a **single inspection/job**.
2. Each file is restored Drive → Supabase at its original `sourceStoragePath`, with image kinds regenerating compressed/thumbnail variants.
3. Restored bytes are **SHA-256 verified** against the stored chain-of-custody hash where one exists; a mismatch **fails** that job (never silently accepted).
4. A whole-org restore of thousands of files is **durable and resumable** (survives crashes/timeouts) and observable via a jobs table in Settings → Storage.
5. Default mode is **non-destructive** (`missing`: skip files already present in Supabase); `force` overwrite is opt-in.
6. All actions are admin-gated and written to the audit log.

---

## Architecture (Approach A — durable restore queue, reflecting the mirror queue)

A near-symmetric reflection of the existing `StorageMirrorJob` system, reusing its proven claim/lock + retry + dead-letter + rate-limit/circuit-breaker machinery, but kept as a **separate** table/queue so push and pull semantics never tangle.

```
lib/cloud-mirror/drive.ts             + downloadFromDrive(tokens, fileId)   // symmetric to uploadToDrive(); same withBackoff retry
lib/storage/google-drive-provider.ts  + downloadByFileId(fileId)            // replaces the NotImplementedError read path; reads org tokens
lib/restore/plan.ts                   computeRestorePlan(orgId, scope, mode) // selects COMPLETED mirror-jobs to reverse; preview counts/bytes
lib/restore/rehydrate.ts              rehydrateOne(restoreJob)              // the restore engine (download → upload → verify → reconcile)
lib/queue/storage-restore.ts          queue: queueRestoreJob / processNextBatch / processJob / handleJobFailure / stats / retry / cancel / cleanup
prisma/schema.prisma                  + StorageRestoreJob model + RestoreJobStatus enum + Organization relation (additive migration)
app/api/storage/restore/route.ts            GET = preview/stats, POST = enqueue
app/api/storage/restore/[jobId]/retry/route.ts
app/api/cron/storage-restore/route.ts       drains queue every minute (CRON_SECRET auth)
app/dashboard/settings/storage/*            + "Restore from Drive" panel + RestoreJobsTable (reuse MirrorJobsTable pattern)
vercel.json                                 + cron entry "/api/cron/storage-restore" every minute
```

### New persistence — `StorageRestoreJob`

Mirrors `StorageMirrorJob`'s shape. Key fields:
- `id`, `orgId` (relation, cascade delete), `sourceMirrorJobId` (the COMPLETED mirror job being reversed), `kind` (reuse `MirrorJobKind`).
- `sourceStoragePath`, `filename`, `mimeType`, `driveFileId` (copied from the mirror job at enqueue time so restore is self-contained even if the mirror row is later cleaned up).
- `mode` (`MISSING` | `FORCE`).
- `status` (`RestoreJobStatus`: `PENDING` | `PROCESSING` | `COMPLETED` | `SKIPPED` | `FAILED` | `DEAD_LETTER`).
- Result: `restoredBytes`, `restoredSha256`, `expectedSha256` (nullable), `lastError`.
- Retry: `attempts`, `lastAttemptAt`, `nextAttemptAt`.
- Idempotency: `@@unique([orgId, sourceMirrorJobId])`; indexes `@@index([orgId, status])`, `@@index([status, nextAttemptAt])`.

## The restore engine — `rehydrateOne(restoreJob)`

1. **Skip-if-present** (`mode=MISSING`, default): if `sourceStoragePath` already exists in Supabase, mark `SKIPPED`. (`mode=FORCE` overwrites.) Non-destructive by default — the same ethos as spec #1.
2. Resolve the org's encrypted Drive tokens; `downloadFromDrive(driveFileId)` → bytes (with the existing `withBackoff` retry on 429/5xx).
3. Re-upload to Supabase at `sourceStoragePath`:
   - **Image kinds** (`PHOTO`): re-run the normal Supabase upload pipeline so compressed + thumbnail variants regenerate.
   - **Document/ZIP kinds** (`REPORT`, `INVOICE`, `JOB_PACKAGE`, `HANDOVER_PACKAGE`, `AUDIT_LOG`): write the single object at its path.
4. **Integrity verify:** compute SHA-256 of the restored bytes. If an `expectedSha256` is available (chain-of-custody hash for the item), compare; **mismatch → `FAILED`** with a specific integrity error. If no reference hash exists, store `restoredSha256` for audit and proceed.
5. **Reconcile** the relevant DB row's storage path/URLs if they drifted from `sourceStoragePath`. Mark `COMPLETED` with `restoredBytes` + `restoredSha256`.

## Data flow & state

1. Admin opens Settings → Storage → "Restore from Drive", picks **scope** (whole org or one inspection/job) and **mode** (missing/force).
2. **Preview** (`GET /api/storage/restore?...`) runs `computeRestorePlan` read-only and returns `{ fileCount, estimatedBytes }` — no writes.
3. Admin confirms → `POST /api/storage/restore` enqueues one `StorageRestoreJob` per file (idempotent on `(orgId, sourceMirrorJobId)`).
4. The cron (`/api/cron/storage-restore`, every minute) calls `processNextBatch`: claims `PENDING` jobs whose `nextAttemptAt <= now()` via optimistic lock (`PENDING→PROCESSING`), runs `rehydrateOne`, and records `COMPLETED`/`SKIPPED`/`FAILED`. Network writes are wrapped in the existing `GOOGLE_DRIVE` rate-limiter + `google-drive-restore` circuit-breaker.
5. `RestoreJobsTable` in Settings polls `GET /api/storage/restore` for live counts/status.

## Error handling

- **`invalid_grant`** (revoked/expired refresh token) → dead-letter + the same "reconnect at Settings → Storage" owner notification the mirror queue already emits.
- **Transient (429/500/502/503)** → exponential backoff `30s × 2^(attempt-1)`, capped at 30 min, max 5 attempts, then dead-letter.
- **Integrity mismatch or Drive file missing/deleted** → immediate `FAILED` with a specific, surfaced error; admin sees it in `RestoreJobsTable` and can retry via `POST /api/storage/restore/[jobId]/retry`.
- Restore is **never destructive beyond a single file overwrite**, and only in `FORCE` mode; it deletes nothing.

## Security & audit

- **Org owner/admin only** on every route; verify `job.orgId === user.organizationId` and role on each request.
- Every restore initiation (scope, mode, file count) and each job outcome is written to the **audit log** (chain-of-custody requirement; AU compliance dimension).
- Drive tokens remain AES-256-GCM encrypted; no token or secret values logged.
- Preview is strictly read-only (asserted by test).

## Testing

- **Engine** (`rehydrate.ts`): download→upload→verify happy path; **hash mismatch → FAILED**; `MISSING` skip vs `FORCE` overwrite; image variant regeneration vs document single-write; Drive-file-gone → FAILED.
- **Queue** (`storage-restore.ts`): claim/optimistic-lock, transient retry/backoff, dead-letter after max attempts, idempotency (P2002 → existing id), `invalid_grant` → dead-letter + notification.
- **Plan/preview** (`plan.ts`): correct file count + byte estimate; org-scope vs inspection-scope filtering; only `COMPLETED` mirror-jobs selected.
- **API**: auth + org-ownership + admin-role enforcement on every route; preview performs no writes.
- **Drive read** (`downloadByFileId` / `downloadFromDrive`): decrypts org tokens, retries on 429/5xx, surfaces auth errors.
- Follow existing test patterns (mock `googleapis`, `prisma`, `credential-vault`), mirroring `lib/queue/__tests__/storage-mirror.queue.test.ts`.

## Out of scope (v1)

- Automatic reconciliation sweep (cron that detects missing Supabase files and auto-restores) — future spec.
- On-access lazy fallback (serve from Drive when Supabase 404s) — future spec.
- DB-row reconstruction — covered by Supabase PITR.
- Non-Drive providers (S3/GCS/Azure/OneDrive/iCloud) and offboarding export.

## Open questions / future work

- Whether to backfill `expectedSha256` for historical items that predate chain-of-custody hashing (affects how many restores can be integrity-verified vs audit-only).
- Whether to later promote the restore engine behind an automatic reconciliation sweep (the natural next spec).
- Per-org Drive quota awareness during large restores (reuses the same gap noted for the mirror pipeline).
