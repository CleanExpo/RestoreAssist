import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * RA-8668 - the one place a portal invitation's status changes.
 *
 * Every caller reads the invitation first and decides what to do from the
 * status it saw. Another request can change that status before the caller
 * writes, so no write here trusts the read: each is a compare-and-set that
 * names the statuses it may move from, and reports whether it changed the
 * row. A caller that gets `false` lost a race and must not act as though its
 * change happened.
 *
 *   PENDING            -> EXPIRED    markInvitationExpired
 *   PENDING            -> ACCEPTED   claimInvitationForAcceptance
 *   PENDING | EXPIRED  -> REVOKED    revokeOpenInvitation
 *   PENDING | EXPIRED  -> PENDING    reopenInvitation (a new expiry)
 *
 * ACCEPTED and REVOKED are final: nothing here moves an invitation out of
 * them. lib/portal/__tests__/invitation-status-single-owner.test.ts fails if
 * a status write appears anywhere else.
 */

/**
 * Marks a lapsed invitation EXPIRED. Changes nothing when it has since been
 * accepted or revoked, or when a resend gave it a new expiry after `now`.
 */
export async function markInvitationExpired(
  invitationId: string,
  now: Date,
): Promise<boolean> {
  const { count } = await prisma.portalInvitation.updateMany({
    where: { id: invitationId, status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });
  return count === 1;
}

/**
 * Marks an invitation ACCEPTED. Call it inside the transaction that creates
 * the portal account, before the account is created, and create nothing when
 * it returns `false`: the invitation was revoked, expired or accepted by
 * another request after it was read.
 */
export async function claimInvitationForAcceptance(
  tx: Prisma.TransactionClient,
  invitationId: string,
): Promise<boolean> {
  const { count } = await tx.portalInvitation.updateMany({
    where: { id: invitationId, status: "PENDING" },
    data: { status: "ACCEPTED", acceptedAt: new Date() },
  });
  return count === 1;
}

/**
 * Revokes an invitation the contractor owns while it is still open. Changes
 * nothing once it has been accepted.
 */
export async function revokeOpenInvitation(
  invitationId: string,
  userId: string,
): Promise<boolean> {
  const { count } = await prisma.portalInvitation.updateMany({
    where: {
      id: invitationId,
      status: { in: ["PENDING", "EXPIRED"] },
      userId,
    },
    data: { status: "REVOKED" },
  });
  return count === 1;
}

/**
 * Gives an open invitation a new expiry and makes it PENDING again, for a
 * resend. Changes nothing once it has been accepted or revoked.
 */
export async function reopenInvitation(
  invitationId: string,
  expiresAt: Date,
): Promise<boolean> {
  const { count } = await prisma.portalInvitation.updateMany({
    where: { id: invitationId, status: { in: ["PENDING", "EXPIRED"] } },
    data: { expiresAt, status: "PENDING" },
  });
  return count === 1;
}
