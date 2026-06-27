# Re-hydrate Primary Storage from Google Drive — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an org owner deliberately restore lost/pruned original file blobs back into Supabase from the org's own Google Drive, using `COMPLETED StorageMirrorJob` rows as the recovery index, with SHA-256 chain-of-custody verification — via a durable `StorageRestoreJob` queue that reflects the existing mirror queue.

**Architecture:** A separate `StorageRestoreJob` table + restore queue + per-minute cron that mirrors the proven `StorageMirrorJob` machinery (optimistic-lock claim, retry/backoff, dead-letter, rate-limit + circuit-breaker). A restore engine downloads a file from Drive by `driveFileId`, writes the original bytes back to the exact `sourceStoragePath` in the `evidence-originals` bucket, verifies the SHA-256, and updates state. A manual admin (org-owner) action in Settings → Storage previews and enqueues jobs; a `RestoreJobsTable` shows progress.

**Tech Stack:** Next.js App Router (route handlers), Prisma/Postgres, Supabase Storage (service-role client), `googleapis` Drive v3, `next-auth` sessions, AES-256-GCM via `lib/credential-vault`, Jest tests with module mocks, shadcn `Button`.

## Global Constraints

- **Separate table/queue.** Do NOT reuse `StorageMirrorJob` — push and pull stay cleanly separated.
- **Recovery index = `COMPLETED StorageMirrorJob` rows** that have a non-null `driveFileId`. Only these are restorable.
- **Non-destructive default.** `mode=MISSING` skips files already present in Supabase (`SKIPPED`); `mode=FORCE` overwrites (`upsert: true`).
- **Restore the ORIGINAL only**, to its exact `sourceStoragePath` in bucket `evidence-originals` (`BUCKET_ORIGINALS`). Variant (compressed/thumbnail) regeneration is OUT OF SCOPE for v1.
- **Integrity:** compute SHA-256 of restored bytes; if `expectedSha256` is set and differs → the job FAILS (never silently accept). If no `expectedSha256`, record `restoredSha256` for audit and proceed.
- **Auth gate = org OWNER:** resolve `user.organizationId` → load org → require `org.ownerId === session.user.id` on every restore route. Verify `job.orgId === user.organizationId` for per-job routes.
- **Audit:** `prisma.auditLog.create` requires a non-null `inspectionId`. Write one audit row per restore job that resolves to an inspection (`StorageRestoreJob.inspectionId`); skip the audit row when a job has no inspection (the job row itself is the durable record).
- **Retry/backoff (copy from mirror queue verbatim):** `MAX_ATTEMPTS=5`, `BACKOFF_BASE_MS=30_000`, `BACKOFF_CAP_MS=30*60_000`. `invalid_grant` → immediate dead-letter + owner notification linking `/dashboard/settings/storage`.
- **Network keys:** rate-limit key `"GOOGLE_DRIVE"` (shared with mirror), circuit-breaker key `"google-drive-restore"` (distinct from mirror's `"google-drive-mirror"`).
- **No secrets logged.** Tokens stay encrypted; decrypt only at point of use.
- Follow existing file/test patterns. Run the focused test while iterating; run the file's suite before committing. Commit after every task.

## File Structure

```
prisma/schema.prisma                              + RestoreJobStatus, RestoreMode enums; StorageRestoreJob model; Organization.storageRestoreJobs
prisma/migrations/<ts>_storage_restore_job/       additive migration (new enums + table)
lib/storage/supabase-provider.ts                  + exists(); + restoreToPath()
lib/cloud-mirror/drive.ts                         + downloadFromDrive()
lib/storage/google-drive-provider.ts              replace download() NotImplementedError with downloadByFileId()-backed read
lib/restore/rehydrate.ts                          rehydrateOne() engine
lib/queue/storage-restore.ts                      queue (enqueue/process/fail/stats/retry) — mirrors storage-mirror.ts
lib/restore/plan.ts                               computeRestorePlan() + enqueueRestorePlan()
app/api/storage/restore/route.ts                  GET preview/stats, POST enqueue
app/api/storage/restore/[jobId]/retry/route.ts    POST retry
app/api/cron/storage-restore/route.ts             cron drain
vercel.json                                        + cron entry
components/settings/RestoreJobsTable.tsx           progress table
components/settings/RestoreFromDrivePanel.tsx      scope/mode picker + preview + confirm
app/dashboard/settings/storage/page.tsx           mount the panel + table
```

---

## Task 1: Schema — `StorageRestoreJob` table + enums + migration

**Files:**
- Modify: `prisma/schema.prisma` (add two enums, one model, one Organization relation line)
- Create: `prisma/migrations/<timestamp>_storage_restore_job/migration.sql` (via `prisma migrate dev`)
- Test: `lib/restore/__tests__/schema.test.ts`

**Interfaces produced:** Prisma model `StorageRestoreJob` and enums `RestoreJobStatus`, `RestoreMode` available on `@prisma/client`.

- [ ] **Step 1: Add the enums and model to `prisma/schema.prisma`** (place near the `StorageMirrorJob` model / `MirrorJobStatus` enum)

```prisma
enum RestoreJobStatus {
  PENDING
  PROCESSING
  COMPLETED
  SKIPPED
  FAILED
  DEAD_LETTER
}

enum RestoreMode {
  MISSING
  FORCE
}

/// Re-hydrate primary storage (Supabase) from the org's Google Drive.
/// One row per file being restored, sourced from a COMPLETED StorageMirrorJob.
model StorageRestoreJob {
  id           String           @id @default(cuid())
  orgId        String
  organization Organization     @relation(fields: [orgId], references: [id], onDelete: Cascade)

  // The COMPLETED mirror job we are reversing. driveFileId/sourceStoragePath are
  // copied onto this row at enqueue time so a restore is self-contained even if
  // the mirror row is later cleaned up.
  sourceMirrorJobId String
  kind              MirrorJobKind
  mode              RestoreMode      @default(MISSING)
  status            RestoreJobStatus @default(PENDING)

  sourceStoragePath String        // exact path in BUCKET_ORIGINALS to write back to
  filename          String
  mimeType          String
  driveFileId       String        // copied from the mirror job
  inspectionId      String?       // for audit-log linkage when resolvable
  initiatedByUserId String?       // who started the restore (for the audit row)

  // Integrity / result
  expectedSha256 String?
  restoredSha256 String?
  restoredBytes  Int?

  attempts      Int       @default(0)
  lastError     String?   @db.Text
  lastAttemptAt DateTime?
  nextAttemptAt DateTime  @default(now())

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  completedAt DateTime?

  @@unique([orgId, sourceMirrorJobId], name: "restore_idempotency")
  @@index([orgId, status])
  @@index([status, nextAttemptAt])
}
```

- [ ] **Step 2: Add the relation to the `Organization` model** (next to `storageMirrorJobs StorageMirrorJob[]`)

```prisma
  storageRestoreJobs StorageRestoreJob[]
```

- [ ] **Step 3: Generate the migration + client**

Run: `npx prisma migrate dev --name storage_restore_job`
Expected: a new migration dir under `prisma/migrations/` containing `CREATE TYPE "RestoreJobStatus"`, `CREATE TYPE "RestoreMode"`, `CREATE TABLE "StorageRestoreJob"`, and the indexes/unique. Prisma client regenerates.

- [ ] **Step 4: Write a smoke test** — `lib/restore/__tests__/schema.test.ts`

```typescript
import { RestoreJobStatus, RestoreMode, MirrorJobKind } from "@prisma/client";

describe("StorageRestoreJob enums", () => {
  it("exposes the restore status values", () => {
    expect(RestoreJobStatus.PENDING).toBe("PENDING");
    expect(RestoreJobStatus.SKIPPED).toBe("SKIPPED");
    expect(RestoreJobStatus.DEAD_LETTER).toBe("DEAD_LETTER");
  });
  it("exposes the restore mode values", () => {
    expect(RestoreMode.MISSING).toBe("MISSING");
    expect(RestoreMode.FORCE).toBe("FORCE");
  });
  it("reuses MirrorJobKind", () => {
    expect(MirrorJobKind.PHOTO).toBe("PHOTO");
  });
});
```

- [ ] **Step 5: Run the test**

Run: `npx jest lib/restore/__tests__/schema.test.ts`
Expected: PASS (3 tests). If the enums are undefined, prisma generate didn't run — re-run Step 3.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations lib/restore/__tests__/schema.test.ts
git commit -m "feat(restore): add StorageRestoreJob table + RestoreJobStatus/RestoreMode enums"
```

---

## Task 2: Supabase provider — `exists()` + `restoreToPath()`

**Files:**
- Modify: `lib/storage/supabase-provider.ts` (add two methods to `SupabaseStorageProvider`)
- Test: `lib/storage/__tests__/supabase-provider.restore.test.ts`

**Interfaces produced:**
- `exists(storagePath: string, bucket?: string): Promise<boolean>` — true if an object exists at the path.
- `restoreToPath(storagePath: string, buffer: Buffer, mimeType: string, opts?: { upsert?: boolean }, bucket?: string): Promise<void>` — raw put to the exact path.

Both default `bucket` to `BUCKET_ORIGINALS`.

- [ ] **Step 1: Write the failing test** — `lib/storage/__tests__/supabase-provider.restore.test.ts`

```typescript
import { SupabaseStorageProvider } from "@/lib/storage/supabase-provider";
import { BUCKET_ORIGINALS } from "@/lib/storage/types";

const uploadMock = jest.fn();
const listMock = jest.fn();
jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    storage: {
      from: () => ({ upload: uploadMock, list: listMock }),
    },
  }),
}));

describe("SupabaseStorageProvider restore helpers", () => {
  beforeEach(() => {
    uploadMock.mockReset();
    listMock.mockReset();
  });

  it("exists() returns true when list finds the file", async () => {
    listMock.mockResolvedValue({ data: [{ name: "photo.jpg" }], error: null });
    const p = new SupabaseStorageProvider();
    await expect(p.exists("org1/insp1/photo.jpg")).resolves.toBe(true);
  });

  it("exists() returns false when list is empty", async () => {
    listMock.mockResolvedValue({ data: [], error: null });
    const p = new SupabaseStorageProvider();
    await expect(p.exists("org1/insp1/photo.jpg")).resolves.toBe(false);
  });

  it("restoreToPath() uploads to the exact path with contentType", async () => {
    uploadMock.mockResolvedValue({ error: null });
    const p = new SupabaseStorageProvider();
    await p.restoreToPath("org1/insp1/photo.jpg", Buffer.from("x"), "image/jpeg", { upsert: false });
    expect(uploadMock).toHaveBeenCalledWith(
      "org1/insp1/photo.jpg",
      expect.any(Buffer),
      { contentType: "image/jpeg", upsert: false },
    );
  });

  it("restoreToPath() throws on supabase error", async () => {
    uploadMock.mockResolvedValue({ error: { message: "boom" } });
    const p = new SupabaseStorageProvider();
    await expect(
      p.restoreToPath("p", Buffer.from("x"), "image/jpeg"),
    ).rejects.toThrow(/boom/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest lib/storage/__tests__/supabase-provider.restore.test.ts`
Expected: FAIL — `p.exists is not a function` / `p.restoreToPath is not a function`.

- [ ] **Step 3: Implement the two methods** in `lib/storage/supabase-provider.ts` (add inside the class; `getSupabaseServerClient` and `BUCKET_ORIGINALS` are already imported in this file)

```typescript
  /**
   * Cheap existence check: list the parent prefix searching for the filename.
   */
  async exists(
    storagePath: string,
    bucket: string = BUCKET_ORIGINALS,
  ): Promise<boolean> {
    const supabase = getSupabaseServerClient();
    const slash = storagePath.lastIndexOf("/");
    const dir = slash >= 0 ? storagePath.slice(0, slash) : "";
    const name = slash >= 0 ? storagePath.slice(slash + 1) : storagePath;
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(dir, { search: name, limit: 1 });
    if (error) {
      throw new Error(`[storage] exists() failed: ${error.message}`);
    }
    return Boolean(data?.some((f) => f.name === name));
  }

  /**
   * Write raw bytes to an EXACT storage path (no path derivation, no
   * compression). Used by the restore engine to re-hydrate originals.
   */
  async restoreToPath(
    storagePath: string,
    buffer: Buffer,
    mimeType: string,
    opts: { upsert?: boolean } = {},
    bucket: string = BUCKET_ORIGINALS,
  ): Promise<void> {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: opts.upsert ?? false,
      });
    if (error) {
      throw new Error(`[storage] restoreToPath failed: ${error.message}`);
    }
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest lib/storage/__tests__/supabase-provider.restore.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/storage/supabase-provider.ts lib/storage/__tests__/supabase-provider.restore.test.ts
git commit -m "feat(restore): add SupabaseStorageProvider.exists + restoreToPath"
```

---

## Task 3: Drive read — `downloadFromDrive()` + `downloadByFileId()`

**Files:**
- Modify: `lib/cloud-mirror/drive.ts` (add `downloadFromDrive`, reusing the existing private `getOAuthClient` + `withBackoff`)
- Modify: `lib/storage/google-drive-provider.ts` (add `downloadByFileId`; the existing `download()` keeps throwing — it's the interface's path-based read, unused here)
- Test: `lib/cloud-mirror/__tests__/drive.download.test.ts`

**Interfaces produced:**
- `downloadFromDrive(input: { accessToken: string; refreshToken: string | null; fileId: string }): Promise<Buffer>` (in `lib/cloud-mirror/drive.ts`).
- `GoogleDriveStorageProvider.downloadByFileId(fileId: string): Promise<Buffer>` — decrypts org tokens, delegates to `downloadFromDrive`.

- [ ] **Step 1: Write the failing test** — `lib/cloud-mirror/__tests__/drive.download.test.ts`

```typescript
const filesGet = jest.fn();
jest.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: class { setCredentials() {} } },
    drive: () => ({ files: { get: filesGet } }),
  },
}));

import { downloadFromDrive } from "@/lib/cloud-mirror/drive";

describe("downloadFromDrive", () => {
  beforeEach(() => filesGet.mockReset());

  it("returns the file bytes as a Buffer", async () => {
    // googleapis returns arraybuffer responseType → data is an ArrayBuffer
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    filesGet.mockResolvedValue({ data: bytes });
    const buf = await downloadFromDrive({
      accessToken: "a",
      refreshToken: "r",
      fileId: "file123",
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf).toEqual(Buffer.from([1, 2, 3]));
    expect(filesGet).toHaveBeenCalledWith(
      { fileId: "file123", alt: "media" },
      { responseType: "arraybuffer" },
    );
  });

  it("propagates a non-retryable error", async () => {
    filesGet.mockRejectedValue({ response: { status: 404 } });
    await expect(
      downloadFromDrive({ accessToken: "a", refreshToken: "r", fileId: "x" }),
    ).rejects.toBeDefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest lib/cloud-mirror/__tests__/drive.download.test.ts`
Expected: FAIL — `downloadFromDrive is not exported`.

- [ ] **Step 3: Implement `downloadFromDrive`** in `lib/cloud-mirror/drive.ts` (append; uses the file's existing `getOAuthClient`, `google`, and `withBackoff`)

```typescript
export async function downloadFromDrive(input: {
  accessToken: string;
  refreshToken: string | null;
  fileId: string;
}): Promise<Buffer> {
  const auth = getOAuthClient(input.accessToken, input.refreshToken);
  const drive = google.drive({ version: "v3", auth });

  const { data } = await withBackoff(() =>
    drive.files.get(
      { fileId: input.fileId, alt: "media" },
      { responseType: "arraybuffer" },
    ),
  );
  return Buffer.from(data as ArrayBuffer);
}
```

- [ ] **Step 4: Implement `downloadByFileId`** in `lib/storage/google-drive-provider.ts` (add method to the class; `prisma`, `decrypt`, and the org token columns are already used by `upload()`)

```typescript
  /**
   * Read a file back from the org's Drive by its Drive file id. Used by the
   * restore engine. (The interface `download(path)` stays unimplemented — it
   * is path-based and not how restore addresses Drive objects.)
   */
  async downloadByFileId(fileId: string): Promise<Buffer> {
    const org = await prisma.organization.findUnique({
      where: { id: this.orgId },
      select: {
        storageProviderRefreshToken: true,
        storageProviderAccessToken: true,
      },
    });
    if (!org?.storageProviderRefreshToken) {
      throw new Error(
        `[invalid_grant] Google Drive not connected for org ${this.orgId}`,
      );
    }
    const refreshToken = decrypt(org.storageProviderRefreshToken);
    const accessToken = org.storageProviderAccessToken
      ? decrypt(org.storageProviderAccessToken)
      : "";
    return downloadFromDrive({ accessToken, refreshToken, fileId });
  }
```

Add the import at the top of `google-drive-provider.ts` (it already imports `uploadToDrive` from the same module):

```typescript
import { uploadToDrive, downloadFromDrive } from "@/lib/cloud-mirror/drive";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest lib/cloud-mirror/__tests__/drive.download.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/cloud-mirror/drive.ts lib/storage/google-drive-provider.ts lib/cloud-mirror/__tests__/drive.download.test.ts
git commit -m "feat(restore): add Drive read path (downloadFromDrive + downloadByFileId)"
```

---

## Task 4: Restore engine — `rehydrateOne()`

**Files:**
- Create: `lib/restore/rehydrate.ts`
- Test: `lib/restore/__tests__/rehydrate.test.ts`

**Interfaces consumed:** `SupabaseStorageProvider.exists/restoreToPath` (Task 2), `GoogleDriveStorageProvider.downloadByFileId` (Task 3), `withRateLimit`/`withCircuitBreaker` (existing), `getMirrorStorageProvider` (existing).

**Interfaces produced:**
```typescript
export type RehydrateOutcome =
  | { status: "COMPLETED"; restoredBytes: number; restoredSha256: string }
  | { status: "SKIPPED" };
export async function rehydrateOne(job: StorageRestoreJob): Promise<RehydrateOutcome>;
```
Throws on any failure (Drive download error, integrity mismatch, Supabase write error) — the queue catches and routes to retry/dead-letter.

- [ ] **Step 1: Write the failing test** — `lib/restore/__tests__/rehydrate.test.ts`

```typescript
import { RestoreMode } from "@prisma/client";

const existsMock = jest.fn();
const restoreToPathMock = jest.fn();
jest.mock("@/lib/storage/supabase-provider", () => ({
  SupabaseStorageProvider: class {
    exists = existsMock;
    restoreToPath = restoreToPathMock;
  },
}));

const downloadByFileId = jest.fn();
class FakeDriveProvider {
  downloadByFileId = downloadByFileId;
}
jest.mock("@/lib/storage/google-drive-provider", () => ({
  GoogleDriveStorageProvider: FakeDriveProvider,
}));
jest.mock("@/lib/storage", () => ({
  getMirrorStorageProvider: jest.fn(async () => new FakeDriveProvider()),
}));
// Pass-through rate-limit + circuit-breaker so the engine logic is what's tested.
jest.mock("@/lib/integrations/rate-limiter", () => ({
  withRateLimit: (_k: string, fn: () => Promise<unknown>) => fn(),
}));
jest.mock("@/lib/integrations/circuit-breaker", () => ({
  withCircuitBreaker: (_k: string, fn: () => Promise<unknown>) => fn(),
  DEFAULT_CIRCUIT_OPTIONS: {},
}));

import { rehydrateOne } from "@/lib/restore/rehydrate";
import crypto from "crypto";

function fakeJob(over: Partial<any> = {}) {
  return {
    id: "rj1",
    orgId: "org1",
    sourceMirrorJobId: "mj1",
    kind: "PHOTO",
    mode: RestoreMode.MISSING,
    status: "PROCESSING",
    sourceStoragePath: "org1/insp1/photo.jpg",
    filename: "photo.jpg",
    mimeType: "image/jpeg",
    driveFileId: "drive123",
    inspectionId: "insp1",
    expectedSha256: null,
    ...over,
  } as any;
}

describe("rehydrateOne", () => {
  beforeEach(() => {
    existsMock.mockReset();
    restoreToPathMock.mockReset();
    downloadByFileId.mockReset();
  });

  it("SKIPS when MISSING mode and the file already exists", async () => {
    existsMock.mockResolvedValue(true);
    const out = await rehydrateOne(fakeJob());
    expect(out.status).toBe("SKIPPED");
    expect(downloadByFileId).not.toHaveBeenCalled();
    expect(restoreToPathMock).not.toHaveBeenCalled();
  });

  it("restores when the file is missing", async () => {
    existsMock.mockResolvedValue(false);
    const bytes = Buffer.from("hello");
    downloadByFileId.mockResolvedValue(bytes);
    restoreToPathMock.mockResolvedValue(undefined);
    const out = await rehydrateOne(fakeJob());
    expect(out).toEqual({
      status: "COMPLETED",
      restoredBytes: 5,
      restoredSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    });
    expect(downloadByFileId).toHaveBeenCalledWith("drive123");
    expect(restoreToPathMock).toHaveBeenCalledWith(
      "org1/insp1/photo.jpg",
      bytes,
      "image/jpeg",
      { upsert: false },
    );
  });

  it("FORCE mode overwrites without an existence check", async () => {
    const bytes = Buffer.from("z");
    downloadByFileId.mockResolvedValue(bytes);
    await rehydrateOne(fakeJob({ mode: RestoreMode.FORCE }));
    expect(existsMock).not.toHaveBeenCalled();
    expect(restoreToPathMock).toHaveBeenCalledWith(
      "org1/insp1/photo.jpg",
      bytes,
      "image/jpeg",
      { upsert: true },
    );
  });

  it("throws an integrity error when the hash does not match", async () => {
    existsMock.mockResolvedValue(false);
    downloadByFileId.mockResolvedValue(Buffer.from("hello"));
    await expect(
      rehydrateOne(fakeJob({ expectedSha256: "deadbeef" })),
    ).rejects.toThrow(/integrity/i);
    expect(restoreToPathMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest lib/restore/__tests__/rehydrate.test.ts`
Expected: FAIL — cannot find module `@/lib/restore/rehydrate`.

- [ ] **Step 3: Implement** — `lib/restore/rehydrate.ts`

```typescript
import crypto from "crypto";
import type { StorageRestoreJob } from "@prisma/client";
import { RestoreMode } from "@prisma/client";
import { SupabaseStorageProvider } from "@/lib/storage/supabase-provider";
import { GoogleDriveStorageProvider } from "@/lib/storage/google-drive-provider";
import { getMirrorStorageProvider } from "@/lib/storage";
import { withRateLimit } from "@/lib/integrations/rate-limiter";
import {
  withCircuitBreaker,
  DEFAULT_CIRCUIT_OPTIONS,
} from "@/lib/integrations/circuit-breaker";

const RATE_KEY = "GOOGLE_DRIVE";
const CIRCUIT_KEY = "google-drive-restore";

export type RehydrateOutcome =
  | { status: "COMPLETED"; restoredBytes: number; restoredSha256: string }
  | { status: "SKIPPED" };

export async function rehydrateOne(
  job: StorageRestoreJob,
): Promise<RehydrateOutcome> {
  const supabase = new SupabaseStorageProvider();

  // Non-destructive: in MISSING mode, skip if the original is already present.
  if (job.mode === RestoreMode.MISSING && (await supabase.exists(job.sourceStoragePath))) {
    return { status: "SKIPPED" };
  }

  const provider = await getMirrorStorageProvider(job.orgId);
  if (!provider || !(provider instanceof GoogleDriveStorageProvider)) {
    throw new Error(`Org ${job.orgId} has no Google Drive provider configured`);
  }

  // Wrap the Drive read in the shared rate-limit + circuit-breaker, matching
  // the mirror queue, so a Drive outage degrades gracefully.
  const bytes = await withRateLimit(RATE_KEY, async () =>
    withCircuitBreaker(
      CIRCUIT_KEY,
      async () => provider.downloadByFileId(job.driveFileId),
      DEFAULT_CIRCUIT_OPTIONS,
    ),
  );

  const restoredSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  if (job.expectedSha256 && job.expectedSha256 !== restoredSha256) {
    throw new Error(
      `Integrity check failed for ${job.filename}: expected ${job.expectedSha256}, got ${restoredSha256}`,
    );
  }

  await supabase.restoreToPath(job.sourceStoragePath, bytes, job.mimeType, {
    upsert: job.mode === RestoreMode.FORCE,
  });

  return {
    status: "COMPLETED",
    restoredBytes: bytes.byteLength,
    restoredSha256,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest lib/restore/__tests__/rehydrate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/restore/rehydrate.ts lib/restore/__tests__/rehydrate.test.ts
git commit -m "feat(restore): add rehydrateOne engine (download→verify→restore)"
```

---

## Task 5: Restore queue — `lib/queue/storage-restore.ts`

**Files:**
- Create: `lib/queue/storage-restore.ts`
- Test: `lib/queue/__tests__/storage-restore.queue.test.ts`

**Template:** This file is a near-exact reflection of `lib/queue/storage-mirror.ts`. Copy that file's structure and adapt: `storageMirrorJob` → `storageRestoreJob`, `MirrorJobStatus` → `RestoreJobStatus`, the processJob body calls `rehydrateOne` (Task 4) instead of `uploadToDrive`, and the unique-violation idempotency key is `(orgId, sourceMirrorJobId)`.

**Interfaces produced:**
```typescript
export interface EnqueueRestoreInput {
  orgId: string;
  sourceMirrorJobId: string;
  kind: MirrorJobKind;
  mode: RestoreMode;
  sourceStoragePath: string;
  filename: string;
  mimeType: string;
  driveFileId: string;
  inspectionId?: string | null;
  initiatedByUserId?: string | null;
  expectedSha256?: string | null;
}
export async function queueRestoreJob(input: EnqueueRestoreInput): Promise<string>;
export async function processNextRestoreBatch(options?: { maxJobs?: number }): Promise<{ processed: number; failed: number; skipped: number; remaining: number }>;
export async function getRestoreQueueStats(orgId: string): Promise<{ total: number; pending: number; processing: number; completed: number; skipped: number; failed: number; lastCompletedAt: Date | null }>;
export async function retryRestoreJob(jobId: string): Promise<boolean>;
```

- [ ] **Step 1: Write the failing test** — `lib/queue/__tests__/storage-restore.queue.test.ts`

Model it on `lib/queue/__tests__/storage-mirror.queue.test.ts`. Mock `@/lib/prisma` (a `storageRestoreJob` delegate with `create/findMany/updateMany/findUnique/update/count/findFirst`, plus `organization.findUnique` and `notification.create`) and mock `@/lib/restore/rehydrate`'s `rehydrateOne`. Cover:

```typescript
import { RestoreMode } from "@prisma/client";

const rehydrateOne = jest.fn();
jest.mock("@/lib/restore/rehydrate", () => ({ rehydrateOne: (...a: unknown[]) => rehydrateOne(...a) }));

const db: any = {
  storageRestoreJob: {
    create: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
  },
  organization: { findUnique: jest.fn() },
  notification: { create: jest.fn() },
  auditLog: { create: jest.fn() },
};
jest.mock("@/lib/prisma", () => ({ prisma: db }));

import {
  queueRestoreJob,
  processNextRestoreBatch,
  retryRestoreJob,
} from "@/lib/queue/storage-restore";

function row(over: any = {}) {
  return {
    id: "rj1", orgId: "org1", sourceMirrorJobId: "mj1", kind: "PHOTO",
    mode: RestoreMode.MISSING, status: "PROCESSING", attempts: 0,
    sourceStoragePath: "p", filename: "f", mimeType: "image/jpeg",
    driveFileId: "d", inspectionId: "insp1", initiatedByUserId: "owner1",
    expectedSha256: null, ...over,
  };
}

beforeEach(() => Object.values(db).forEach((m: any) => Object.values(m).forEach((f: any) => f.mockReset?.())));

it("enqueues a job and returns its id", async () => {
  db.storageRestoreJob.create.mockResolvedValue({ id: "rj1" });
  await expect(queueRestoreJob({
    orgId: "org1", sourceMirrorJobId: "mj1", kind: "PHOTO" as any,
    mode: RestoreMode.MISSING, sourceStoragePath: "p", filename: "f",
    mimeType: "image/jpeg", driveFileId: "d",
  })).resolves.toBe("rj1");
});

it("idempotent re-enqueue on P2002 returns existing id", async () => {
  const { Prisma } = jest.requireActual("@prisma/client");
  db.storageRestoreJob.create.mockRejectedValue(
    new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }),
  );
  db.storageRestoreJob.findFirst.mockResolvedValue({ id: "existing" });
  await expect(queueRestoreJob({
    orgId: "org1", sourceMirrorJobId: "mj1", kind: "PHOTO" as any,
    mode: RestoreMode.MISSING, sourceStoragePath: "p", filename: "f",
    mimeType: "image/jpeg", driveFileId: "d",
  })).resolves.toBe("existing");
});

it("COMPLETED on success, SKIPPED counted separately", async () => {
  db.storageRestoreJob.findMany.mockResolvedValue([{ id: "rj1" }]);
  db.storageRestoreJob.updateMany.mockResolvedValue({ count: 1 });
  db.storageRestoreJob.findUnique.mockResolvedValue(row());
  db.storageRestoreJob.count.mockResolvedValue(0);
  rehydrateOne.mockResolvedValue({ status: "COMPLETED", restoredBytes: 5, restoredSha256: "abc" });
  const stats = await processNextRestoreBatch();
  expect(stats.processed).toBe(1);
  expect(db.storageRestoreJob.update).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ status: "COMPLETED" }),
  }));
  expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ action: "STORAGE_FILE_RESTORED_FROM_DRIVE", userId: "owner1", inspectionId: "insp1" }),
  }));
});

it("invalid_grant dead-letters immediately and notifies the owner", async () => {
  db.storageRestoreJob.findMany.mockResolvedValue([{ id: "rj1" }]);
  db.storageRestoreJob.updateMany.mockResolvedValue({ count: 1 });
  db.storageRestoreJob.findUnique.mockResolvedValue(row({ attempts: 0 }));
  db.storageRestoreJob.count.mockResolvedValue(0);
  db.organization.findUnique.mockResolvedValue({ ownerId: "owner1" });
  rehydrateOne.mockRejectedValue(new Error("invalid_grant: revoked"));
  await processNextRestoreBatch();
  expect(db.storageRestoreJob.update).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ status: "FAILED" }),
  }));
  expect(db.notification.create).toHaveBeenCalled();
});

it("transient failure reschedules PENDING with backoff", async () => {
  db.storageRestoreJob.findMany.mockResolvedValue([{ id: "rj1" }]);
  db.storageRestoreJob.updateMany.mockResolvedValue({ count: 1 });
  db.storageRestoreJob.findUnique.mockResolvedValue(row({ attempts: 0 }));
  db.storageRestoreJob.count.mockResolvedValue(1);
  rehydrateOne.mockRejectedValue(new Error("503 transient"));
  await processNextRestoreBatch();
  expect(db.storageRestoreJob.update).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ status: "PENDING", attempts: 1 }),
  }));
});

it("retryRestoreJob resets a FAILED job", async () => {
  db.storageRestoreJob.updateMany.mockResolvedValue({ count: 1 });
  await expect(retryRestoreJob("rj1")).resolves.toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest lib/queue/__tests__/storage-restore.queue.test.ts`
Expected: FAIL — cannot find module `@/lib/queue/storage-restore`.

- [ ] **Step 3: Implement** — `lib/queue/storage-restore.ts`

```typescript
import { prisma } from "@/lib/prisma";
import {
  MirrorJobKind,
  RestoreJobStatus,
  RestoreMode,
  Prisma,
  type StorageRestoreJob,
} from "@prisma/client";
import { rehydrateOne } from "@/lib/restore/rehydrate";

const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_CAP_MS = 30 * 60_000;

export interface EnqueueRestoreInput {
  orgId: string;
  sourceMirrorJobId: string;
  kind: MirrorJobKind;
  mode: RestoreMode;
  sourceStoragePath: string;
  filename: string;
  mimeType: string;
  driveFileId: string;
  inspectionId?: string | null;
  initiatedByUserId?: string | null;
  expectedSha256?: string | null;
}

export async function queueRestoreJob(
  input: EnqueueRestoreInput,
): Promise<string> {
  try {
    const job = await prisma.storageRestoreJob.create({
      data: {
        orgId: input.orgId,
        sourceMirrorJobId: input.sourceMirrorJobId,
        kind: input.kind,
        mode: input.mode,
        sourceStoragePath: input.sourceStoragePath,
        filename: input.filename,
        mimeType: input.mimeType,
        driveFileId: input.driveFileId,
        inspectionId: input.inspectionId ?? null,
        initiatedByUserId: input.initiatedByUserId ?? null,
        expectedSha256: input.expectedSha256 ?? null,
      },
      select: { id: true },
    });
    return job.id;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existing = await prisma.storageRestoreJob.findFirst({
        where: { orgId: input.orgId, sourceMirrorJobId: input.sourceMirrorJobId },
        select: { id: true },
      });
      if (existing) return existing.id;
    }
    throw err;
  }
}

export async function processNextRestoreBatch(
  options: { maxJobs?: number } = {},
): Promise<{ processed: number; failed: number; skipped: number; remaining: number }> {
  const { maxJobs = 50 } = options;
  const candidates = await prisma.storageRestoreJob.findMany({
    where: {
      status: RestoreJobStatus.PENDING,
      nextAttemptAt: { lte: new Date() },
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: maxJobs,
    select: { id: true },
  });

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const { id } of candidates) {
    const locked = await prisma.storageRestoreJob.updateMany({
      where: { id, status: RestoreJobStatus.PENDING },
      data: { status: RestoreJobStatus.PROCESSING, lastAttemptAt: new Date() },
    });
    if (locked.count === 0) continue;

    const job = await prisma.storageRestoreJob.findUnique({ where: { id } });
    if (!job) continue;

    try {
      const outcome = await rehydrateOne(job);
      await prisma.storageRestoreJob.update({
        where: { id: job.id },
        data:
          outcome.status === "SKIPPED"
            ? { status: RestoreJobStatus.SKIPPED, completedAt: new Date(), lastError: null }
            : {
                status: RestoreJobStatus.COMPLETED,
                completedAt: new Date(),
                restoredBytes: outcome.restoredBytes,
                restoredSha256: outcome.restoredSha256,
                lastError: null,
              },
      });
      // Chain-of-custody: audit each real restore (auditLog.inspectionId is a
      // required FK, so we can only write when the job resolves to an inspection
      // and we know who initiated it). Never let an audit failure fail the job.
      if (outcome.status !== "SKIPPED" && job.inspectionId && job.initiatedByUserId) {
        try {
          await prisma.auditLog.create({
            data: {
              inspectionId: job.inspectionId,
              action: "STORAGE_FILE_RESTORED_FROM_DRIVE",
              entityType: "StorageRestoreJob",
              entityId: job.id,
              userId: job.initiatedByUserId,
              changes: JSON.stringify({
                kind: job.kind,
                path: job.sourceStoragePath,
                bytes: outcome.restoredBytes,
                sha256: outcome.restoredSha256,
                mode: job.mode,
              }),
            },
          });
        } catch (auditErr) {
          console.error(`[Storage Restore] audit write failed for ${job.id}:`, auditErr);
        }
      }
      if (outcome.status === "SKIPPED") skipped++;
      else processed++;
    } catch (err) {
      await handleRestoreFailure(job, err);
      failed++;
    }
  }

  const remaining = await prisma.storageRestoreJob.count({
    where: { status: { in: [RestoreJobStatus.PENDING, RestoreJobStatus.PROCESSING] } },
  });
  console.log(
    `[Storage Restore] Batch: ${processed} restored, ${skipped} skipped, ${failed} failed, ${remaining} remaining`,
  );
  return { processed, failed, skipped, remaining };
}

async function handleRestoreFailure(
  job: StorageRestoreJob,
  err: unknown,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const newAttempts = job.attempts + 1;
  const isInvalidGrant = /invalid_grant/i.test(message);
  const isPermanent = isInvalidGrant || newAttempts >= MAX_ATTEMPTS;

  if (isPermanent) {
    await prisma.storageRestoreJob.update({
      where: { id: job.id },
      data: { status: RestoreJobStatus.FAILED, attempts: newAttempts, lastError: message },
    });
    console.error(
      `[DEAD-LETTER] [Storage Restore] Job ${job.id} failed permanently (attempts=${newAttempts}, org=${job.orgId}): ${message}`,
    );
    try {
      const org = await prisma.organization.findUnique({
        where: { id: job.orgId },
        select: { ownerId: true },
      });
      if (org?.ownerId) {
        const title = isInvalidGrant
          ? "Google Drive access revoked"
          : `Restore failed for ${job.filename}`;
        const body = isInvalidGrant
          ? "Your Google Drive grant was revoked — reconnect at Settings → Storage to resume restores."
          : `Failed to restore ${job.kind} (${job.filename}) from Google Drive after ${newAttempts} attempts. Last error: ${message.slice(0, 200)}.`;
        await prisma.notification.create({
          data: {
            userId: org.ownerId,
            type: "ERROR",
            title,
            message: body,
            link: "/dashboard/settings/storage",
          },
        });
      }
    } catch (notifyErr) {
      console.error(`[DEAD-LETTER] [Storage Restore] notify failed for ${job.id}:`, notifyErr);
    }
    return;
  }

  const delay = Math.min(BACKOFF_BASE_MS * Math.pow(2, newAttempts - 1), BACKOFF_CAP_MS);
  await prisma.storageRestoreJob.update({
    where: { id: job.id },
    data: {
      status: RestoreJobStatus.PENDING,
      attempts: newAttempts,
      lastError: message,
      nextAttemptAt: new Date(Date.now() + delay),
    },
  });
}

export async function getRestoreQueueStats(orgId: string): Promise<{
  total: number; pending: number; processing: number;
  completed: number; skipped: number; failed: number; lastCompletedAt: Date | null;
}> {
  const [total, pending, processing, completed, skipped, failed, last] = await Promise.all([
    prisma.storageRestoreJob.count({ where: { orgId } }),
    prisma.storageRestoreJob.count({ where: { orgId, status: RestoreJobStatus.PENDING } }),
    prisma.storageRestoreJob.count({ where: { orgId, status: RestoreJobStatus.PROCESSING } }),
    prisma.storageRestoreJob.count({ where: { orgId, status: RestoreJobStatus.COMPLETED } }),
    prisma.storageRestoreJob.count({ where: { orgId, status: RestoreJobStatus.SKIPPED } }),
    prisma.storageRestoreJob.count({ where: { orgId, status: RestoreJobStatus.FAILED } }),
    prisma.storageRestoreJob.findFirst({
      where: { orgId, status: RestoreJobStatus.COMPLETED },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    }),
  ]);
  return { total, pending, processing, completed, skipped, failed, lastCompletedAt: last?.completedAt ?? null };
}

export async function retryRestoreJob(jobId: string): Promise<boolean> {
  const result = await prisma.storageRestoreJob.updateMany({
    where: { id: jobId, status: RestoreJobStatus.FAILED },
    data: { status: RestoreJobStatus.PENDING, attempts: 0, lastError: null, nextAttemptAt: new Date() },
  });
  return result.count > 0;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest lib/queue/__tests__/storage-restore.queue.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/queue/storage-restore.ts lib/queue/__tests__/storage-restore.queue.test.ts
git commit -m "feat(restore): add durable StorageRestoreJob queue"
```

---

## Task 6: Restore plan — `lib/restore/plan.ts`

**Files:**
- Create: `lib/restore/plan.ts`
- Test: `lib/restore/__tests__/plan.test.ts`

**Interfaces produced:**
```typescript
export type RestoreScope = { type: "org" } | { type: "inspection"; inspectionId: string };
export async function computeRestorePlan(orgId: string, scope: RestoreScope): Promise<{ fileCount: number }>;
export async function enqueueRestorePlan(orgId: string, scope: RestoreScope, mode: RestoreMode, initiatedByUserId: string): Promise<{ enqueued: number }>;
```
Both select `COMPLETED StorageMirrorJob` rows for the org with a non-null `driveFileId`, filtered to the inspection when scope is inspection-scoped. `enqueueRestorePlan` calls `queueRestoreJob` (Task 5) per row, mapping `driveFileId`, `sourceStoragePath`, `kind`, `filename`, `mimeType`, and `inspectionId` across. `expectedSha256` is left null in v1 (mirror jobs don't carry the hash — see Open Questions in the spec).

- [ ] **Step 1: Write the failing test** — `lib/restore/__tests__/plan.test.ts`

```typescript
import { RestoreMode } from "@prisma/client";

const db: any = { storageMirrorJob: { findMany: jest.fn(), count: jest.fn() } };
jest.mock("@/lib/prisma", () => ({ prisma: db }));
const queueRestoreJob = jest.fn();
jest.mock("@/lib/queue/storage-restore", () => ({ queueRestoreJob: (...a: unknown[]) => queueRestoreJob(...a) }));

import { computeRestorePlan, enqueueRestorePlan } from "@/lib/restore/plan";

beforeEach(() => {
  db.storageMirrorJob.findMany.mockReset();
  db.storageMirrorJob.count.mockReset();
  queueRestoreJob.mockReset();
});

it("computeRestorePlan counts COMPLETED mirror jobs with a driveFileId for the org", async () => {
  db.storageMirrorJob.count.mockResolvedValue(3);
  const out = await computeRestorePlan("org1", { type: "org" });
  expect(out).toEqual({ fileCount: 3 });
  expect(db.storageMirrorJob.count).toHaveBeenCalledWith({
    where: { orgId: "org1", status: "COMPLETED", driveFileId: { not: null } },
  });
});

it("computeRestorePlan filters by inspection when scoped", async () => {
  db.storageMirrorJob.count.mockResolvedValue(1);
  await computeRestorePlan("org1", { type: "inspection", inspectionId: "insp9" });
  expect(db.storageMirrorJob.count).toHaveBeenCalledWith({
    where: { orgId: "org1", status: "COMPLETED", driveFileId: { not: null }, inspectionId: "insp9" },
  });
});

it("enqueueRestorePlan enqueues one restore job per mirror row", async () => {
  db.storageMirrorJob.findMany.mockResolvedValue([
    { id: "mj1", kind: "PHOTO", sourceStoragePath: "p1", filename: "a.jpg", mimeType: "image/jpeg", driveFileId: "d1", inspectionId: "insp1" },
    { id: "mj2", kind: "REPORT", sourceStoragePath: "p2", filename: "r.pdf", mimeType: "application/pdf", driveFileId: "d2", inspectionId: "insp1" },
  ]);
  queueRestoreJob.mockResolvedValue("ok");
  const out = await enqueueRestorePlan("org1", { type: "org" }, RestoreMode.MISSING, "owner1");
  expect(out).toEqual({ enqueued: 2 });
  expect(queueRestoreJob).toHaveBeenCalledTimes(2);
  expect(queueRestoreJob).toHaveBeenCalledWith(expect.objectContaining({
    orgId: "org1", sourceMirrorJobId: "mj1", kind: "PHOTO", mode: RestoreMode.MISSING,
    sourceStoragePath: "p1", filename: "a.jpg", mimeType: "image/jpeg", driveFileId: "d1",
    inspectionId: "insp1", initiatedByUserId: "owner1",
  }));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest lib/restore/__tests__/plan.test.ts`
Expected: FAIL — cannot find module `@/lib/restore/plan`.

- [ ] **Step 3: Implement** — `lib/restore/plan.ts`

```typescript
import { prisma } from "@/lib/prisma";
import { MirrorJobStatus, RestoreMode, Prisma } from "@prisma/client";
import { queueRestoreJob } from "@/lib/queue/storage-restore";

export type RestoreScope =
  | { type: "org" }
  | { type: "inspection"; inspectionId: string };

function whereForScope(orgId: string, scope: RestoreScope): Prisma.StorageMirrorJobWhereInput {
  const base: Prisma.StorageMirrorJobWhereInput = {
    orgId,
    status: MirrorJobStatus.COMPLETED,
    driveFileId: { not: null },
  };
  if (scope.type === "inspection") base.inspectionId = scope.inspectionId;
  return base;
}

export async function computeRestorePlan(
  orgId: string,
  scope: RestoreScope,
): Promise<{ fileCount: number }> {
  const fileCount = await prisma.storageMirrorJob.count({
    where: whereForScope(orgId, scope),
  });
  return { fileCount };
}

export async function enqueueRestorePlan(
  orgId: string,
  scope: RestoreScope,
  mode: RestoreMode,
  initiatedByUserId: string,
): Promise<{ enqueued: number }> {
  const rows = await prisma.storageMirrorJob.findMany({
    where: whereForScope(orgId, scope),
    select: {
      id: true, kind: true, sourceStoragePath: true,
      filename: true, mimeType: true, driveFileId: true, inspectionId: true,
    },
  });

  let enqueued = 0;
  for (const r of rows) {
    if (!r.driveFileId) continue;
    await queueRestoreJob({
      orgId,
      sourceMirrorJobId: r.id,
      kind: r.kind,
      mode,
      sourceStoragePath: r.sourceStoragePath,
      filename: r.filename,
      mimeType: r.mimeType,
      driveFileId: r.driveFileId,
      inspectionId: r.inspectionId,
      initiatedByUserId,
      expectedSha256: null,
    });
    enqueued++;
  }
  return { enqueued };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest lib/restore/__tests__/plan.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/restore/plan.ts lib/restore/__tests__/plan.test.ts
git commit -m "feat(restore): add restore plan (preview + enqueue from mirror index)"
```

---

## Task 7: API routes — preview/enqueue + retry (org-owner gated)

**Files:**
- Create: `app/api/storage/restore/route.ts` (GET preview/stats, POST enqueue)
- Create: `app/api/storage/restore/[jobId]/retry/route.ts` (POST)
- Test: `app/api/storage/restore/__tests__/route.test.ts`

**Auth gate (org owner):** resolve `user.organizationId`, load the org, require `org.ownerId === session.user.id`.

- [ ] **Step 1: Write the failing test** — `app/api/storage/restore/__tests__/route.test.ts`

Mock `next-auth`'s `getServerSession`, `@/lib/prisma` (`user.findUnique`, `organization.findUnique`), and `@/lib/restore/plan` (`computeRestorePlan`, `enqueueRestorePlan`). Cover:

```typescript
const getServerSession = jest.fn();
jest.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
const db: any = {
  user: { findUnique: jest.fn() },
  organization: { findUnique: jest.fn() },
  storageRestoreJob: { findMany: jest.fn(async () => []) },
};
jest.mock("@/lib/prisma", () => ({ prisma: db }));
const computeRestorePlan = jest.fn();
const enqueueRestorePlan = jest.fn();
jest.mock("@/lib/restore/plan", () => ({
  computeRestorePlan: (...a: unknown[]) => computeRestorePlan(...a),
  enqueueRestorePlan: (...a: unknown[]) => enqueueRestorePlan(...a),
}));
const getRestoreQueueStats = jest.fn(async () => ({ total: 0 }));
jest.mock("@/lib/queue/storage-restore", () => ({
  getRestoreQueueStats: (...a: unknown[]) => getRestoreQueueStats(...a),
}));

import { GET, POST } from "@/app/api/storage/restore/route";

function req(url = "http://x/api/storage/restore", body?: unknown) {
  return new Request(url, body ? { method: "POST", body: JSON.stringify(body) } : {}) as any;
}

beforeEach(() => {
  [getServerSession, computeRestorePlan, enqueueRestorePlan].forEach((m) => m.mockReset());
  db.user.findUnique.mockReset(); db.organization.findUnique.mockReset();
});

it("GET returns 401 when not signed in", async () => {
  getServerSession.mockResolvedValue(null);
  const res = await GET(req());
  expect(res.status).toBe(401);
});

it("GET returns 403 when the user is not the org owner", async () => {
  getServerSession.mockResolvedValue({ user: { id: "u1" } });
  db.user.findUnique.mockResolvedValue({ organizationId: "org1" });
  db.organization.findUnique.mockResolvedValue({ ownerId: "someone-else" });
  const res = await GET(req());
  expect(res.status).toBe(403);
});

it("GET preview returns the file count for the owner", async () => {
  getServerSession.mockResolvedValue({ user: { id: "owner" } });
  db.user.findUnique.mockResolvedValue({ organizationId: "org1" });
  db.organization.findUnique.mockResolvedValue({ ownerId: "owner" });
  computeRestorePlan.mockResolvedValue({ fileCount: 7 });
  const res = await GET(req("http://x/api/storage/restore?scope=org"));
  const json = await res.json();
  expect(res.status).toBe(200);
  expect(json.data.fileCount).toBe(7); // GET contract: { data: { fileCount, stats, jobs } }
});

it("POST enqueues for the owner and returns the count", async () => {
  getServerSession.mockResolvedValue({ user: { id: "owner" } });
  db.user.findUnique.mockResolvedValue({ organizationId: "org1" });
  db.organization.findUnique.mockResolvedValue({ ownerId: "owner" });
  enqueueRestorePlan.mockResolvedValue({ enqueued: 7 });
  const res = await POST(req("http://x/api/storage/restore", { scope: "org", mode: "MISSING" }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ data: { enqueued: 7 } });
  expect(enqueueRestorePlan).toHaveBeenCalledWith("org1", { type: "org" }, "MISSING", "owner");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest app/api/storage/restore/__tests__/route.test.ts`
Expected: FAIL — cannot find module `@/app/api/storage/restore/route`.

- [ ] **Step 3: Implement the preview/enqueue route** — `app/api/storage/restore/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RestoreMode } from "@prisma/client";
import {
  computeRestorePlan,
  enqueueRestorePlan,
  type RestoreScope,
} from "@/lib/restore/plan";
import { getRestoreQueueStats } from "@/lib/queue/storage-restore";

async function requireOwner(): Promise<
  { orgId: string; userId: string } | { error: NextResponse }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { organizationId: true },
  });
  if (!user?.organizationId) {
    return { error: NextResponse.json({ error: "No organization" }, { status: 404 }) };
  }
  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { ownerId: true },
  });
  if (!org || org.ownerId !== session.user.id) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { orgId: user.organizationId, userId: session.user.id };
}

function parseScope(params: URLSearchParams | Record<string, unknown>): RestoreScope {
  const get = (k: string) =>
    params instanceof URLSearchParams ? params.get(k) : (params[k] as string | undefined);
  const inspectionId = get("inspectionId");
  if (get("scope") === "inspection" && inspectionId) {
    return { type: "inspection", inspectionId };
  }
  return { type: "org" };
}

export async function GET(request: NextRequest) {
  const auth = await requireOwner();
  if ("error" in auth) return auth.error;
  const { searchParams } = new URL(request.url);
  const scope = parseScope(searchParams);
  const [plan, stats, jobs] = await Promise.all([
    computeRestorePlan(auth.orgId, scope),
    getRestoreQueueStats(auth.orgId),
    prisma.storageRestoreJob.findMany({
      where: { orgId: auth.orgId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, kind: true, status: true, filename: true, mode: true,
        attempts: true, lastError: true, completedAt: true, createdAt: true,
      },
    }),
  ]);
  return NextResponse.json({ data: { ...plan, stats, jobs } });
}

export async function POST(request: NextRequest) {
  const auth = await requireOwner();
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const scope = parseScope(body);
  const mode = body.mode === "FORCE" ? RestoreMode.FORCE : RestoreMode.MISSING;
  const result = await enqueueRestorePlan(auth.orgId, scope, mode, auth.userId);
  return NextResponse.json({ data: result });
}
```

The GET contract is **`{ data: { fileCount, stats, jobs } }`** (`jobs` = latest 50 restore rows, consumed by Task 9's table). The test asserts `json.data.fileCount` accordingly.

- [ ] **Step 4: Implement the retry route** — `app/api/storage/restore/[jobId]/retry/route.ts`

Copy `app/api/storage/mirror-jobs/retry/[jobId]/route.ts` verbatim and change: import `retryRestoreJob` from `@/lib/queue/storage-restore`; read `prisma.storageRestoreJob` (not `storageMirrorJob`); keep the same `job.orgId !== user.organizationId → 404` ownership check; call `retryRestoreJob(jobId)`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest app/api/storage/restore/__tests__/route.test.ts`
Expected: PASS (all cases; preview test asserts `fileCount` per the resolved contract above).

- [ ] **Step 6: Commit**

```bash
git add app/api/storage/restore lib
git commit -m "feat(restore): add org-owner-gated preview/enqueue + retry API routes"
```

---

## Task 8: Cron route + vercel.json registration

**Files:**
- Create: `app/api/cron/storage-restore/route.ts`
- Modify: `vercel.json` (add a cron entry)
- Test: `app/api/cron/storage-restore/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test** — `app/api/cron/storage-restore/__tests__/route.test.ts`

```typescript
const verifyCronAuth = jest.fn();
jest.mock("@/lib/cron/auth", () => ({ verifyCronAuth: (...a: unknown[]) => verifyCronAuth(...a) }));
const processNextRestoreBatch = jest.fn();
jest.mock("@/lib/queue/storage-restore", () => ({
  processNextRestoreBatch: (...a: unknown[]) => processNextRestoreBatch(...a),
}));

import { GET } from "@/app/api/cron/storage-restore/route";

beforeEach(() => { verifyCronAuth.mockReset(); processNextRestoreBatch.mockReset(); });

it("rejects unauthorized cron callers", async () => {
  verifyCronAuth.mockReturnValue(new Response("no", { status: 401 }));
  const res = await GET(new Request("http://x") as any);
  expect(res.status).toBe(401);
  expect(processNextRestoreBatch).not.toHaveBeenCalled();
});

it("drains the queue when authorized", async () => {
  verifyCronAuth.mockReturnValue(null);
  processNextRestoreBatch.mockResolvedValue({ processed: 2, failed: 0, skipped: 1, remaining: 0 });
  const res = await GET(new Request("http://x") as any);
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.success).toBe(true);
  expect(json.processed).toBe(2);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest app/api/cron/storage-restore/__tests__/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `app/api/cron/storage-restore/route.ts` (copy `app/api/cron/storage-mirror/route.ts`, swap the queue function)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { processNextRestoreBatch } from "@/lib/queue/storage-restore";

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  try {
    const stats = await processNextRestoreBatch({ maxJobs: 50 });
    return NextResponse.json({ success: true, ...stats, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("[Storage Restore Cron] Error:", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
```

- [ ] **Step 4: Register the cron** in `vercel.json` (add to the `crons` array, next to the `storage-mirror` entry)

```json
    { "path": "/api/cron/storage-restore", "schedule": "* * * * *" }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest app/api/cron/storage-restore/__tests__/route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add app/api/cron/storage-restore vercel.json
git commit -m "feat(restore): add storage-restore cron route + vercel schedule"
```

---

## Task 9: UI — Restore panel + jobs table on Settings → Storage

**Files:**
- Create: `components/settings/RestoreJobsTable.tsx`
- Create: `components/settings/RestoreFromDrivePanel.tsx`
- Modify: `app/dashboard/settings/storage/page.tsx` (render both, owner-only)
- Test: `components/settings/__tests__/RestoreFromDrivePanel.test.tsx`

This task is UI; it ends with a manual visual verification in addition to the unit test. Mirror the existing `components/settings/MirrorJobsTable.tsx` patterns (fetch, optimistic retry, status badge, shadcn `Button`, `toast`).

- [ ] **Step 1: Write the failing test** — `components/settings/__tests__/RestoreFromDrivePanel.test.tsx`

```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RestoreFromDrivePanel } from "@/components/settings/RestoreFromDrivePanel";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

beforeEach(() => {
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (!init || init.method !== "POST") {
      return { ok: true, json: async () => ({ data: { fileCount: 4, stats: {} } }) } as Response;
    }
    return { ok: true, json: async () => ({ data: { enqueued: 4 } }) } as Response;
  }) as unknown as typeof fetch;
});

it("previews the restore count, then enqueues on confirm", async () => {
  render(<RestoreFromDrivePanel />);
  fireEvent.click(screen.getByRole("button", { name: /preview/i }));
  await waitFor(() => expect(screen.getByText(/4 file/i)).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /restore/i }));
  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/storage/restore",
      expect.objectContaining({ method: "POST" }),
    ),
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest components/settings/__tests__/RestoreFromDrivePanel.test.tsx`
Expected: FAIL — cannot find module `@/components/settings/RestoreFromDrivePanel`.

- [ ] **Step 3: Implement `RestoreFromDrivePanel.tsx`** — `components/settings/RestoreFromDrivePanel.tsx`

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Mode = "MISSING" | "FORCE";

export function RestoreFromDrivePanel() {
  const [mode, setMode] = useState<Mode>("MISSING");
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function preview() {
    setBusy(true);
    try {
      const res = await fetch("/api/storage/restore?scope=org");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: { fileCount: number } };
      setCount(json.data.fileCount);
    } catch (err) {
      toast.error("Could not compute restore preview");
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      const res = await fetch("/api/storage/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "org", mode }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: { enqueued: number } };
      toast.success(`Queued ${json.data.enqueued} file(s) to restore — runs on the minute tick`);
      setCount(null);
    } catch (err) {
      toast.error("Restore failed to start");
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm">
        <label className="flex items-center gap-1">
          <input type="radio" checked={mode === "MISSING"} onChange={() => setMode("MISSING")} />
          Only missing files
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={mode === "FORCE"} onChange={() => setMode("FORCE")} />
          Overwrite all (force)
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" disabled={busy} onClick={preview}>
          {busy ? "Working…" : "Preview"}
        </Button>
        {count !== null && (
          <>
            <span className="text-sm">{count} file(s) restorable from Drive</span>
            <Button size="sm" disabled={busy || count === 0} onClick={confirm}>
              Restore from Drive
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `RestoreJobsTable.tsx`** — `components/settings/RestoreJobsTable.tsx`

Copy `components/settings/MirrorJobsTable.tsx` and adapt: fetch `/api/storage/restore` and read `json.data.jobs` (the GET route already returns the latest 50 restore rows — Task 7) and `json.data.stats`; render the same table with an extra `SKIPPED` status tone; the retry button POSTs to `/api/storage/restore/${jobId}/retry`. Keep the optimistic-flip + rollback pattern verbatim.

- [ ] **Step 5: Mount in the storage page** — `app/dashboard/settings/storage/page.tsx`

Add, below the existing "Mirror queue" section and gated to the org owner (`org.ownerId === session.user.id`), a new section:

```tsx
      {isOwner && (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="text-lg font-medium">Restore from Drive</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Re-hydrate original files lost from primary storage using your
            connected Google Drive. Non-destructive by default.
          </p>
          <div className="mt-4 space-y-4">
            <RestoreFromDrivePanel />
            <RestoreJobsTable />
          </div>
        </section>
      )}
```

Compute `isOwner` in the page's server component by selecting `ownerId` on the org and comparing to `session.user.id`; add the two imports.

- [ ] **Step 6: Run the unit test**

Run: `npx jest components/settings/__tests__/RestoreFromDrivePanel.test.tsx`
Expected: PASS.

- [ ] **Step 7: Typecheck the changed files**

Run: `npx tsc --noEmit` (or the repo's `pnpm typecheck`)
Expected: no new errors in the restore files.

- [ ] **Step 8: Manual visual verification**

VERIFICATION CHECKLIST:
1. **Where:** `/dashboard/settings/storage`, signed in as an **org owner** whose org has `storageProvider = GOOGLE_DRIVE` and at least one `COMPLETED` mirror job.
2. **How:** run the dev server; navigate to the page.
3. **See:** a "Restore from Drive" section with mode radios, a **Preview** button that shows "N file(s) restorable", and a **Restore from Drive** button that toasts "Queued N file(s)…"; the `RestoreJobsTable` lists jobs with status badges (incl. SKIPPED) and a Retry on FAILED rows.
4. **NOT see:** the section when signed in as a non-owner member; any console error on load; a crash when N = 0 (the Restore button is disabled).
5. **Confirm:** after clicking Restore, the cron (or a manual `GET /api/cron/storage-restore` with the CRON_SECRET) moves jobs to COMPLETED/SKIPPED.

- [ ] **Step 9: Commit**

```bash
git add components/settings app/dashboard/settings/storage/page.tsx app/api/storage/restore
git commit -m "feat(restore): add Restore-from-Drive panel + jobs table (owner-only)"
```

---

## Self-Review

**Spec coverage:**
- Manual admin (org-owner) trigger, preview + scope (org/inspection) → Tasks 6, 7, 9. ✓
- Durable resumable queue reflecting the mirror queue (claim/retry/backoff/dead-letter/invalid_grant) → Task 5. ✓
- Restore engine: download from Drive → write original to exact path → SHA-256 verify → status → Task 4. ✓
- Drive read path implemented (replaces NotImplementedError) → Task 3. ✓
- Non-destructive default (MISSING skip) + FORCE overwrite → Tasks 4, 6, 9. ✓
- Integrity mismatch fails the job → Task 4. ✓
- Org-owner auth + ownership checks on every route → Tasks 7, 8 (cron uses CRON_SECRET), 9. ✓
- Settings UI with jobs table → Task 9. ✓
- Schema additive migration → Task 1. ✓
- Rate-limit + circuit-breaker around the network read → Task 4. ✓

**Deviations from the spec (intentional, surfaced to the human):**
1. **Variant regeneration deferred** — v1 restores the original master only (Drive holds only originals). Documented in Global Constraints + Task 4.
2. **Auth gate = org owner** (not platform `ADMIN`) — matches the OAuth-connect route's tenant-owner pattern.
3. **Preview returns `fileCount`** (no byte estimate) — byte totals aren't tracked on mirror jobs (the existing `totalBytesMirrored: 0` gap).
4. **`expectedSha256` is null in v1 enqueue** — mirror jobs don't carry the chain-of-custody hash; restores are audit-only (hash recorded) until a backfill (spec Open Question). Integrity-verify code is in place for when hashes are populated.
5. **Audit rows** are written per-job in the queue's COMPLETED branch (Task 5), gated on `job.inspectionId && job.initiatedByUserId` because `auditLog.inspectionId` is a required FK. `initiatedByUserId` is captured at enqueue (Tasks 1/6/7) from the owner's session, so each real restore produces a chain-of-custody audit row.

**Placeholder scan:** No TBD/TODO; each step carries complete code or an exact copy-from-template instruction with named substitutions. The two "resolve in Step 1" notes (Task 7 GET contract; Task 9 `jobs` field) are explicit contract decisions to lock before RED, not deferred work.

**Type/name consistency:** `StorageRestoreJob`, `RestoreJobStatus`, `RestoreMode`, `rehydrateOne`, `RehydrateOutcome`, `queueRestoreJob`/`EnqueueRestoreInput`, `processNextRestoreBatch`, `getRestoreQueueStats`, `retryRestoreJob`, `computeRestorePlan`/`enqueueRestorePlan`/`RestoreScope`, `downloadFromDrive`, `downloadByFileId`, `exists`/`restoreToPath`, circuit key `google-drive-restore`, rate key `GOOGLE_DRIVE` — used identically across tasks.
