import { prisma } from "@/lib/prisma";

/**
 * Get the organization owner (Admin) for a user
 * Returns the user's own ID if they are an Admin or don't have an organization
 */
export async function getOrganizationOwner(
  userId: string,
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      organizationId: true,
      organization: {
        select: {
          ownerId: true,
        },
      },
    },
  });

  if (!user) {
    return null;
  }

  // If user is ADMIN, they are the owner
  if (user.role === "ADMIN") {
    return userId;
  }

  // If user has an organization, return the owner's ID
  if (user.organizationId && user.organization?.ownerId) {
    return user.organization.ownerId;
  }

  // No organization, return null
  return null;
}

/**
 * Get the effective subscription status and credits for a user
 * For Managers/Technicians, returns the Admin's subscription/credits
 * For Admins, returns their own subscription/credits
 */
export async function getEffectiveSubscription(userId: string): Promise<{
  id: string;
  subscriptionStatus: string | null;
  creditsRemaining: number | null;
  subscriptionPlan: string | null;
  monthlyReportsUsed: number | null;
  monthlyResetDate: Date | null;
  trialEndsAt: Date | null;
  addonReports: number | null;
} | null> {
  const ownerId = await getOrganizationOwner(userId);

  if (!ownerId) {
    // User has no organization, return their own data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        subscriptionStatus: true,
        creditsRemaining: true,
        subscriptionPlan: true,
        monthlyReportsUsed: true,
        monthlyResetDate: true,
        trialEndsAt: true,
        addonReports: true,
        lifetimeAccess: true,
      },
    });

    const status = user?.lifetimeAccess ? "ACTIVE" : user?.subscriptionStatus;
    const credits = user?.lifetimeAccess ? 999999 : user?.creditsRemaining;
    const plan = user?.lifetimeAccess ? "Lifetime" : user?.subscriptionPlan;

    return user
      ? {
          id: user.id,
          subscriptionStatus: status as string | null,
          creditsRemaining: credits as number | null,
          subscriptionPlan: plan as string | null,
          monthlyReportsUsed: user.monthlyReportsUsed,
          monthlyResetDate: user.monthlyResetDate,
          trialEndsAt: user.trialEndsAt,
          addonReports: user.addonReports,
        }
      : null;
  }

  // Get the owner's (Admin's) subscription data
  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: {
      id: true,
      subscriptionStatus: true,
      creditsRemaining: true,
      subscriptionPlan: true,
      monthlyReportsUsed: true,
      monthlyResetDate: true,
      trialEndsAt: true,
      addonReports: true,
      lifetimeAccess: true,
    },
  });

  const status = owner?.lifetimeAccess ? "ACTIVE" : owner?.subscriptionStatus;
  const credits = owner?.lifetimeAccess ? 999999 : owner?.creditsRemaining;
  const plan = owner?.lifetimeAccess ? "Lifetime" : owner?.subscriptionPlan;

  return owner
    ? {
        id: owner.id,
        subscriptionStatus: status as string | null,
        creditsRemaining: credits as number | null,
        subscriptionPlan: plan as string | null,
        monthlyReportsUsed: owner.monthlyReportsUsed,
        monthlyResetDate: owner.monthlyResetDate,
        trialEndsAt: owner.trialEndsAt,
        addonReports: owner.addonReports,
      }
    : null;
}

/**
 * RA-7893 — the business owner a RESOURCE (report, inspection) belongs to,
 * for billing work on it or reading its add-ons. Null when that cannot be
 * proven.
 *
 * Reports and inspections carry no tenant binding the app sets (workspaceId
 * is left null on every main creation path), so the tenant is inferred from
 * the creator. The creator's CURRENT organisation is the resource's
 * organisation only if the creator had already joined it when the resource
 * was created. Otherwise a technician who moved from org A to org B would
 * bill org B's owner for an org A job, and org A's portal would show org B's
 * add-ons.
 *
 * - The creator is their own owner (an ADMIN, or no organisation): the
 *   creator, exactly as getEffectiveSubscription resolves them.
 * - The creator is an invited member: their current owner, but only if the
 *   latest accepted invite into their current organisation was used at or
 *   before the resource was created. Invite acceptance is the only product
 *   path that puts a non-owner into an organisation, and it stamps usedAt.
 *   Invites accepted before the acceptance receipt existed (2026-08-25) have
 *   no acceptedUserId and are matched on the invite email.
 * - No such invite: null. The caller refuses; nobody is billed and no add-on
 *   is lent.
 */
export async function getResourceTenantOwner(
  creatorId: string,
  resourceCreatedAt: Date,
): Promise<string | null> {
  const ownerId = await getOrganizationOwner(creatorId);
  if (!ownerId || ownerId === creatorId) return creatorId;

  const creator = await prisma.user.findUnique({
    where: { id: creatorId },
    select: { organizationId: true, email: true },
  });
  if (!creator?.organizationId) return null;

  const joined = await prisma.userInvite.findFirst({
    where: {
      organizationId: creator.organizationId,
      usedAt: { not: null },
      OR: [
        { acceptedUserId: creatorId },
        {
          acceptedUserId: null,
          email: { equals: creator.email, mode: "insensitive" },
        },
      ],
    },
    select: { usedAt: true },
    orderBy: { usedAt: "desc" },
  });
  if (!joined?.usedAt) return null;
  return joined.usedAt.getTime() <= resourceCreatedAt.getTime()
    ? ownerId
    : null;
}

/**
 * RA-7893 — getEffectiveSubscription for work on a specific resource: the
 * plan, and the balance a trial charge lands on, of the business the
 * resource belongs to (getResourceTenantOwner). Null when that business
 * cannot be proven, which callers treat as "no current plan".
 */
export async function getEffectiveSubscriptionForResource(
  creatorId: string,
  resourceCreatedAt: Date,
): ReturnType<typeof getEffectiveSubscription> {
  const ownerId = await getResourceTenantOwner(creatorId, resourceCreatedAt);
  return ownerId ? getEffectiveSubscription(ownerId) : null;
}
