/**
 * V1 Phase 4 (P4-1) — bounded ClaimContext for Margot / field assist.
 */

import type { PrismaClient } from "@prisma/client";
import { latestMonitoringReadingsForDryingGoal } from "@/lib/moisture/latest-monitoring-readings";
import { pickReferenceReadings, readingGoalStatus } from "@/lib/iicrc-dry-standards";

export type ClaimContext = {
  inspectionId: string;
  stage: string;
  claimType: string | null;
  missingFields: string[];
  /**
   * Latest monitoring readings still above their drying goal (the job's
   * reference reading, else the guide value), judged by readingGoalStatus.
   */
  wetReadingCount: number;
  baselineCaptured: boolean;
  monitoringPointCount: number;
  completenessHint: string | null;
};

export async function loadClaimContext(
  prisma: Pick<
    PrismaClient,
    "inspection" | "moistureReading" | "waterDamageClassification" | "report"
  >,
  args: { inspectionId: string },
): Promise<ClaimContext | null> {
  const inspection = await prisma.inspection.findFirst({
    where: { id: args.inspectionId },
    select: {
      id: true,
      status: true,
      claimType: true,
      claimNumber: true,
      clientId: true,
      report: { select: { incidentDate: true, waterCategory: true } },
    },
  });
  if (!inspection) return null;

  const readings = await prisma.moistureReading.findMany({
    where: { inspectionId: args.inspectionId, invalidatedAt: null },
    select: {
      id: true,
      location: true,
      surfaceType: true,
      moistureLevel: true,
      unit: true,
      isBaseline: true,
      isMonitoringPoint: true,
      invalidatedAt: true,
      recordedAt: true,
      createdAt: true,
    },
    take: 200,
  });

  const latest = latestMonitoringReadingsForDryingGoal(readings);
  // RA-8517: no fixed number here. The drying goal owner decides, using the
  // job's reference readings first and the guide only without one.
  const references = pickReferenceReadings(readings);
  const wetReadingCount = latest.filter(
    (r) =>
      readingGoalStatus(
        { surfaceType: r.surfaceType, moistureLevel: r.moistureLevel, unit: r.unit },
        references,
      ).status !== "dry",
  ).length;
  const baselineCaptured = readings.some((r) => r.isBaseline);
  const monitoringPointCount = readings.filter((r) => r.isMonitoringPoint).length;

  const wdc = await prisma.waterDamageClassification.findUnique({
    where: { inspectionId: args.inspectionId },
    select: { waterCategory: true, damageClass: true },
  });

  const missingFields: string[] = [];
  if (!inspection.clientId) missingFields.push("clientId");
  if (!inspection.claimNumber) missingFields.push("claimNumber");
  if (!wdc?.waterCategory || !wdc?.damageClass) {
    missingFields.push("waterCategoryClass");
  }
  if (!inspection.report?.incidentDate) missingFields.push("incidentDate");
  if (!baselineCaptured) missingFields.push("baselineReading");

  return {
    inspectionId: inspection.id,
    stage: inspection.status,
    claimType: inspection.claimType,
    missingFields,
    wetReadingCount,
    baselineCaptured,
    monitoringPointCount,
    completenessHint:
      missingFields.length === 0
        ? null
        : `Complete: ${missingFields.join(", ")}`,
  };
}
