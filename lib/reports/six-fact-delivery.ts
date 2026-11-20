/**
 * P2 / V1 P1-5 — six-fact report delivery state derived from authoritative events.
 */

import type { PrismaClient, ReportStatus } from "@prisma/client";
import { REPORT_DELIVERY_EVIDENCE_ACTIONS } from "@/lib/lifecycle/report-delivery";

export type ReportDeliveryFacts = {
  generated: boolean;
  approved: boolean;
  sent: boolean;
  delivered: boolean;
  acknowledged: boolean;
  superseded: boolean;
  reportStatus: ReportStatus;
};

export async function loadReportDeliveryFacts(
  prisma: Pick<PrismaClient, "report" | "auditLog" | "reportApproval">,
  reportId: string,
): Promise<ReportDeliveryFacts | null> {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: { status: true, createdAt: true, updatedAt: true },
  });
  if (!report) return null;

  const audits = await prisma.auditLog.findMany({
    where: { entityType: "Report", entityId: reportId },
    select: { action: true },
    take: 200,
    orderBy: { timestamp: "desc" },
  });
  const actions = new Set(audits.map((a) => a.action));

  const costApproval = await prisma.reportApproval.findFirst({
    where: { reportId, approvalType: "COST_ESTIMATE", status: "APPROVED" },
    select: { id: true },
  });

  const generated = Boolean(report.createdAt);
  const approved =
    report.status === "APPROVED" ||
    report.status === "COMPLETED" ||
    Boolean(costApproval);
  const sent = actions.has("REPORT_SENT") || report.status === "COMPLETED";
  const delivered =
    REPORT_DELIVERY_EVIDENCE_ACTIONS.some((a) => actions.has(a)) ||
    report.status === "COMPLETED";
  const acknowledged = actions.has("REPORT_ACKNOWLEDGED");
  const superseded =
    report.status === "ARCHIVED" || actions.has("REPORT_SUPERSEDED");

  return {
    generated,
    approved,
    sent,
    delivered,
    acknowledged,
    superseded,
    reportStatus: report.status,
  };
}
