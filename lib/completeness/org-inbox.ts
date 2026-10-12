/**
 * P4-5 — cross-job completeness projections (read-only; cannot author state).
 */

import type { PrismaClient } from "@prisma/client";
import { loadClaimContext } from "@/lib/margot/claim-context";
import { evaluateWaterDamageCompleteness } from "./water-damage-pack";

export type CompletenessInboxRow = {
  inspectionId: string;
  inspectionNumber: string | null;
  propertyAddress: string;
  status: string;
  completionPercent: number;
  blocking: string[];
};

export async function listCompletenessInboxForOwner(
  prisma: Pick<
    PrismaClient,
    | "inspection"
    | "moistureReading"
    | "waterDamageClassification"
    | "report"
    | "inspectionPhoto"
  >,
  args: { userId: string; organizationId?: string | null },
  opts: { limit?: number } = {},
): Promise<CompletenessInboxRow[]> {
  const limit = Math.min(opts.limit ?? 50, 100);
  const orgId =
    typeof args.organizationId === "string" && args.organizationId.length > 0
      ? args.organizationId
      : null;

  const inspections = await prisma.inspection.findMany({
    where: {
      status: { notIn: ["CLOSED", "ARCHIVED"] },
      ...(orgId
        ? {
            OR: [
              { userId: args.userId },
              { user: { organizationId: orgId } },
            ],
          }
        : { userId: args.userId }),
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      inspectionNumber: true,
      propertyAddress: true,
      status: true,
      clientId: true,
      report: { select: { incidentDate: true } },
    },
  });

  const rows: CompletenessInboxRow[] = [];
  for (const insp of inspections) {
    const context = await loadClaimContext(prisma, {
      inspectionId: insp.id,
    });
    if (!context) continue;

    const [wdc, photoCount] = await Promise.all([
      prisma.waterDamageClassification.findUnique({
        where: { inspectionId: insp.id },
        select: { waterCategory: true, damageClass: true },
      }),
      prisma.inspectionPhoto.count({ where: { inspectionId: insp.id } }),
    ]);

    const pack = evaluateWaterDamageCompleteness({
      hasClient: Boolean(insp.clientId),
      hasCategoryClass: Boolean(wdc?.waterCategory && wdc?.damageClass),
      hasIncidentDate: Boolean(insp.report?.incidentDate),
      hasBaseline: context.baselineCaptured,
      hasMonitoringPoint: context.monitoringPointCount > 0,
      photoCount,
    });

    if (pack.blocking.length === 0) continue;

    rows.push({
      inspectionId: insp.id,
      inspectionNumber: insp.inspectionNumber,
      propertyAddress: insp.propertyAddress,
      status: insp.status,
      completionPercent: pack.completionPercent,
      blocking: pack.blocking,
    });
  }

  return rows;
}
