/**
 * SP-E: Dual-write enqueue hook.
 *
 * Called from the hot write paths (photo upload, report PDF generation,
 * invoice PDF generation) AFTER the Supabase write succeeds. Reads the
 * org's `storageProvider` and short-circuits when no mirror is configured
 * — non-GOOGLE_DRIVE orgs incur ONE Prisma lookup and bail.
 *
 * The actual upload is deferred to the cron-driven queue
 * (`/api/cron/storage-mirror`). This function only inserts a row.
 *
 * Callers MUST wrap in try/catch — a mirror queue failure must never
 * break the user-facing upload response.
 */

import { MirrorJobKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { queueMirrorJob } from "@/lib/queue/storage-mirror";

export interface EnqueueMirrorInput {
  kind: MirrorJobKind;
  orgId: string | null | undefined;
  /** Path inside Supabase originals bucket — required */
  storagePath: string;
  filename: string;
  mimeType: string;
  // Exactly ONE of these matches the kind.
  photoId?: string | null;
  reportId?: string | null;
  invoiceId?: string | null;
  inspectionId?: string | null;
}

/**
 * Returns the mirror job id when one was queued, or null when:
 *  - the org has no mirror configured, or
 *  - orgId is missing (caller has no org context — nothing to mirror)
 */
export async function enqueueMirror(
  input: EnqueueMirrorInput,
): Promise<string | null> {
  if (!input.orgId) return null;

  const org = await prisma.organization.findUnique({
    where: { id: input.orgId },
    select: { storageProvider: true },
  });

  if (!org || org.storageProvider !== "GOOGLE_DRIVE") {
    return null;
  }

  return queueMirrorJob({
    orgId: input.orgId,
    kind: input.kind,
    sourceStoragePath: input.storagePath,
    filename: input.filename,
    mimeType: input.mimeType,
    photoId: input.photoId ?? null,
    reportId: input.reportId ?? null,
    invoiceId: input.invoiceId ?? null,
    inspectionId: input.inspectionId ?? null,
  });
}
