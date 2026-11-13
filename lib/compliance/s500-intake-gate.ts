/**
 * P2 / V1 P1-8, P1-9 — S500 classification + loss timeline before scope work.
 */

import type { PrismaClient } from "@prisma/client";

export type S500IntakeGap =
  | "WATER_CATEGORY_CLASS"
  | "INCIDENT_DATE"
  | "ATTENDANCE_DATE";

export async function assessS500IntakeComplete(
  prisma: Pick<
    PrismaClient,
    "waterDamageClassification" | "inspection" | "report"
  >,
  inspectionId: string,
  reportId: string | null,
): Promise<{ ok: true } | { ok: false; gaps: S500IntakeGap[] }> {
  const gaps: S500IntakeGap[] = [];

  const wdc = await prisma.waterDamageClassification.findUnique({
    where: { inspectionId },
    select: { waterCategory: true, damageClass: true },
  });
  if (!wdc?.waterCategory || !wdc?.damageClass) {
    gaps.push("WATER_CATEGORY_CLASS");
  }

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: { createdAt: true },
  });

  let report: {
    incidentDate: Date | null;
    technicianAttendanceDate: Date | null;
  } | null = null;
  if (reportId) {
    report = await prisma.report.findUnique({
      where: { id: reportId },
      select: { incidentDate: true, technicianAttendanceDate: true },
    });
  }

  if (!report?.incidentDate) {
    gaps.push("INCIDENT_DATE");
  }
  if (!report?.technicianAttendanceDate && !inspection?.createdAt) {
    gaps.push("ATTENDANCE_DATE");
  }

  return gaps.length === 0 ? { ok: true } : { ok: false, gaps };
}
