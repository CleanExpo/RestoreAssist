import type { Prisma } from "@prisma/client";

export function portalInspectionWhere(account: {
  clientId: string;
  inspectionId: string | null;
}): Prisma.InspectionWhereInput {
  const ofClient = { report: { clientId: account.clientId } };
  return account.inspectionId
    ? { id: account.inspectionId, ...ofClient }
    : ofClient;
}
