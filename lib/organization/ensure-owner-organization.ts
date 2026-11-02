import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureWorkspaceForUser } from "@/lib/workspace/provision";

export class OwnerOrganizationRefused extends Error {
  constructor() {
    super("Only a business owner can hold an organisation");
    this.name = "OwnerOrganizationRefused";
  }
}

class ClaimLost extends Error {}

/**
 * The one way an owner gets an organisation after signup.
 *
 * Reads role and invite state from the database inside the transaction, so no
 * caller can turn a technician, a manager or a pending invited identity into an
 * owner. "No organisation" means owns none and belongs to none: an owner who
 * already owns one is attached to the oldest instead of getting a second.
 * `userData` is written in the same transaction as the claim.
 */
export async function ensureOwnerOrganization(
  userId: string,
  opts: { name?: string; userData?: Prisma.UserUpdateInput } = {},
): Promise<string> {
  let organizationId: string;
  try {
    organizationId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          name: true,
          role: true,
          organizationId: true,
          pendingInviteIdentity: true,
        },
      });
      if (!user || user.role !== "ADMIN" || user.pendingInviteIdentity) {
        throw new OwnerOrganizationRefused();
      }
      if (opts.userData) {
        await tx.user.update({ where: { id: userId }, data: opts.userData });
      }
      if (user.organizationId) return user.organizationId;

      const owned = await tx.organization.findFirst({
        where: { ownerId: userId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      const org =
        owned ??
        (await tx.organization.create({
          data: {
            name: opts.name || `${user.name || "Account"} Organisation`,
            ownerId: userId,
          },
        }));
      const claimed = await tx.user.updateMany({
        where: { id: userId, organizationId: null },
        data: { organizationId: org.id },
      });
      // Throwing rolls back the organisation this request just created.
      if (claimed.count !== 1) throw new ClaimLost();
      return org.id;
    });
  } catch (error) {
    if (!(error instanceof ClaimLost)) throw error;
    const winner = await prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });
    if (!winner?.organizationId) throw error;
    organizationId = winner.organizationId;
  }

  try {
    await ensureWorkspaceForUser(userId);
  } catch (error) {
    // A second tab won the same slug and has committed, so this read finds its workspace.
    const raced =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002";
    if (!raced) throw error;
    await ensureWorkspaceForUser(userId);
  }
  return organizationId;
}
