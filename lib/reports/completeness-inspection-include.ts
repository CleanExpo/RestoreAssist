import type { Prisma } from "@prisma/client";

/**
 * Inspection relations fetched by the report completeness-check route.
 *
 * Prisma `include` accepts relations only. Scalars the scorer reads —
 * `contentsManifestDraft`, `floorPlanImageUrl`, `powerCircuits`,
 * `powerCircuitRatingA` — come back automatically on a plain include.
 * Naming `contentsManifestDraft` here is a client validation error (RA-7571).
 */
export const COMPLETENESS_INSPECTION_INCLUDE = {
  // Only `.length` is read for each list relation below; selecting
  // just `id` keeps payload minimal while preserving array length.
  moistureReadings: { select: { id: true } },
  affectedAreas: { select: { id: true } },
  classifications: { select: { id: true } },
  scopeItems: { select: { id: true } },
  costEstimates: { select: { id: true } },
  photos: { select: { id: true } },
  // RA-7003: floor-plan presence (sketches only count when rendered).
  claimSketches: {
    select: {
      id: true,
      floorNumber: true,
      renderedPngUrl: true,
      sketchData: true,
      underlayReferences: {
        select: { verifiedAt: true, verificationJson: true },
        orderBy: { createdAt: "desc" as const },
        take: 1,
      },
      inspection: {
        select: {
          sketchUnderlayReferences: {
            select: {
              floorNumber: true,
              verifiedAt: true,
              verificationJson: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.InspectionInclude;
