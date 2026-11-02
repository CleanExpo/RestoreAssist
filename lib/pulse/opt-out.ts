import { prisma } from "@/lib/prisma";

/**
 * Has this address opted out with this business on any client record?
 *
 * A contractor can hold the same person on several client rows. The withdrawal
 * belongs to the person, so it holds for the address across the business, but
 * not for a different business that also knows them.
 */
export async function isPulseOptedOutByAddress(
  userId: string,
  email: string,
): Promise<boolean> {
  const match = await prisma.client.findFirst({
    where: {
      userId,
      pulseOptOut: true,
      email: { equals: email.trim(), mode: "insensitive" },
    },
    select: { id: true },
  });
  return Boolean(match);
}
