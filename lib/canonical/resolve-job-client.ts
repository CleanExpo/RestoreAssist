/**
 * V1 Phase 3 (P3-2) — single resolver for the job's billing customer.
 */

import type { PrismaClient } from "@prisma/client";

type ClientRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
};

export async function resolveCanonicalClientForInspection(
  prisma: Pick<PrismaClient, "inspection" | "report" | "client">,
  args: { inspectionId: string; ownerUserId: string },
): Promise<ClientRow | null> {
  const inspection = await prisma.inspection.findFirst({
    where: { id: args.inspectionId, userId: args.ownerUserId },
    select: {
      clientId: true,
      reportId: true,
      report: { select: { clientId: true } },
    },
  });
  if (!inspection) return null;

  const clientId = inspection.clientId ?? inspection.report?.clientId ?? null;
  if (!clientId) return null;

  return prisma.client.findFirst({
    where: { id: clientId, userId: args.ownerUserId },
    select: {
      id: true,
      userId: true,
      name: true,
      email: true,
      phone: true,
      address: true,
    },
  });
}
