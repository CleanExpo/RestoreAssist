# SP-E: Storage BYOK Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Google Drive into the Organization-level `StorageProvider` abstraction so that when a tenant has `Organization.storageProvider = GOOGLE_DRIVE`, every photo, report, and invoice write becomes a **dual-write**: primary to Supabase (latency + reliability stay constant), and a queued background mirror to the tenant's own Drive. Ship the close-package export hook (`exportClosedJobToBYOKStorage`) that SP-A and SP-J will call, and surface mirror health in a `/dashboard/settings/storage` page so tenants can see what's synced, what's queued, and what failed.

**Architecture:** Three converging layers on top of existing scaffolding.

1. **Provider layer** — `lib/storage/google-drive-provider.ts` implements `StorageProvider` against Drive, reusing the OAuth + folder-convention plumbing already in `lib/cloud-mirror/drive.ts`. The provider does NOT replace Supabase for primary writes when chosen — instead, the dispatcher `lib/storage/index.ts` continues to return Supabase as the working primary, and the caller (e.g. `app/api/inspections/[id]/photos/route.ts`) enqueues a mirror job after each successful Supabase upload. This is "dual-write via queue", not "swap-storage-engines".
2. **Queue layer** — `lib/queue/storage-mirror.ts` is a new Prisma-backed durable queue modelled exactly on the existing `lib/integrations/sync-queue.ts` template (priority + status + retry + dead-letter notification + cleanup), backed by a new `StorageMirrorJob` Prisma model. A new cron route `/api/cron/storage-mirror` calls `processNextBatch` on a 60-second tick.
3. **Hook layer** — `lib/queue/exportClosedJobToBYOKStorage.ts` is the single entry point SP-A's `POST /api/inspections/[id]/close` route fires fire-and-forget. It assembles the close-package ZIP (final report PDF + all photos + invoice PDF + audit-log JSON) and enqueues one final `StorageMirrorJob` of kind `JOB_PACKAGE` for the orchestrator to upload to `<gdrive>/RestoreAssist/<job-date>-<inspection-id>/job-package.zip`.

**Tech stack:** Next.js 15 App Router, Prisma 5, Postgres, `googleapis` SDK (already a dep), `archiver` for ZIP assembly (already used by `bulk-export-zip` route — verify), existing `lib/integrations/{retry,circuit-breaker,rate-limiter}.ts` helpers, existing `lib/cloud-mirror/drive.ts` Google Drive client. AES-256-GCM at-rest encryption for OAuth tokens via `lib/credential-vault.ts` is owned by the Onboarding hotfix (prerequisite).

**Dependencies (prerequisite, NOT in this plan):** the Onboarding hotfix ships first and provides:

- `/api/oauth/google-drive/start` + `/callback` routes (Google OAuth 2.0 PKCE with `drive.file` + `drive.appdata` scopes)
- `StorageProviderType` enum extended with `GOOGLE_DRIVE` and `ONEDRIVE` values
- `Organization.storageProviderRefreshToken` (encrypted) + `Organization.storageProviderAccessToken` + `Organization.storageProviderAccountEmail` columns
- `StorageCard.tsx` wiring (post-OAuth: card shows "Connected as `<gmail>`")

This plan **assumes those exist** and references them by name; it does NOT re-spec them.

---

## File structure

**New files:**

- `lib/storage/google-drive-provider.ts` — `class GoogleDriveStorageProvider implements StorageProvider`. Reads tokens from `Organization.storageProviderRefreshToken` (decrypted via credential-vault), refreshes via google-auth-library, then delegates the actual file-upload mechanics to a shared internal helper that `lib/cloud-mirror/drive.ts` is refactored to expose (`uploadToDrive(orgId, jobNumber, buffer, filename, mimeType)`). The provider is **read-mostly** for `download`, `getSignedUrl`, `listByInspection`; its `upload`/`uploadBatch` paths are NOT called on the hot photo-upload write path (Supabase is). They exist for completeness so a future "fully BYOK, skip Supabase" mode can opt in.
- `lib/storage/index.ts` — **modified** to add the `GOOGLE_DRIVE` case to the `getStorageProvider` switch (returns the new provider for `download`/`listByInspection` calls but does NOT change the primary-write path).
- `lib/storage/dual-write.ts` — new helper exporting `enqueueMirror(entity: { kind, id, orgId, storagePath, filename, mimeType })`. Called from the photo-upload route, report-PDF generation, and invoice-PDF generation after their Supabase write succeeds. Reads `Organization.storageProvider` and no-ops if not `GOOGLE_DRIVE`. Idempotent on `(kind, entityId)`.
- `lib/queue/storage-mirror.ts` — Prisma-backed durable queue. Exports `queueMirrorJob(input)`, `processNextBatch({ maxJobs })`, `getMirrorQueueStats(orgId)`, `retryJob(jobId)`, `cancelJob(jobId)`, `cleanupMirrorQueue()`. Internals: claim a `PENDING` row with optimistic `updateMany` lock, download the original from Supabase via `SupabaseStorageProvider.download`, resolve the GDrive provider for the org, push the bytes to Drive, mark `COMPLETED` and record `driveFileId`. Exponential backoff: `2^attempt * 30s`, capped at 30min, max 5 attempts. On 5th failure: `status=FAILED`, `[DEAD-LETTER]` log prefix, Notification row to org owner (mirror of `sync-queue.ts` dead-letter path).
- `lib/queue/exportClosedJobToBYOKStorage.ts` — exports `exportClosedJobToBYOKStorage(inspectionId: string): Promise<{ storageKey: string; byteSize: number; mirrorJobId: string }>`. **(See Cross-plan reconciliation note below — signature was upgraded from `Promise<void>` so SP-A can persist the storage key.)** Loads inspection + linked Report + linked Invoice + photos + AuditLogs in one transaction-read, generates the close-package ZIP via the existing `archiver` pipeline (reuse the `app/api/inspections/[id]/bulk-export-zip` route's stream-builder factored into `lib/exports/job-package-zip.ts`), stores the ZIP at a Supabase path `closures/<orgId>/<inspectionId>/job-package.zip`, then enqueues a `StorageMirrorJob` of kind `JOB_PACKAGE` for the Drive folder `<job-date>-<inspection-id>/job-package.zip`. Fire-and-forget at the caller; never throws to caller.
- `lib/exports/job-package-zip.ts` — extracted from `app/api/inspections/[id]/bulk-export-zip/route.ts`. Exports `buildJobPackageStream(inspectionId)` returning a `Readable` + `sizeEstimate`. Shared by the bulk-export route AND `exportClosedJobToBYOKStorage`.
- `app/api/cron/storage-mirror/route.ts` — Vercel cron handler, GET, header-auth via `CRON_SECRET`, calls `processNextBatch({ maxJobs: 50 })`. Wired to `vercel.json` cron schedule `*/1 * * * *`.
- `app/dashboard/settings/storage/page.tsx` — server component: connection status block (provider + connected-as email + "Disconnect" button), mirror queue table (last 50 jobs, status badge, attempts, last error, "Retry" button on FAILED), workspace-wide last-sync timestamp, total bytes mirrored. Reuses existing dashboard chrome.
- `app/api/storage/mirror-jobs/route.ts` — GET (list jobs for current user's org, paginated) + POST `/retry/[jobId]` (admin/owner only) for the page's interactivity.
- `prisma/migrations/<timestamp>_sp_e_storage_mirror_job/migration.sql` — adds `StorageMirrorJob` table + enum values + indexes.

**Modified files:**

- `prisma/schema.prisma` — add `StorageMirrorJob` model; add `MirrorJobKind` enum (`PHOTO | REPORT | INVOICE | JOB_PACKAGE | AUDIT_LOG`); add `MirrorJobStatus` enum (`PENDING | PROCESSING | COMPLETED | FAILED`). Onboarding hotfix already extended `StorageProviderType` with `GOOGLE_DRIVE` — verify before migration.
- `app/api/inspections/[id]/photos/route.ts` — after the existing `storageProvider.upload(...)` call (line 259) and after the `prisma.inspectionPhoto.create` succeeds, call `enqueueMirror(...)`. Wrapped in try/catch — mirror failure must never break the upload response.
- `app/api/reports/[id]/pdf/route.ts` (or wherever Report PDF is generated and uploaded) — same enqueue pattern after the Supabase write.
- `app/api/invoices/[id]/pdf/route.ts` — same pattern.
- `lib/cloud-mirror/drive.ts` — refactor to export a token-source-agnostic `uploadToDrive({ accessToken, refreshToken, jobNumber, filename, mimeType, data })` helper. Existing user-scoped `DriveCloudMirror.upload` calls this with tokens from `Account`; new `GoogleDriveStorageProvider.upload` calls it with tokens from `Organization`. No behaviour change for existing callers.
- `vercel.json` — add `{ "path": "/api/cron/storage-mirror", "schedule": "*/1 * * * *" }`.

---

## Prisma migration (single additive migration)

```prisma
enum MirrorJobKind {
  PHOTO
  REPORT
  INVOICE
  JOB_PACKAGE
  AUDIT_LOG
}

enum MirrorJobStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}

model StorageMirrorJob {
  id             String          @id @default(cuid())
  orgId          String
  organization   Organization    @relation(fields: [orgId], references: [id], onDelete: Cascade)
  kind           MirrorJobKind
  status         MirrorJobStatus @default(PENDING)

  // Soft FKs — only ONE is set per row (matches kind). No relation declared to
  // keep deletions independent (a deleted Photo shouldn't cascade-delete its
  // mirror history; we want the audit trail to outlive the source row).
  photoId        String?
  reportId       String?
  invoiceId      String?
  inspectionId   String? // For JOB_PACKAGE + AUDIT_LOG

  // Source — where we read the bytes from (Supabase path)
  sourceStoragePath String
  filename          String
  mimeType          String

  // Result — populated on COMPLETED
  driveFileId    String?
  driveViewUrl   String?

  attempts       Int      @default(0)
  lastError      String?  @db.Text
  lastAttemptAt  DateTime?
  nextAttemptAt  DateTime @default(now())

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  completedAt    DateTime?

  @@index([orgId, status])
  @@index([status, nextAttemptAt])  // queue scan
  @@index([createdAt])
  @@unique([orgId, kind, photoId, reportId, invoiceId, inspectionId], name: "idempotency")
}
```

The `@@unique` composite (with nullable fields collapsing on Postgres) gives **enqueue idempotency** — the same photo can never be queued twice. Migration is purely additive: no existing column is altered, no data backfill required.

---

## Task decomposition (TDD, 5-step blocks)

### Block 1 — Prisma model + migration (½ day)

1. **Write failing test**: `lib/queue/__tests__/storage-mirror.model.test.ts` — asserts `prisma.storageMirrorJob.create({ data: validMinimalInput })` succeeds, and a second create with identical idempotency-key fails on the composite unique.
2. **Add model** to `prisma/schema.prisma` (enum + model exactly as above).
3. **Generate migration**: `pnpm prisma migrate dev --name sp_e_storage_mirror_job --create-only`. Inspect SQL — must be purely additive.
4. **Apply + verify**: `pnpm prisma migrate dev`, `pnpm prisma generate`. Test passes.
5. **Type-check + lint pass**: `pnpm type-check && pnpm lint`.

### Block 2 — `GoogleDriveStorageProvider` (1 day)

1. **Write failing test**: `lib/storage/__tests__/google-drive-provider.test.ts` mocks `googleapis` + `prisma.organization.findUnique`; asserts `upload()` resolves with `UploadOutput` shape and calls the shared `uploadToDrive` helper with org-scoped tokens.
2. **Refactor `lib/cloud-mirror/drive.ts`** to export `uploadToDrive({ accessToken, refreshToken, jobNumber, filename, mimeType, data })`. Existing `DriveCloudMirror.upload` delegates to it. Run existing cloud-mirror tests — must still pass.
3. **Implement `lib/storage/google-drive-provider.ts`**. `upload` reads `Organization.storageProviderRefreshToken` (decrypt via `lib/credential-vault.ts`), exchanges for an access token, calls `uploadToDrive`, returns `UploadOutput` with `originalUrl = driveViewUrl`, `compressedUrl/thumbnailUrl = ""` (Drive doesn't do compression — caller already has the Supabase-compressed URLs for hot reads).
4. **Wire `lib/storage/index.ts`** — add `case "GOOGLE_DRIVE": return new GoogleDriveStorageProvider(orgId);` to the dispatcher switch.
5. **Verify**: test passes; `getStorageProvider(gdriveOrgId)` returns the new provider.

### Block 3 — `lib/queue/storage-mirror.ts` durable queue (1.5 days)

1. **Write failing integration test**: `lib/queue/__tests__/storage-mirror.queue.test.ts` — happy path (enqueue → processNextBatch → marked COMPLETED, `driveFileId` populated), retry path (mock Drive 503 → row stays PENDING, `attempts` incremented, `nextAttemptAt` advanced), dead-letter path (5 failures → status=FAILED, Notification row created), idempotency (double-enqueue same photo → second is no-op).
2. **Implement `queueMirrorJob`** with the optimistic-lock + idempotency pattern from `sync-queue.ts:40-82`.
3. **Implement `processNextBatch`** — claim `PENDING` with `nextAttemptAt <= now()`, lock to `PROCESSING`, download from Supabase via `new SupabaseStorageProvider().download(sourceStoragePath)`, resolve org's GDrive provider, call `uploadToDrive`, mark COMPLETED. Wrap each job in the existing `withRateLimit("google-drive")` + `withCircuitBreaker("google-drive-mirror")` + `retryWithExponentialBackoff` helpers from `lib/integrations/`.
4. **Implement dead-letter** mirror of `sync-queue.ts:215-247` — `[DEAD-LETTER]` log prefix + Notification row to org owner with deep-link to `/dashboard/settings/storage`.
5. **Verify**: all 4 test cases green.

### Block 4 — Dual-write hook + photo route wiring (½ day)

1. **Write failing test**: `app/api/inspections/[id]/photos/__tests__/dual-write.test.ts` — POST a photo to an org with `storageProvider=GOOGLE_DRIVE`; assert Supabase write happened AND a `StorageMirrorJob` row was created with `kind=PHOTO`, `photoId=<new id>`. Second test: same POST to an org with `storageProvider=SUPABASE` creates no mirror job.
2. **Implement `lib/storage/dual-write.ts`** with `enqueueMirror` reading `Organization.storageProvider` and short-circuiting on non-GDrive orgs.
3. **Wire `app/api/inspections/[id]/photos/route.ts`** — call `enqueueMirror` after `prisma.inspectionPhoto.create` succeeds, inside a try/catch that logs but doesn't rethrow.
4. **Wire same hook** into the existing Report PDF generation point and Invoice PDF generation point (find via `grep -rn "pdf-export|invoices/pdf-generator" app/api/`). Same try/catch posture.
5. **Verify**: tests green; mirror-failure injection test confirms upload-response is unaffected.

### Block 5 — Close-package export hook (1 day)

1. **Write failing integration test**: `lib/queue/__tests__/exportClosedJobToBYOKStorage.test.ts` — given a fully-populated inspection (report + invoice + 3 photos + 5 audit logs), invoke `exportClosedJobToBYOKStorage(id)`; assert (a) a ZIP is built and uploaded to `closures/<orgId>/<inspectionId>/job-package.zip` in Supabase, (b) a `StorageMirrorJob` row exists with `kind=JOB_PACKAGE` pointing at it, (c) returned object contains `{ storageKey, byteSize, mirrorJobId }`.
2. **Extract `lib/exports/job-package-zip.ts`** from the existing `bulk-export-zip/route.ts` (factor `buildJobPackageStream(inspectionId)`). Refactor the existing route to consume the new helper — no functional change for the route.
3. **Implement `exportClosedJobToBYOKStorage`** — call the helper, write the ZIP to Supabase at the closure path, call `queueMirrorJob({ kind: "JOB_PACKAGE", ... })`. Return `{ storageKey, byteSize, mirrorJobId }`. Wrap everything in a top-level try/catch that logs and emits a Sentry breadcrumb. **Callers must wrap in `.catch()`** — failures don't propagate as rejections to keep close-route fire-and-forget semantics; on failure, returns a placeholder object with empty strings (caller treats null storageKey as "not yet ready, retry from settings page").
4. **Export contract** (locked):

   ```ts
   export async function exportClosedJobToBYOKStorage(
     inspectionId: string,
   ): Promise<{ storageKey: string; byteSize: number; mirrorJobId: string }>;
   ```

   SP-A imports against this signature.

5. **Verify**: test green; manual smoke run produces a real ZIP visible in Supabase.

### Block 6 — Cron route + Vercel schedule (½ day)

1. **Write failing test**: `app/api/cron/storage-mirror/__tests__/route.test.ts` — GET with wrong `Authorization` header → 401; correct header → invokes `processNextBatch`; response shape matches `{ processed, failed, remaining }`.
2. **Implement `app/api/cron/storage-mirror/route.ts`** mirroring `app/api/cron/sync-invoices/route.ts` shape.
3. **Wire `vercel.json`** — add the cron entry. `*/1 * * * *` (every minute).
4. **Verify in staging**: deploy, watch logs for the cron heartbeat, confirm queued jobs drain.
5. **Document** in `DEPLOYMENT.md` the new cron + the `CRON_SECRET` requirement (already exists).

### Block 7 — Settings page + management API (1 day)

1. **Write failing E2E**: `e2e/storage-byok.spec.ts` — owner navigates to `/dashboard/settings/storage`, sees "Connected as foo@bar.com", sees mirror queue table, clicks "Retry" on a FAILED row → row flips to PENDING.
2. **Implement `app/api/storage/mirror-jobs/route.ts`** GET + `POST /retry/[jobId]` (admin/owner role guard).
3. **Implement `app/dashboard/settings/storage/page.tsx`** server component reading the org's connection state + recent jobs.
4. **Implement client interactivity** — Retry button calls the POST route, optimistic UI update, toast on success/failure.
5. **Verify**: E2E green.

### Block 8 — End-to-end verification + Workspace Health surface (½ day)

1. **Manual gate** on staging: real Google OAuth, real Drive, real Supabase. Upload a photo to a GDrive-connected org → confirm Drive shows the file in `RestoreAssist/{jobNumber}/` within 90s. Generate an invoice PDF → same. Close a stub job → confirm `job-package.zip` lands in Drive.
2. **Workspace Health integration**: add a "Storage mirror" tile reading `getMirrorQueueStats(orgId)` to the existing `/dashboard/settings/health` page (no new infra — just a tile).
3. **Failure injection**: temporarily revoke Drive scope → confirm dead-letter Notification appears in the dashboard within 5 minutes (5 retries × ~30s+).
4. **Documentation**: add a section to `docs/storage-byok.md` covering the dual-write contract, idempotency guarantees, and the close-package folder convention.
5. **Open the gate** — handoff to SP-A which can now call `exportClosedJobToBYOKStorage`.

**Total estimate:** 6 working days (~1 week), matching the spec's SP-E envelope.

---

## Dual-write strategy in detail

**Why dual-write via queue instead of swap-storage:** the spec is explicit at §4.2 — "primary write to Supabase (latency + reliability), background mirror to GDrive". Photo uploads need to return `<201 Created>` in <2s for the FAB capture UX. Drive's API can take 5-15s under load and has 24-hour outage windows in 2025 history. Supabase remains the source-of-truth for thumbnails, signed URLs in the dashboard, AI vision pipelines, EXIF extraction. Drive is the tenant's **archive**, not their operational store.

**Write path for a photo (GDrive-connected org):**

1. `POST /api/inspections/[id]/photos` — `SupabaseStorageProvider.upload()` runs (compression, thumbnail, signed URL, sha256). Returns in ~600ms.
2. `prisma.inspectionPhoto.create` writes the row with Supabase URLs. ~50ms.
3. `enqueueMirror({ kind: "PHOTO", id: photo.id, orgId, storagePath, filename, mimeType })` — single INSERT into `StorageMirrorJob`. ~20ms. Idempotent.
4. Response returned to client. Total ~700ms.
5. Within 60s the cron tick fires `processNextBatch`. The job claims the row, downloads bytes from Supabase, uploads to Drive at `RestoreAssist/{jobNumber}/{filename}`, marks COMPLETED with `driveFileId` recorded.

**Retry semantics:** exponential backoff `30 * 2^attempts` seconds (30s, 1min, 2min, 4min, 8min — capped). `nextAttemptAt` column governs claim eligibility. After 5 failures the job is dead-lettered; the existing pattern from `sync-queue.ts` emits the `[DEAD-LETTER]` log prefix AND a `Notification` row to the org owner with a "Fix it" deep-link to `/dashboard/settings/storage`. The org owner can hit "Retry" on the page once the underlying cause (revoked scope, quota, network) is resolved.

**Token refresh:** `Organization.storageProviderRefreshToken` (encrypted by Onboarding hotfix) is decrypted via `lib/credential-vault.ts` at the start of each `processJob`. `google-auth-library` handles access-token refresh transparently. If refresh fails (revoked grant), the error message contains "invalid_grant" → the queue marks the job FAILED immediately (skips remaining retries) and writes a high-severity Notification: "Google Drive access revoked — reconnect at Settings → Storage".

**Idempotency:** the `@@unique([orgId, kind, photoId, reportId, invoiceId, inspectionId])` composite means duplicate enqueues for the same entity collapse on the Postgres unique constraint. `queueMirrorJob` catches `P2002` and returns the existing job ID — same upsert pattern as `sync-queue.ts:48-82`.

**Folder convention:** `RestoreAssist/{jobNumber}/{filename}` (already used by `cloud-mirror/drive.ts`). Close-package goes to `RestoreAssist/{jobNumber}/job-package.zip`. Spec §4.2 mentions `<job-date>-<inspection-id>/` — we resolve this discrepancy in favour of the existing convention (job-number-only) for v1 to avoid breaking the existing per-user mirror, and document it. A future SP can add tenant-configurable folder strategy.

---

## Out of scope (explicit)

- **OneDrive provider** — the placeholder card on the setup-wizard StorageCard stays "Coming soon — AU data centres". No `OneDriveStorageProvider` is written in SP-E.
- **iCloud provider** — same status.
- **S3/GCS/Azure BYOK** — the stub `ExternalS3Provider` stays as-is.
- **Retroactive mirror of pre-existing photos** — the queue only sees rows enqueued after deployment.
- **Close-export business logic beyond the hook signature** — SP-A owns deciding **when** to call it and what preconditions to verify.
- **Per-tenant configurable folder convention** — locked to `RestoreAssist/{jobNumber}/` for v1.
- **Mirror replay / verification** — no separate "diff Supabase vs Drive and re-sync gaps" job in v1.
- **Direct GDrive primary writes (no Supabase)** — the `GoogleDriveStorageProvider.upload` method exists but is NOT wired into the photo-upload hot path.
- **Audit-log JSON mirror as a separate kind** — bundled inside the close-package ZIP via the `JOB_PACKAGE` kind.

---

## Verification gate

The plan is complete only when every item below passes on staging with real OAuth:

1. **Migration applies cleanly** — `pnpm prisma migrate deploy` against a fresh DB; `prisma migrate diff` reports zero drift.
2. **Unit tests** — `npx vitest run lib/storage lib/queue` green (15+ tests across the 8 blocks).
3. **Integration tests** — photo upload to a GDrive org creates a `StorageMirrorJob`; same upload to a Supabase-only org does NOT.
4. **Dead-letter path** — revoke Drive scope mid-flight → after 5 retries a `Notification` row appears for the org owner with the correct link and message.
5. **Idempotency** — re-running `enqueueMirror` for the same photo five times produces ONE `StorageMirrorJob` row.
6. **Cron heartbeat** — Vercel cron log shows `/api/cron/storage-mirror` firing every minute; queue drains observed in logs.
7. **End-to-end (Playwright)** — `e2e/storage-byok.spec.ts`: new tradie signs up → connects GDrive at setup → uploads a photo → within 90s the photo is visible in their Drive at `RestoreAssist/{jobNumber}/{filename}`.
8. **Close-package smoke** — call `exportClosedJobToBYOKStorage(testInspectionId)` directly via a script; confirm `job-package.zip` lands in Drive within 2 minutes and the ZIP opens with the expected 4-section contents (report PDF, photo folder, invoice PDF, audit-log.json).
9. **Settings page** — `/dashboard/settings/storage` renders the connection block + queue table; clicking "Retry" on a FAILED row promotes it to PENDING and the next cron tick re-attempts.
10. **No regressions** — existing photo upload (Supabase-only orgs), existing `bulk-export-zip` route, existing `cloud-mirror/drive.ts` user-scoped mirror all still pass their own tests.
11. **Hook contract** — the exported function signature `exportClosedJobToBYOKStorage(inspectionId): Promise<{ storageKey; byteSize; mirrorJobId }>` is locked; SP-A imports against it.
12. **Type-check + lint** — `pnpm type-check && pnpm lint` clean.

Once all twelve gates pass, SP-E is ready for merge and SP-A can begin its implementation cycle.

### Critical Files for Implementation

- `lib/storage/index.ts`
- `lib/cloud-mirror/drive.ts`
- `lib/integrations/sync-queue.ts`
- `prisma/schema.prisma`
- `app/api/inspections/[id]/photos/route.ts`
