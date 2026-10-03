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
 * - The creator is in no organisation now. Member removal and the owner's
 *   account deletion both stamp organizationLeftAt (when) and
 *   organizationLeftId (which organisation); only the latest leave is kept.
 *   - Resource at or after organizationLeftAt: the creator.
 *   - No leave date: the creator if they had accepted no invite by the
 *     resource's createdAt, else null (a removal from before the columns
 *     existed; fail closed).
 *   - Resource before organizationLeftAt: only the LAST recorded
 *     membership interval is trusted, from the latest invite accepted into
 *     organizationLeftId (lastJoin) to organizationLeftAt. Inside it: that
 *     organisation's owner. Before lastJoin: null, always (an earlier
 *     membership may have been erased with its owner's account, so no
 *     missing invite proves nothing). No invite into
 *     organizationLeftId left (erased by the owner deleting their account),
 *     or no organizationLeftId: null.
 */
export async function getResourceTenantOwner(
  creatorId: string,
  resourceCreatedAt: Date,
): Promise<string | null> {
  const ownerId = await getOrganizationOwner(creatorId);
  if (ownerId === creatorId) return creatorId;

  const creator = await prisma.user.findUnique({
    where: { id: creatorId },
    select: {
      organizationId: true,
      email: true,
      organizationLeftAt: true,
      organizationLeftId: true,
    },
  });
  if (!ownerId) {
    // Unknown user, or an organisation row with no owner: unchanged.
    if (!creator || creator.organizationId) return creatorId;
    return removedMemberTenantOwner(creatorId, creator, resourceCreatedAt);
  }
  if (!creator?.organizationId) return null;

  const joined = await prisma.userInvite.findFirst({
    where: {
      organizationId: creator.organizationId,
      usedAt: { not: null },
      OR: acceptedBy(creatorId, creator.email),
    },
    select: { usedAt: true },
    orderBy: { usedAt: "desc" },
  });
  if (!joined?.usedAt) return null;
  return joined.usedAt.getTime() <= resourceCreatedAt.getTime()
    ? ownerId
    : null;
}

/** Invites this user accepted: by receipt, or (pre-receipt) by email. */
function acceptedBy(userId: string, email: string) {
  return [
    { acceptedUserId: userId },
    {
      acceptedUserId: null,
      email: { equals: email, mode: "insensitive" as const },
    },
  ];
}

async function removedMemberTenantOwner(
  creatorId: string,
  creator: {
    email: string;
    organizationLeftAt: Date | null;
    organizationLeftId: string | null;
  },
  resourceCreatedAt: Date,
): Promise<string | null> {
  const leftAt = creator.organizationLeftAt;
  if (!leftAt) {
    // No leave on record: theirs if they had joined nothing by then, else a
    // removal from before the columns existed (fail closed).
    const joinedBefore = await acceptedInviteAtOrBefore(
      creatorId,
      creator.email,
      resourceCreatedAt,
    );
    return joinedBefore ? null : creatorId;
  }
  if (resourceCreatedAt.getTime() >= leftAt.getTime()) return creatorId;

  // Only the LAST membership interval is recorded: from the latest accepted
  // invite into the organisation they left, to organizationLeftAt.
  const leftOrgId = creator.organizationLeftId;
  if (!leftOrgId) return null;
  const lastJoin = await prisma.userInvite.findFirst({
    where: {
      organizationId: leftOrgId,
      usedAt: { not: null },
      OR: acceptedBy(creatorId, creator.email),
    },
    select: { usedAt: true, organization: { select: { ownerId: true } } },
    orderBy: { usedAt: "desc" },
  });
  // No invite into it survives (erased by the owner deleting their account).
  if (!lastJoin?.usedAt) return null;
  // Before the last join: null, always. An earlier membership may have had
  // its invites erased by an owner deleting their account, so finding no
  // invite before the resource is not evidence the creator made it alone.
  return lastJoin.usedAt.getTime() <= resourceCreatedAt.getTime()
    ? (lastJoin.organization?.ownerId ?? null)
    : null;
}

/** Whether the user had accepted any invite, into any organisation, by `at`. */
async function acceptedInviteAtOrBefore(
  userId: string,
  email: string,
  at: Date,
): Promise<boolean> {
  const invite = await prisma.userInvite.findFirst({
    where: {
      usedAt: { not: null, lte: at },
      OR: acceptedBy(userId, email),
    },
    select: { usedAt: true },
  });
  return Boolean(invite);
}

/**
 * RA-7893 — the one rule for a logged-in route that charges, sends or uses a
 * paid add-on while acting on one resource (job, report, invoice): true only
 * when the business the RESOURCE belongs to (getResourceTenantOwner, from
 * its creator and createdAt) is proven AND is the caller's billing business
 * (their organisation owner, or themselves).
 *
 * That covers the creator who has since moved (their old job resolves to no
 * business, or to a different one) and the colleague: an admin of the
 * organisation a technician joined later passes the tenancy check on that
 * technician's older jobs, but those jobs do not bill to the admin.
 */
export async function resourceBillsToCaller(
  callerId: string,
  resource: { userId: string; createdAt: Date },
): Promise<boolean> {
  const resourceOwner = await getResourceTenantOwner(
    resource.userId,
    resource.createdAt,
  );
  if (!resourceOwner) return false;
  const callerOwner = (await getOrganizationOwner(callerId)) ?? callerId;
  return resourceOwner === callerOwner;
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
