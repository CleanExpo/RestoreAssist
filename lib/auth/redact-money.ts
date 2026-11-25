/**
 * RA-8494 (DRC S1) — the one owner of "may this caller see money".
 *
 * A technician (role USER inside a business) must never receive a price: no
 * cost-estimate rate, subtotal or total, no scope-item suggested rate, no
 * invoice or estimate amount, no payment state. Before this file, money was
 * hidden route by route, and the record-reach rules (D-023) let a USER who
 * CREATED a job read its money through the `{ userId }` owner clause. A
 * technician who opens their own job is still a technician.
 *
 * The rule, decided from the DATABASE row (the JWT role can be 90 days stale):
 *
 *   ADMIN or MANAGER                        sees money (subject to record reach)
 *   any other role, inside an organisation  never sees money
 *   any role, with no organisation and      sees money on what it can reach:
 *   no past one                             a solo account is its own owner,
 *                                           so there is nobody to hide it from
 *
 * Tested as a capability the role HAS, never as `role !== "USER"`, so a role
 * added later starts without money (the same doctrine as
 * `FINANCIAL_WRITER_ROLES` in `lib/auth/assert-tenancy.ts`).
 *
 * Record reach is a separate question and stays with `assert-tenancy.ts`.
 * A caller needs BOTH: this rule, and reach over the record.
 *
 * Two ways a route uses this file:
 *   - a handler whose whole answer is money (invoices, estimates, cost
 *     estimates) calls `assertMoneyViewer` first and returns its 403;
 *   - a handler that returns a job with money inside it calls `canSeeMoney`
 *     and passes the job through `redactMoney` when the answer is no.
 */
import { prisma } from "@/lib/prisma";
import type { SessionLike, TenancyResult } from "@/lib/auth/assert-tenancy";
import { redactMoney } from "@/lib/auth/money-redaction";

const MONEY_VIEWER_ROLES: readonly string[] = ["ADMIN", "MANAGER"];

/** Whether the caller may see prices at all. Fails closed: no session or no user row is `false`. */
export async function canSeeMoney(
  session: SessionLike | null | undefined,
): Promise<boolean> {
  const userId = session?.user?.id;
  if (!userId) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      organizationId: true,
      organizationLeftAt: true,
      organizationLeftId: true,
      // The current organisation's owner, read directly: no bounded list of
      // owned organisations that could miss it.
      organization: { select: { ownerId: true } },
    },
  });
  if (!user) return false;
  const org = user.organizationId;
  const inBusiness = typeof org === "string" && org.length > 0;
  // A role counts only inside a business. Removing a member clears their
  // organisation but keeps their role, so a removed MANAGER must not keep
  // seeing prices on the business's jobs they still reach. The owner of the
  // business sees its money whatever their role column says: rows created
  // before owners were made ADMIN must not lose their own invoices.
  if (inBusiness) {
    if (MONEY_VIEWER_ROLES.includes(String(user.role))) return true;
    return user.organization?.ownerId === userId;

  }
  // Leaving a business does not make anyone a solo owner: a removed member
  // keeps `{ userId }` reach over jobs they made for the business, so a past
  // membership counts as inside a business.
  if (user.organizationLeftAt != null || user.organizationLeftId != null) {
    return false;
  }
  return true;
}

/**
 * Gate for a handler whose whole answer is money. 401 without a session, 403
 * for a caller who may not see prices. Call it before any query, so a refused
 * caller learns nothing, not even whether the record exists.
 */
export async function assertMoneyViewer(
  session: SessionLike | null | undefined,
): Promise<TenancyResult<true>> {
  if (!session?.user?.id) {
    return { ok: false, status: 401, reason: "Unauthorized" };
  }
  if (!(await canSeeMoney(session))) {
    return {
      ok: false,
      status: 403,
      reason: "Only an owner or manager can see prices",
    };
  }
  return { ok: true, data: true };
}

export {
  MONEY_KEYS,
  MONEY_RELATIONS,
  MONEY_JSON_TEXT_KEYS,
  MONEY_JSON_OR_PROSE_KEYS,
  redactMoney,
  withoutMoneyWrites,
  keepHiddenMoney,
} from "@/lib/auth/money-redaction";

/**
 * `value` as this caller may receive it: unchanged for a caller who may see
 * money, otherwise passed through `redactMoney`. The one call a route makes
 * before it answers with a record that carries money inside it.
 */
export async function moneySafe<T>(
  session: SessionLike | null | undefined,
  value: T,
): Promise<T> {
  return (await canSeeMoney(session)) ? value : redactMoney(value);
}
