import type { Prisma } from "@prisma/client";

/**
 * The inspection filter for a portal link.
 *
 * A link sent for one job opens that job. A link issued before the binding
 * existed (`inspectionId` null) keeps resolving to the client's newest job. A
 * bound link whose job is gone matches nothing: it must never fall back to a
 * different job of the same client (WP-02).
 */
export function portalInspectionWhere(account: {
  clientId: string;
  inspectionId: string | null;
}): Prisma.InspectionWhereInput {
  const ofClient = { report: { clientId: account.clientId } };
  return account.inspectionId
    ? { id: account.inspectionId, ...ofClient }
    : ofClient;
}
