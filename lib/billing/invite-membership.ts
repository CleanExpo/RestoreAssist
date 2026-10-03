/**
 * RA-7893 — telling a membership-starting UserInvite from a role-change audit
 * row.
 *
 * POST /api/team/invites, for someone already in the same organisation,
 * changes their role and writes a UserInvite with usedAt set in the same
 * insert and no acceptedUserId: an audit of the change, not a join. Treated
 * as a join, it moved the member's join date forward and made their older
 * jobs unprovable.
 *
 * - From now on the route marks those rows with this acceptanceProvider.
 * - Rows written before the marker are told apart by shape. An invite that
 *   someone accepts is created when it is sent and used later, from the
 *   email. An audit row's usedAt equals its createdAt (one insert, both
 *   stamped by the app within milliseconds).
 * - That shape is not unique to audits. Until April 2026 the same route also
 *   added members directly with an already-used invite. So an unmarked
 *   instant row is a join only when it is the user's earliest acceptance into
 *   that organisation; after an earlier acceptance it is a role change.
 */

export const ROLE_CHANGE_AUDIT_PROVIDER = "role-change-audit";

/** Same-insert stamps differ by milliseconds; a real accept takes far longer. */
const SAME_INSERT_MS = 5_000;

export interface InviteAcceptanceShape {
  usedAt: Date | null;
  createdAt?: Date | null;
  acceptedUserId?: string | null;
  acceptanceProvider?: string | null;
}

export function isMarkedRoleChangeAudit(row: InviteAcceptanceShape): boolean {
  return row.acceptanceProvider === ROLE_CHANGE_AUDIT_PROVIDER;
}

/**
 * An unmarked row used in the same insert that created it, with no
 * acceptance receipt: a role-change audit or a historical direct add.
 */
export function isInstantUnreceiptedInvite(
  row: InviteAcceptanceShape,
): boolean {
  if (row.acceptedUserId || row.acceptanceProvider) return false;
  if (!row.usedAt || !row.createdAt) return false;
  return (
    Math.abs(row.usedAt.getTime() - row.createdAt.getTime()) < SAME_INSERT_MS
  );
}
