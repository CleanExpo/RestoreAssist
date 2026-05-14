/**
 * SP-J: Handover-package export hook.
 *
 * Sibling of `exportClosedJobToBYOKStorage` (SP-E) but tailored to the
 * SP-J handover moment. Key differences:
 *
 *   1. Returns the storage key **synchronously** to the caller because the
 *      handover route's HTTP response includes the key (unlike SP-A's
 *      fire-and-forget close-package mirror, which surfaces the key only
 *      via a later eventual-consistency write).
 *   2. Writes to `handovers/<orgId>/<inspectionId>/handover-package.zip`
 *      so it doesn't collide with the close-package path.
 *   3. Enqueues a `StorageMirrorJob` of kind `HANDOVER_PACKAGE` so the
 *      composite unique on `StorageMirrorJob` doesn't collide with the
 *      JOB_PACKAGE row SP-A already emits for the same inspection.
 *
 * Throws on hard failure — the caller (the route handler) MUST catch and
 * return a 500 envelope. This is intentional: the handover storage key is
 * the route's response payload, so an empty key is not acceptable.
 *
 * Spec ref: docs/superpowers/specs/2026-05-14-signin-jobclose-audit-design.md §9.5.
 */

import { MirrorJobKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { BUCKET_ORIGINALS } from "@/lib/storage/types";
import { buildJobPackageStream } from "@/lib/exports/job-package-zip";
import { queueMirrorJob } from "@/lib/queue/storage-mirror";
import { resolveClientBrandTheme } from "@/lib/clients/brand";

export interface HandoverExportResult {
  storageKey: string;
  byteSize: number;
  mirrorJobId: string;
}

export async function exportHandoverPackageToBYOKStorage(
  inspectionId: string,
): Promise<HandoverExportResult> {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      id: true,
      user: { select: { organizationId: true } },
      // P1 #10 — resolve client co-brand assets for the PDF header/accent.
      // Null fields fall back to RA defaults inside resolveClientBrandTheme.
      report: {
        select: {
          client: {
            select: { brandLogoUrl: true, brandPrimaryColor: true },
          },
        },
      },
    },
  });

  if (!inspection?.user?.organizationId) {
    throw new Error(
      `Inspection ${inspectionId} has no org context — handover export blocked`,
    );
  }

  const orgId = inspection.user.organizationId;
  const theme = resolveClientBrandTheme(inspection.report?.client ?? null);

  // The ZIP composition (report + invoice ref + photos + audit log) is
  // identical to SP-E's close package — see plan §9.5 for the contract.
  // Reusing the builder keeps the ZIP layout stable across surfaces.
  // The optional `theme` arg drives the PDF co-brand (P1 #10).
  const { buffer, byteSize } = await buildJobPackageStream(inspectionId, {
    theme,
  });

  const storageKey = `handovers/${orgId}/${inspectionId}/handover-package.zip`;
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.storage
    .from(BUCKET_ORIGINALS)
    .upload(storageKey, buffer, {
      contentType: "application/zip",
      // Allow overwrite — re-running handover for the same inspection
      // (corrections flow) should replace the prior ZIP rather than 409.
      upsert: true,
    });
  if (error) {
    throw new Error(`Supabase handover upload failed: ${error.message}`);
  }

  // Enqueue the mirror job — cron tick pushes it to the org's Drive.
  // Failure to enqueue is not fatal for the route's success path: the
  // primary storage write already landed, and the missing mirror row is
  // recoverable via the dashboard health page.
  let mirrorJobId = "";
  try {
    mirrorJobId = await queueMirrorJob({
      orgId,
      kind: MirrorJobKind.HANDOVER_PACKAGE,
      sourceStoragePath: storageKey,
      filename: "handover-package.zip",
      mimeType: "application/zip",
      inspectionId,
    });
  } catch (err) {
    console.error(
      `[Handover Export] mirror enqueue failed for ${inspectionId}:`,
      err,
    );
  }

  return { storageKey, byteSize, mirrorJobId };
}
