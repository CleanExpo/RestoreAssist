import type { Prisma } from "@prisma/client";
import { getResourceTenant } from "@/lib/organization-credits";
import { prisma } from "@/lib/prisma";
import { pulseAddressTag } from "./pulse-unsubscribe-token";

const MEMBER_SCAN_CAP = 5000;

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Authoritative Pulse consent identity for a staff user.
 *
 * Organisation id when the user belongs to one, or owns one. Null means we
 * cannot join colleagues' client tables — callers then stay on that user's
 * own rows (fail closed for cross-account leakage).
 */
export async function resolvePulseOrganisationId(
  userId: string,
  db: Db = prisma,
): Promise<string | null> {
  const findUser = db.user?.findUnique;
  if (typeof findUser !== "function") return null;
  const user = await findUser({
    where: { id: userId },
    select: { organizationId: true },
  });
  if (!user) return null;
  if (typeof user.organizationId === "string" && user.organizationId.length > 0) {
    return user.organizationId;
  }
  const findOwned = db.organization?.findFirst;
  if (typeof findOwned !== "function") return null;
  const owned = await findOwned({
    where: { ownerId: userId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return owned?.id ?? null;
}

/**
 * Current members only. A former member can still hold Client rows after they
 * leave; scanning those would let them lock this firm's address after they
 * left. Org-wide consent lives on PulseOrgAddressOptOut, written while they
 * were a member (or by a current colleague / the public unsubscribe token).
 */
export async function pulseOrganisationMemberIds(
  organizationId: string,
  db: Db = prisma,
): Promise<string[]> {
  const findMany = db.user?.findMany;
  if (typeof findMany !== "function") return [];
  const current = await findMany({
    where: { organizationId },
    select: { id: true },
    take: MEMBER_SCAN_CAP,
  });
  return [...new Set(current.map((row) => row.id))];
}

/**
 * The organisation a Pulse send belongs to: the job's proven firm, not
 * whoever the creator joined later.
 *
 * `getResourceTenant` names the organisation for invited members, and returns
 * a self-tenant with `organizationId: null` for ADMIN / org-owner creators.
 * In that self-tenant case we fill in the organisation they currently own or
 * belong to, so owner-created jobs still bind unsubscribe and the address lock
 * to the firm. Null tenant (unproven) stays unpinned — fail closed, no live
 * membership guess.
 */
export async function resolvePulseJobOrganisationId(
  userId: string,
  jobCreatedAt: Date,
): Promise<string | null> {
  const tenant = await getResourceTenant(userId, jobCreatedAt);
  if (tenant?.organizationId) return tenant.organizationId;
  if (!tenant) return null;
  if (tenant.ownerId === userId) {
    return resolvePulseOrganisationId(userId);
  }
  return null;
}

async function withConsentLock<T>(
  organizationId: string | null,
  addressTag: string | null,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  if (
    !organizationId ||
    !addressTag ||
    typeof prisma.$transaction !== "function"
  ) {
    return fn(prisma);
  }
  return prisma.$transaction(async (tx) => {
    if (typeof tx.$executeRaw === "function") {
      const lockKey = `pulse-opt-out:${organizationId}:${addressTag}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    }
    return fn(tx);
  });
}

function tagFor(email: string): string | null {
  try {
    return pulseAddressTag(email);
  } catch {
    return null;
  }
}

async function orgAddressLocked(
  organizationId: string,
  addressTag: string,
  db: Db,
): Promise<boolean> {
  const find = db.pulseOrgAddressOptOut?.findUnique;
  if (typeof find !== "function") return false;
  const row = await find({
    where: { organizationId_addressTag: { organizationId, addressTag } },
    select: { id: true },
  });
  return Boolean(row);
}

/**
 * Persist the address lock for this organisation. Identity (Client.pulseOptOut)
 * is written by the caller on the person; this is what survives an email change.
 */
export async function recordPulseAddressLock(input: {
  ownerUserId: string;
  email?: string | null;
  addressTag?: string | null;
  sourceClientId?: string;
  /**
   * When set, this organisation is locked — not the owner's live membership.
   * Unsubscribe tokens pin the job's firm here so a later join cannot.
   */
  organizationId?: string | null;
}): Promise<{ organizationId: string | null; addressTag: string | null }> {
  const addressTag =
    input.addressTag ??
    (input.email && input.email.trim() ? tagFor(input.email) : null);
  const organizationId =
    input.organizationId !== undefined
      ? input.organizationId
      : await resolvePulseOrganisationId(input.ownerUserId);
  if (!organizationId || !addressTag) {
    return { organizationId, addressTag };
  }

  await withConsentLock(organizationId, addressTag, async (tx) => {
    const upsert = tx.pulseOrgAddressOptOut?.upsert;
    if (typeof upsert !== "function") return;
    await upsert({
      where: { organizationId_addressTag: { organizationId, addressTag } },
      create: {
        organizationId,
        addressTag,
        sourceClientId: input.sourceClientId,
        sourceUserId: input.ownerUserId,
      },
      update: {},
    });
  });
  return { organizationId, addressTag };
}

/**
 * Apply a withdrawal to the person and to the organisation's address lock.
 *
 * `optOutNamedClient` is false when a bound link names an old address after
 * the row was re-homed: the replacement address did not ask to stop.
 */
export async function recordPulseOptOut(input: {
  clientId: string;
  ownerUserId: string;
  email?: string | null;
  addressTag?: string | null;
  optOutNamedClient?: boolean;
}): Promise<{ records: number; organizationId: string | null }> {
  const optOutNamedClient = input.optOutNamedClient !== false;
  const email = input.email?.trim() || null;
  const addressTag = input.addressTag ?? (email ? tagFor(email) : null);
  const organizationId = await resolvePulseOrganisationId(input.ownerUserId);
  const memberIds = organizationId
    ? await pulseOrganisationMemberIds(organizationId)
    : [];
  const scopeUserIds =
    memberIds.length > 0 ? memberIds : [input.ownerUserId];

  await recordPulseAddressLock({
    ownerUserId: input.ownerUserId,
    email,
    addressTag,
    sourceClientId: input.clientId,
  });

  let records = 0;
  if (email) {
    const updated = await prisma.client.updateMany({
      where: {
        userId: { in: scopeUserIds },
        email: { equals: email, mode: "insensitive" },
      },
      data: { pulseOptOut: true },
    });
    records += updated.count;
  } else if (addressTag) {
    const held = await prisma.client.findMany({
      where: { userId: { in: scopeUserIds } },
      select: { id: true, email: true },
      take: MEMBER_SCAN_CAP,
    });
    const ids = held
      .filter((row) => row.email && tagFor(row.email) === addressTag)
      .map((row) => row.id);
    if (ids.length) {
      const updated = await prisma.client.updateMany({
        where: { id: { in: ids }, userId: { in: scopeUserIds } },
        data: { pulseOptOut: true },
      });
      records += updated.count;
    }
  }

  if (optOutNamedClient) {
    const named = await prisma.client.updateMany({
      where: { id: input.clientId, userId: input.ownerUserId },
      data: { pulseOptOut: true },
    });
    records = Math.max(records, named.count);
  }

  return { records, organizationId };
}

/**
 * Has this address withdrawn from this business?
 *
 * Reads, in order:
 *  1. PulseOrgAddressOptOut for the organisation (canonical address lock)
 *  2. Client.pulseOptOut on current and former members still holding the address
 *     (legacy staff-level rows, promoted into the org table when found). A row
 *     that already sourced a lock is identity-only: its live email is not
 *     promoted, so a replacement address is not locked.
 *  3. This user's own Client.pulseOptOut rows when there is no organisation
 *
 * A missing HMAC secret cannot fingerprint the address, so the send is
 * suppressed rather than mailed without a consent check.
 */
export async function isPulseOptedOutByAddress(
  userId: string,
  email: string,
  pinnedOrganizationId?: string | null,
): Promise<boolean> {
  const trimmed = email.trim();
  if (!trimmed) return false;

  const organizationId =
    pinnedOrganizationId !== undefined
      ? pinnedOrganizationId
      : await resolvePulseOrganisationId(userId);
  const addressTag = tagFor(trimmed);
  if (organizationId && !addressTag) return true;

  return withConsentLock(organizationId, addressTag, async (tx) => {
    if (organizationId && addressTag) {
      if (await orgAddressLocked(organizationId, addressTag, tx)) return true;

      const memberIds = await pulseOrganisationMemberIds(organizationId, tx);
      const scopeUserIds = memberIds.length > 0 ? memberIds : [userId];
      if (scopeUserIds.length > 0) {
        const legacy = await tx.client.findFirst({
          where: {
            userId: { in: scopeUserIds },
            pulseOptOut: true,
            email: { equals: trimmed, mode: "insensitive" },
          },
          select: { id: true },
        });
        if (legacy) {
          // A row that already sourced an address lock is identity-only after
          // that. Promoting its live email would lock a replacement address
          // the person never withdrew.
          const findSourced = tx.pulseOrgAddressOptOut?.findFirst;
          const alreadySourced =
            typeof findSourced === "function"
              ? await findSourced({
                  where: { organizationId, sourceClientId: legacy.id },
                  select: { id: true },
                })
              : null;
          if (alreadySourced) return false;

          const upsert = tx.pulseOrgAddressOptOut?.upsert;
          if (typeof upsert === "function") {
            await upsert({
              where: {
                organizationId_addressTag: { organizationId, addressTag },
              },
              create: {
                organizationId,
                addressTag,
                sourceClientId: legacy.id,
                sourceUserId: userId,
              },
              update: {},
            });
          }
          return true;
        }
      }
      return false;
    }

    const match = await tx.client.findFirst({
      where: {
        userId,
        pulseOptOut: true,
        email: { equals: trimmed, mode: "insensitive" },
      },
      select: { id: true },
    });
    return Boolean(match);
  });
}
