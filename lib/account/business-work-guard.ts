import { prisma } from "@/lib/prisma";
import { getMembershipStart } from "@/lib/organization-credits";

/**
 * Whether deleting this account would destroy work that belongs to a business.
 *
 * `Inspection.user` and `Client.user` cascade, so deleting a user deletes every
 * job and client they created. For a member of a business that is the
 * business's data (walkthrough finding 4, WP-04). Refuse while they are a
 * current non-owner member, or a removed member who still holds work made
 * inside their membership window. Work from before they joined or after they
 * left is theirs, so a removed member holding only that may delete freely.
 * An unproven join date counts the whole history before the leave.
 */
export async function businessWorkBlocksDeletion(
  userId: string,
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      organizationId: true,
      organization: { select: { ownerId: true } },
      organizationLeftAt: true,
      organizationLeftId: true,
    },
  });
  if (!user) return false;

  const ownerId = user.organization?.ownerId;
  if (user.organizationId && ownerId && ownerId !== userId) return true;

  if (user.organizationLeftAt && user.organizationLeftId) {
    const from =
      (await getMembershipStart(userId, user.email, user.organizationLeftId)) ??
      new Date(0);
    const window = { gte: from, lt: user.organizationLeftAt };
    const [jobs, clients] = await Promise.all([
      prisma.inspection.count({ where: { userId, createdAt: window } }),
      prisma.client.count({ where: { userId, createdAt: window } }),
    ]);
    return jobs + clients > 0;
  }
  return false;
}
