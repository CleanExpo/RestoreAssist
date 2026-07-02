import { createHash } from "node:crypto";
import { WaterCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { detectStateFromPostcode } from "@/lib/state-detection";

/**
 * RA-6917 Phase 1 — derive a de-identified RestorationIncident from a closed
 * Inspection, for the permanent restoration data asset (annual reports /
 * industry intelligence).
 *
 * DE-IDENTIFICATION CONTRACT (do not weaken — this is the Privacy Act safety valve):
 *   - NO street address, owner name, technician, or free-text narrative is read
 *     into or written to RestorationIncident.
 *   - Geography is stored at POSTCODE granularity only (plus derived state).
 *   - `capturedAt` is truncated to the first of the month.
 *   - The link back to the source is a one-way SHA-256 hash (audit, not identity),
 *     so the incident is NOT foreign-keyed to the Inspection and survives the
 *     Inspection's deletion — operational PII cascade-deletes, the asset is kept.
 *   - Idempotent: upsert keyed on `sourceInspectionHash`, so re-derivation on a
 *     re-closed job updates in place rather than duplicating.
 *
 * Fire-and-forget at the call site (inspection close). Must never throw to the
 * caller — a failure here must not break job close.
 */
export async function deriveRestorationIncident(
  inspectionId: string,
): Promise<void> {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: {
      propertyPostcode: true,
      inspectionDate: true,
      completedAt: true,
      waterDamageClassification: {
        select: {
          waterCategory: true,
          damageClass: true,
          lossSourceType: true,
        },
      },
      // RA-6917 Phase 3 — derive geometry ONLY from the operator's own
      // `operator_measured` room elements. `underlay_reference` geometry (traced
      // over an imported portal image) is deliberately excluded so no
      // third-party copyrighted drawing is persisted into the asset.
      claimSketches: {
        select: {
          elements: {
            where: { type: "room", provenance: "operator_measured" },
            select: { dimensionsM: true },
          },
        },
      },
    },
  });

  // No postcode → nothing we can de-identify to a region. Skip silently.
  if (!inspection?.propertyPostcode) return;

  const postcode = inspection.propertyPostcode.trim();
  const state = detectStateFromPostcode(postcode) ?? "UNKNOWN";
  const cls = inspection.waterDamageClassification;

  // Whole days from inspection start to close, when both timestamps exist.
  const remediationDays =
    inspection.completedAt && inspection.inspectionDate
      ? Math.max(
          0,
          Math.round(
            (inspection.completedAt.getTime() -
              inspection.inspectionDate.getTime()) /
              86_400_000,
          ),
        )
      : null;

  // Only verifiable hazard flags — Category 3 is black water.
  const hazards: string[] = [];
  if (cls?.waterCategory === WaterCategory.CAT_3) hazards.push("black_water");

  // Derived geometry from operator_measured room elements only. Room count is a
  // plain tally; floor area sums each room's areaM2 (from dimensionsM) and is
  // rounded to the nearest 10 m2 to reduce re-identification. Both null when the
  // job has no operator-measured rooms.
  const roomElements = (inspection.claimSketches ?? []).flatMap(
    (s) => s.elements,
  );
  const roomCount = roomElements.length > 0 ? roomElements.length : null;
  let areaSum = 0;
  let sawArea = false;
  for (const el of roomElements) {
    const dims = el.dimensionsM as { areaM2?: unknown } | null;
    const area = typeof dims?.areaM2 === "number" ? dims.areaM2 : null;
    if (area !== null && area > 0) {
      areaSum += area;
      sawArea = true;
    }
  }
  const floorAreaM2 = sawArea ? Math.round(areaSum / 10) * 10 : null;

  // Truncate to the first of the month (UTC) to reduce re-identification.
  // inspectionDate is non-null on Inspection, so a basis always exists.
  const basis = inspection.completedAt ?? inspection.inspectionDate ?? new Date();
  const capturedAt = new Date(
    Date.UTC(basis.getUTCFullYear(), basis.getUTCMonth(), 1),
  );

  const sourceInspectionHash = createHash("sha256")
    .update(inspectionId)
    .digest("hex");

  const data = {
    state,
    postcode,
    waterCategory: cls?.waterCategory ?? null,
    damageClass: cls?.damageClass ?? null,
    lossSource: cls?.lossSourceType ?? null,
    hazards,
    remediationDays,
    outcome: "completed",
    floorAreaM2,
    roomCount,
    capturedAt,
  };

  await prisma.restorationIncident.upsert({
    where: { sourceInspectionHash },
    create: { sourceInspectionHash, ...data },
    update: data,
  });
}
