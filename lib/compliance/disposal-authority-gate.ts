/**
 * P2 / V1 P1-11 — strip-out / disposal scope requires recorded authority.
 */

import type { PrismaClient } from "@prisma/client";

export const DISPOSAL_AUTHORITY_AUDIT_ACTION = "DISPOSAL_AUTHORITY_RECORDED";

const DISPOSAL_ITEM_PATTERN =
  /(?:remove_|strip_|demolish|dispose|disposal|waste_haul)/i;

export function scopeItemRequiresDisposalAuthority(itemType: string): boolean {
  return DISPOSAL_ITEM_PATTERN.test(itemType);
}

export async function hasDisposalAuthorityForInspection(
  prisma: Pick<PrismaClient, "auditLog">,
  inspectionId: string,
): Promise<boolean> {
  const row = await prisma.auditLog.findFirst({
    where: {
      inspectionId,
      action: DISPOSAL_AUTHORITY_AUDIT_ACTION,
    },
    select: { id: true },
  });
  return Boolean(row);
}
