/**
 * SP-E: Close-package export hook.
 *
 * SP-A's `POST /api/inspections/[id]/close` route invokes this hook
 * fire-and-forget after an inspection is closed. The hook:
 *
 *   1. Builds the close-package ZIP (report + invoice ref + photos + audit log)
 *   2. Writes the ZIP to Supabase at `closures/<orgId>/<inspectionId>/job-package.zip`
 *   3. Enqueues a StorageMirrorJob of kind=JOB_PACKAGE so the cron tick
 *      mirrors the ZIP into the org's Google Drive
 *
 * Locked signature (Wave 1 reconciliation):
 *   exportClosedJobToBYOKStorage(inspectionId: string):
 *     Promise<{ storageKey: string; byteSize: number; mirrorJobId: string }>
 *
 * Callers SHOULD wrap in `.catch()` — failures don't propagate as rejections
 * to keep close-route fire-and-forget semantics. On internal failure we
 * return a placeholder object with empty strings so the caller can treat
 * an empty `storageKey` as "not yet ready, retry from settings page".
 */

import { MirrorJobKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { BUCKET_ORIGINALS } from "@/lib/storage/types";
import { buildJobPackageStream } from "@/lib/exports/job-package-zip";
import { queueMirrorJob } from "@/lib/queue/storage-mirror";

export async function exportClosedJobToBYOKStorage(
  inspectionId: string,
): Promise<{ storageKey: string; byteSize: number; mirrorJobId: string }> {
  try {
    const inspection = await prisma.inspection.findUnique({
      where: { id: inspectionId },
      select: {
        id: true,
        user: { select: { organizationId: true } },
      },
    });

    if (!inspection?.user?.organizationId) {
      console.warn(
        `[Close Export] Inspection ${inspectionId} has no org context — skipping BYOK export`,
      );
      return { storageKey: "", byteSize: 0, mirrorJobId: "" };
    }

    const orgId = inspection.user.organizationId;

    // Build the ZIP in memory.
    const { buffer, byteSize } = await buildJobPackageStream(inspectionId);

    // Persist to Supabase at the closure path.
    const storageKey = `closures/${orgId}/${inspectionId}/job-package.zip`;
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.storage
      .from(BUCKET_ORIGINALS)
      .upload(storageKey, buffer, {
        contentType: "application/zip",
        // Allow overwrite — closing the same job twice (correction flow)
        // should replace the previous package rather than 409.
        upsert: true,
      });
    if (error) {
      throw new Error(`Supabase upload failed: ${error.message}`);
    }

    // Enqueue the mirror job — the cron tick will push it to Drive.
    const mirrorJobId = await queueMirrorJob({
      orgId,
      kind: MirrorJobKind.JOB_PACKAGE,
      sourceStoragePath: storageKey,
      filename: "job-package.zip",
      mimeType: "application/zip",
      inspectionId,
    });

    console.log(
      `[Close Export] Inspection ${inspectionId} → ${storageKey} (${byteSize} bytes), mirror job ${mirrorJobId}`,
    );

    return { storageKey, byteSize, mirrorJobId };
  } catch (err) {
    console.error(
      `[Close Export] exportClosedJobToBYOKStorage failed for ${inspectionId}:`,
      err,
    );
    return { storageKey: "", byteSize: 0, mirrorJobId: "" };
  }
}
