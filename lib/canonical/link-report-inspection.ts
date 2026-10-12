/**
 * V1 Phase 3 (P3-1) — link inspection ↔ report without address-string joins.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

export async function linkInspectionToReport(
  tx: Tx,
  args: {
    inspectionId: string;
    reportId: string;
    userId: string;
    clientId?: string | null;
  },
): Promise<{ linked: boolean }> {
  const report = await tx.report.findFirst({
    where: { id: args.reportId, userId: args.userId },
    select: { id: true, clientId: true },
  });
  if (!report) return { linked: false };

  const updated = await tx.inspection.updateMany({
    where: {
      id: args.inspectionId,
      userId: args.userId,
      OR: [{ reportId: null }, { reportId: args.reportId }],
    },
    data: {
      reportId: args.reportId,
      clientId: args.clientId ?? report.clientId ?? undefined,
    },
  });
  return { linked: updated.count > 0 };
}
