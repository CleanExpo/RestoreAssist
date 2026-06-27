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
