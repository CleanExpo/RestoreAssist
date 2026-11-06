import type { Prisma } from "@prisma/client";
import { getResourceTenant } from "@/lib/organization-credits";
import { prisma } from "@/lib/prisma";
import { pulseAddressTag } from "./pulse-unsubscribe-token";

const MEMBER_SCAN_CAP = 5000;

type Db = Prisma.TransactionClient | typeof prisma;

export class PulseAddressLockWriteError extends Error {
  constructor(message = "Pulse address lock could not be written") {
    super(message);
    this.name = "PulseAddressLockWriteError";
  }
}

/**
 * Organisations this user owns. Null means we cannot list them, so callers
 * fail closed instead of picking an arbitrary (e.g. oldest) firm.
 */
async function ownedOrganisationIds(
  userId: string,
  db: Db,
): Promise<string[] | null> {
  const findMany = db.organization?.findMany;
  if (typeof findMany !== "function") return null;
  try {
    const rows = await findMany({
      where: { ownerId: userId },
      select: { id: true },
      take: 2,
    });
    return rows.map((row) => row.id);
  } catch {
    return null;
  }
}

/**
 * Authoritative Pulse consent identity for a staff user acting now
 * (contractor PUT, unpinned address check).
 *
 * Membership first. Else the unique organisation they own. Two or more owned
 * organisations with no membership cannot be disambiguated — null, never the
 * oldest. Callers then stay on that user's own rows.
 */
export async function resolvePulseOrganisationId(
  userId: string,
  db: Db = prisma,
): Promise<string | null> {
  const findUser = db.user?.findUnique;
  if (typeof findUser !== "function") {
    throw new PulseAddressLockWriteError(
      "Pulse organisation cannot be resolved",
    );
  }
  const user = await findUser({
    where: { id: userId },
    select: { organizationId: true },
  });
  if (!user) return null;
  if (typeof user.organizationId === "string" && user.organizationId.length > 0) {
    return user.organizationId;
  }
  const owned = await ownedOrganisationIds(userId, db);
  // Cannot list owned firms is not the same as "no organisation" — a write
  // that skipped the lock here would report success and mail after a change.
  if (owned === null) {
    throw new PulseAddressLockWriteError(
      "Pulse organisation cannot be resolved",
    );
  }
  if (owned.length !== 1) return null;
  return owned[0];
}

/**
 * Current members plus the proven Organisation.ownerId.
 *
 * Owners often have `User.organizationId` null and sit only on
 * `Organization.ownerId`. Leaving them out of this set would skip a
 * pre-migration `Client.pulseOptOut` on the owner's table, so a colleague
 * could keep mailing an address that already withdrew. Former members stay
 * out: after they leave they can still hold Client rows, and scanning those
 * would let them lock this firm's address.
 *
 * No SQL backfill of PulseOrgAddressOptOut: the tag is an HMAC of the
 * address (needs the unsubscribe secret) and promoting a row's live email
 * could lock a replacement address. The next send promotes a still-current
 * owner flag into the lock table.
 */
export async function pulseOrganisationMemberIds(
  organizationId: string,
  db: Db = prisma,
): Promise<string[] | null> {
  const findMany = db.user?.findMany;
  if (typeof findMany !== "function") return null;
  try {
    const current = await findMany({
      where: { organizationId },
      select: { id: true },
      take: MEMBER_SCAN_CAP,
    });
    const ids = current.map((row) => row.id);
    const findOrg = db.organization?.findUnique;
    if (typeof findOrg !== "function") return null;
    const org = await findOrg({
      where: { id: organizationId },
      select: { ownerId: true },
    });
    if (typeof org?.ownerId === "string" && org.ownerId.length > 0) {
      ids.push(org.ownerId);
    }
    return [...new Set(ids)];
  } catch {
    return null;
  }
}

export type PulseJobOrganisation = {
  organizationId: string | null;
  /**
   * The job's firm cannot be proven. Callers must not send and must not mint
   * an org-unbound unsubscribe token. Null, thrown, or mismatched tenants are
   * ambiguous — never a user-scoped send that would miss a colleague lock.
   */
  ambiguous: boolean;
};

/**
 * The organisation a Pulse send belongs to: the job's proven firm, not
 * whoever the creator joined later, and not an arbitrary owned org.
 *
 * `getResourceTenant` names the organisation for invited members, and returns
 * a self-tenant with `organizationId: null` for ADMIN / org-owner creators.
 * A self-tenant who owns exactly one organisation uses that firm. Two or more
 * owned organisations cannot be told apart from the job, so the result is
 * ambiguous (fail closed). A null or thrown tenant is also ambiguous: the
 * send is suppressed rather than mailed on the creator's rows alone.
 */
export async function resolvePulseJobOrganisationId(
  userId: string,
  jobCreatedAt: Date,
): Promise<PulseJobOrganisation> {
  let tenant: Awaited<ReturnType<typeof getResourceTenant>> = null;
  try {
    tenant = await getResourceTenant(userId, jobCreatedAt);
  } catch {
    return { organizationId: null, ambiguous: true };
  }
  if (tenant?.organizationId) {
    return { organizationId: tenant.organizationId, ambiguous: false };
  }
  if (!tenant) return { organizationId: null, ambiguous: true };
  if (tenant.ownerId !== userId) {
    return { organizationId: null, ambiguous: true };
  }
  const owned = await ownedOrganisationIds(userId, prisma);
  if (owned === null) return { organizationId: null, ambiguous: true };
  if (owned.length === 1) {
    return { organizationId: owned[0], ambiguous: false };
  }
  if (owned.length === 0) {
    return { organizationId: null, ambiguous: false };
  }
  return { organizationId: null, ambiguous: true };
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
  if (typeof find !== "function") return true;
  try {
    const row = await find({
      where: { organizationId_addressTag: { organizationId, addressTag } },
      select: { id: true },
    });
    return Boolean(row);
  } catch {
    return true;
  }
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
  if (organizationId && (input.email?.trim() || input.addressTag) && !addressTag) {
    throw new PulseAddressLockWriteError(
      "Pulse address lock cannot be fingerprinted",
    );
  }
  if (!organizationId || !addressTag) {
    return { organizationId, addressTag };
  }

  await withConsentLock(organizationId, addressTag, async (tx) => {
    const upsert = tx.pulseOrgAddressOptOut?.upsert;
    if (typeof upsert !== "function") {
      throw new PulseAddressLockWriteError();
    }
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
    memberIds && memberIds.length > 0 ? memberIds : [input.ownerUserId];

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
 *  2. Client.pulseOptOut on current members and the proven owner still holding
 *     the address (legacy staff-level rows, promoted into the org table when
 *     found). Every matching unsourced row is checked: a sourced sibling must
 *     not hide another withdrawal. A sourced row is identity-only — its live
 *     email is not promoted, so a replacement address is not locked.
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

  try {
    const organizationId =
      pinnedOrganizationId !== undefined
        ? pinnedOrganizationId
        : await resolvePulseOrganisationId(userId);
    const addressTag = tagFor(trimmed);
    if (organizationId && !addressTag) return true;

    return await withConsentLock(organizationId, addressTag, async (tx) => {
      if (organizationId && addressTag) {
        const upsert = tx.pulseOrgAddressOptOut?.upsert;
        // A missing writer cannot persist a lock. Do not send; a later email
        // change would otherwise resume mail to an address that withdrew.
        if (typeof upsert !== "function") return true;
        if (await orgAddressLocked(organizationId, addressTag, tx)) return true;

        const memberIds = await pulseOrganisationMemberIds(organizationId, tx);
        if (memberIds === null) return true;
        if (memberIds.length >= MEMBER_SCAN_CAP) return true;
        const scopeUserIds = memberIds.length > 0 ? memberIds : [userId];
        if (scopeUserIds.length > 0) {
          const findLegacy = tx.client.findMany;
          if (typeof findLegacy !== "function") return true;
          const legacyRows = await findLegacy({
            where: {
              userId: { in: scopeUserIds },
              pulseOptOut: true,
              email: { equals: trimmed, mode: "insensitive" },
            },
            select: { id: true },
            take: MEMBER_SCAN_CAP,
          });
          if (legacyRows.length >= MEMBER_SCAN_CAP) return true;
          const findSourced = tx.pulseOrgAddressOptOut?.findFirst;
          if (legacyRows.length > 0 && typeof findSourced !== "function") {
            return true;
          }
          for (const legacy of legacyRows) {
            // A row that already sourced an address lock is identity-only after
            // that. Promoting its live email would lock a replacement address
            // the person never withdrew. Another matching row may still be a
            // real withdrawal — skip sourced rows, do not return false yet.
            const alreadySourced = await findSourced!({
              where: { sourceClientId: legacy.id },
              select: { id: true, organizationId: true },
            });
            if (alreadySourced) continue;

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
            return true;
          }
        }
        return false;
      }

      const findOwn = tx.client.findFirst;
      if (typeof findOwn !== "function") return true;
      const match = await findOwn({
        where: {
          userId,
          pulseOptOut: true,
          email: { equals: trimmed, mode: "insensitive" },
        },
        select: { id: true },
      });
      return Boolean(match);
    });
  } catch {
    return true;
  }
}
