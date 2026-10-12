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
 * - That shape is not unique to audits. The same route also added or re-added
 *   members directly with an already-used invite, so an unmarked instant row
 *   is classified by when it was written:
 *   - It is the user's earliest acceptance into that organisation: a join
 *     (a direct add). Nothing earlier could have made them a member.
 *   - After an earlier acceptance, inside the direct-add era: ambiguous. It
 *     may be a re-add after a removal, so the resolver treats it as a
 *     membership start. Jobs before it fail closed, and jobs at or after it
 *     stay the organisation's either way.
 *   - After an earlier acceptance, after the era: a role change (only the
 *     role-change path wrote instant rows then).
 *
 * The direct-add era, from git history of app/api/team/invites/route.ts:
 * - Start: d96d9f081 (committed 2026-01-16T12:13:18Z) introduced every
 *   instant writer at once: the same-org role-change row and the two
 *   direct-add rows ("user already exists", "account is already created").
 *   The previous version (2fe59abb6, 2026-01-15) wrote none. Widened to
 *   2026-01-01T00:00:00Z.
 * - End: 9352cbe38 (committed 2026-08-25T13:09:21Z) removed the last
 *   direct-add path (e4af6e34e, 2026-04-19, removed the other). Production
 *   did not run it then: docs/session-handoffs/handoff-20260826T101451Z.md
 *   records production had "never been promoted" past it. The earliest
 *   proven production run of it is /api/health deploymentSha 0ad4d04a
 *   (which contains 9352cbe38), observed 2026-10-03T09:33:49Z. Widened to
 *   2026-10-04T00:00:00Z.
 * So the two kinds of row were written side by side for the whole era; there
 * is no earlier window where an unmarked instant row is unambiguously an
 * audit.
 */
export const DIRECT_ADD_ERA_FROM = new Date("2026-01-01T00:00:00Z");
export const DIRECT_ADD_ERA_UNTIL = new Date("2026-10-04T00:00:00Z");

/** An instant row written while the route could also directly add members. */
export function isInDirectAddEra(usedAt: Date): boolean {
  return (
    usedAt.getTime() >= DIRECT_ADD_ERA_FROM.getTime() &&
    usedAt.getTime() < DIRECT_ADD_ERA_UNTIL.getTime()
  );
}

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
