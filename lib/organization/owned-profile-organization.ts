/**
 * RA-8516: which organisation an owner's profile request is about.
 *
 * One owner may own several organisations. A bare
 * `findFirst({ where: { ownerId } })` has no order, so the database could
 * hand back a different one on each request and a save could land on the
 * wrong business. The rule, in order:
 *
 *   1. The organisation the owner is currently attached to
 *      (User.organizationId), when they own it. That is the organisation
 *      their staff, jobs and credits are counted against.
 *   2. Otherwise the oldest organisation they own (createdAt, then id), the
 *      same "oldest" rule ensureOwnerOrganization uses to attach an owner.
 *
 * A job's office notice cannot settle this: for an owner who owns several
 * organisations it deliberately names none. Rule 2 is a product choice
 * recorded for the founder in the RA-8516 PR.
 *
 * Returns the organisation id, or null when the user owns none.
 */

import { prisma } from "@/lib/prisma";

export async function resolveOwnedProfileOrganizationId(
  userId: string,
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  });
  if (user?.organizationId) {
    const current = await prisma.organization.findFirst({
      where: { id: user.organizationId, ownerId: userId },
      select: { id: true },
    });
    if (current) return current.id;
  }
  const oldest = await prisma.organization.findFirst({
    where: { ownerId: userId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return oldest?.id ?? null;
}
