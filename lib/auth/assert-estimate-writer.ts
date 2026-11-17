import { prisma } from "@/lib/prisma";

/** Estimate read/write authority is ownership, not capture or assignment access. */
export function assertEstimateWriter(session: { user: { id: string } }, id: string) {
  return prisma.inspection.findFirst({
    where: { id, userId: session.user.id },
    select: {
      id: true, status: true, propertyPostcode: true, propertyCountry: true, createdAt: true,
      scopeItems: { where: { isSelected: true }, take: 10000, select: {
        id: true, itemType: true, description: true, quantity: true, unit: true,
        specification: true, justification: true,
      } },
    },
  });
}
