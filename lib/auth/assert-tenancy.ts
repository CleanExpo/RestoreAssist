/**
 * Tenancy assertion helpers — RA-1709 / P0-5.
 *
 * The senior-board audit flagged 3 download-style routes as needing
 * an explicit ownership check. On inspection all 3 already enforced
 * tenancy correctly:
 *
 *   - app/api/portal/reports/[id]/download    → scoped by clientId on Report
 *   - app/api/inspections/[id]/media           → scoped by Inspection.userId
 *                                                  OR active Workspace member
 *   - app/api/inspections/[id]/sketches/pdf    → scoped by Inspection.userId
 *
 * This module codifies the pattern so future routes have a single
 * import to use rather than re-deriving the where-clause shape. Each
 * helper returns a typed `{ ok, ... }` discriminated union — never
 * throws. Callers handle the error path explicitly so the route can
 * return the right HTTP status.
 *
 * The companion test file stress-tests the helpers across role
 * combinations to lock down the contract — that's the regression-
 * protection P0-5 ticketed for.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type TenancyResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 401 | 403 | 404; reason: string };

export interface SessionLike {
  user?: {
    id?: string | null;
    role?: string | null;
  } | null;
}

/**
 * How wide the caller's reach is.
 *
 *   self      only records they own, or whose workspace they are an active
 *             member of
 *   org       the above, plus records owned by anyone in their organisation
 *   platform  every tenant — RestoreAssist support only
 */
export type TenantScope =
  | { kind: "self" }
  | { kind: "org"; organizationId: string }
  | { kind: "platform" };

/**
 * Cross-tenant support access, allowlisted by stable `User.id` in server
 * configuration.
 *
 * `role: "ADMIN"` is granted to every firm that self-registers
 * (`app/api/auth/register/route.ts`), so it means "owner of this tenant" and
 * has never meant "RestoreAssist staff". Treating it as the latter let one
 * customer read another customer's inspections by id across ~100 routes.
 *
 * This is the rule `verifyStorePublishingOperator` already applies to a
 * different platform-owned resource, in its own words: "tenant ADMIN is not
 * sufficient authority. Operators must be explicitly allowlisted by stable
 * User.id in server configuration. Missing or empty configuration deliberately
 * fails closed."
 */
export function isPlatformSupportOperator(userId: string): boolean {
  const allowlist = (process.env.PLATFORM_SUPPORT_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowlist.includes(userId);
}

/**
 * Whether the caller is about to read a record or change one.
 *
 * RA-7582 / D-023. These are deliberately not the same reach. Everyone in a
 * business needs to SEE the business's jobs — that is what makes it a team
 * product, and scoping reads to the creator is what left an invited technician
 * staring at an empty dashboard. Changing another person's record is a
 * different question, and it stays where it was: the owner, an active member
 * of the record's workspace, or a tenant ADMIN within their own organisation.
 *
 * `write` is the default precisely so that adding an argument is the only way
 * to widen anything. Around forty mutating routes gate on
 * `assertInspectionTenancy`; a default of `read` would have handed every
 * technician DELETE over their organisation's inspections, sketches and
 * evidence as a side effect of fixing a list query.
 */
export type ScopeIntent = "read" | "read-financial" | "write";

/**
 * Resolve the caller's reach from the DATABASE, never from the session claim
 * alone — the JWT carries a role for up to 90 days and a demotion does not
 * rewrite it.
 */
async function resolveTenantScope(
  session: SessionLike | null | undefined,
  intent: ScopeIntent = "write",
): Promise<TenantScope> {
  const sessionUserId = session?.user?.id;
  if (!sessionUserId) return { kind: "self" };

  const user = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: { role: true, organizationId: true },
  });
  if (!user) return { kind: "self" };

  // Cross-tenant support is an ADMIN-only allowlist, for reads and writes
  // alike. The allowlist widens an admin's scope; it is not a role of its own.
  if (user.role === "ADMIN" && isPlatformSupportOperator(sessionUserId)) {
    return { kind: "platform" };
  }

  // Writing beyond your own records remains an ADMIN privilege. Reading a JOB
  // does not: a MANAGER or USER is a colleague, and the invite flow never
  // assigns ADMIN (app/api/invites/[token]/route.ts:43).
  if (intent === "write" && user.role !== "ADMIN") return { kind: "self" };

  // Money is not a job. `/api/invoices` returns the firm's whole receivables
  // ledger — line-item pricing, `xeroAccountCode`, and Stripe payment-intent
  // and charge identifiers — and `/api/clients` returns per-client revenue
  // alongside customer contact details. Neither is what RA-7582 reported, so
  // the organisation widening for those two stops at MANAGER.
  //
  // Tested as a capability the role HAS, never as `role !== "USER"`: the
  // negative form silently hands the ledger to whatever role is added next,
  // and nobody reviews the day a role is added.
  if (
    intent === "read-financial" &&
    user.role !== "MANAGER" &&
    user.role !== "ADMIN"
  ) {
    return { kind: "self" };
  }

  // A null organisation must never match another null organisation, or every
  // solo operator would share one tenant. Proved as a non-empty string rather
  // than by truthiness, because an `undefined` that reaches a Prisma filter is
  // DROPPED from the query -- turning `{ user: { organizationId } }` into
  // `{ user: {} }`, which matches every row on the platform.
  const organizationId = user.organizationId;
  if (typeof organizationId !== "string" || organizationId.length === 0) {
    return { kind: "self" };
  }
  return { kind: "org", organizationId };
}

/**
 * The ownership clauses a caller of this scope may read or write through.
 * Never empty: the narrowest form still requires direct ownership.
 */
function ownershipClauses(
  userId: string,
  scope: TenantScope,
): NonNullable<Prisma.InspectionWhereInput["OR"]> {
  const clauses: NonNullable<Prisma.InspectionWhereInput["OR"]> = [
    { userId },
    { workspace: { members: { some: { userId, status: "ACTIVE" } } } },
  ];
  if (scope.kind === "org") {
    // Belt and braces for the undefined-drop described in resolveTenantScope.
    // A comment cannot fail CI; this can. If an org scope ever reaches here
    // without a real id, refuse to build a filter at all rather than build one
    // that matches the whole platform.
    if (
      typeof scope.organizationId !== "string" ||
      scope.organizationId.length === 0
    ) {
      throw new Error(
        "tenancy: org scope requires a non-empty organizationId",
      );
    }
    clauses.push({ user: { organizationId: scope.organizationId } });
  }
  return clauses;
}

/**
 * Assert that the session user owns (or is admin over) the given Report
 * and return a narrow projection. 401 when no session, 404 otherwise
 * (unify "not yours" and "doesn't exist" so attackers cannot enumerate
 * IDs across tenants).
 */
export async function assertReportTenancy(
  session: SessionLike | null,
  reportId: string,
): Promise<TenancyResult<{ id: string; userId: string }>> {
  if (!session?.user?.id) {
    return { ok: false, status: 401, reason: "Unauthorized" };
  }
  const userId = session.user.id;
  const scope = await resolveTenantScope(session);

  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      userId: true,
      user: { select: { organizationId: true } },
    },
  });
  if (!report) {
    return { ok: false, status: 404, reason: "Report not found" };
  }

  const reachable =
    scope.kind === "platform" ||
    report.userId === userId ||
    (scope.kind === "org" &&
      // Compared against a non-null organisationId from the scope, so two
      // org-less accounts never match each other.
      report.user?.organizationId === scope.organizationId);

  if (!reachable) {
    return { ok: false, status: 404, reason: "Report not found" };
  }
  return { ok: true, data: { id: report.id, userId: report.userId } };
}

/**
 * Assert the session user owns (via direct ownership OR active workspace
 * membership) the given Inspection. Mirrors the pattern in
 * `app/api/inspections/[id]/media/route.ts`.
 *
 * A tenant ADMIN does NOT bypass this: `role: "ADMIN"` is granted to every firm
 * that self-registers, so it widens reach only as far as the caller's own
 * organisation. Only an allowlisted platform-support operator
 * (`PLATFORM_SUPPORT_USER_IDS`) reads across tenants.
 */
export async function assertInspectionTenancy(
  session: SessionLike | null,
  inspectionId: string,
): Promise<
  TenancyResult<{ id: string; userId: string; workspaceId: string | null }>
> {
  if (!session?.user?.id) {
    return { ok: false, status: 401, reason: "Unauthorized" };
  }
  const userId = session.user.id;
  const scope = await resolveTenantScope(session);

  // Platform support only: read by id, across tenants. Fails closed when the
  // allowlist is unset, because resolveTenantScope never returns this kind.
  if (scope.kind === "platform") {
    const insp = await prisma.inspection.findUnique({
      where: { id: inspectionId },
      select: { id: true, userId: true, workspaceId: true },
    });
    if (!insp) {
      return { ok: false, status: 404, reason: "Inspection not found" };
    }
    return { ok: true, data: insp };
  }

  // Everyone else, tenant ADMIN included: own it, be an active member of its
  // workspace, or share an organisation with its owner.
  const insp = await prisma.inspection.findFirst({
    where: {
      id: inspectionId,
      OR: ownershipClauses(userId, scope),
    },
    select: { id: true, userId: true, workspaceId: true },
  });
  if (!insp) {
    return { ok: false, status: 404, reason: "Inspection not found" };
  }
  return { ok: true, data: insp };
}

/**
 * Read-only sibling of `assertInspectionTenancy`, for a GET that opens one
 * inspection by id.
 *
 * RA-7582 / D-023. `assertInspectionTenancy` keeps the narrower WRITE scope on
 * purpose: it is the authorisation gate on around forty mutating handlers, so
 * widening it would have handed every technician DELETE over their
 * organisation's inspections, sketches and evidence as a side effect of fixing
 * a list query. This function exists so a genuinely read-only caller can opt
 * in to the wider reach one call site at a time.
 *
 * Never call this from a handler that mutates.
 */
export async function assertInspectionReadable(
  session: SessionLike | null,
  inspectionId: string,
): Promise<
  TenancyResult<{ id: string; userId: string; workspaceId: string | null }>
> {
  if (!session?.user?.id) {
    return { ok: false, status: 401, reason: "Unauthorized" };
  }
  const reach = await resolveReach(session, "read");
  if (!reach.ok) return reach;

  const insp = await prisma.inspection.findFirst({
    where: { id: inspectionId, ...(reach.data as Prisma.InspectionWhereInput) },
    select: { id: true, userId: true, workspaceId: true },
  });
  // 404 rather than 403, so a tenant cannot enumerate inspection ids.
  if (!insp) {
    return { ok: false, status: 404, reason: "Inspection not found" };
  }
  return { ok: true, data: insp };
}

/**
 * Gate for ADDING new field evidence (a moisture reading, a photo) to an
 * inspection: the same reach as `assertInspectionReadable`.
 *
 * RA-7755 (prelaunch audit J-01). An invited technician joins the
 * organisation but no workspace, and no create path writes
 * `Inspection.workspaceId`, so under `assertInspectionTenancy` only the job's
 * creator and a tenant ADMIN could record anything. Every save from the field
 * returned 404. Capturing evidence on a colleague's job is the technician's
 * whole job, so it takes the organisation reach a read already has.
 *
 * Deliberately narrow: only for handlers that CREATE rows and never update or
 * delete an existing one. Editing or deleting a colleague's record stays on
 * `assertInspectionTenancy`.
 */
export async function assertInspectionCapturable(
  session: SessionLike | null,
  inspectionId: string,
): Promise<
  TenancyResult<{ id: string; userId: string; workspaceId: string | null }>
> {
  return assertInspectionReadable(session, inspectionId);
}

/**
 * The inspection filter for everything the session user can reach, for a
 * lookup that does not start from a known id (a list, or a search by
 * inspection number). Same rules as `assertInspectionTenancy`. `{}` only for
 * an allowlisted platform support operator; callers that must stay inside one
 * tenant add their own organisation clause on top.
 */
export async function resolveInspectionReach(
  session: SessionLike | null,
): Promise<TenancyResult<Prisma.InspectionWhereInput>> {
  return resolveReach(session, "read") as Promise<
    TenancyResult<Prisma.InspectionWhereInput>
  >;
}

/**
 * The same reach, for `Client`, `Invoice` and `Report`.
 *
 * All four models carry the identical ownership surface — a `userId` scalar, a
 * nullable `workspace` relation, and a `user` relation through which the
 * owner's organisation is reachable — so one clause builder serves them all
 * and there is exactly one place to change the rule.
 *
 * **Merge the returned filter with `AND`, never by assigning `OR`.** Every one
 * of these list handlers builds its text search as `where.OR = [...]`, which
 * overwrites rather than extends. A tenancy filter shaped as a bare `OR` is
 * therefore erased the moment somebody types in the search box, and the
 * endpoint answers with every tenant's matching rows. That is a worse defect
 * than the one this function exists to fix, so the helpers below return the
 * clause list and the callers wrap it.
 */
async function resolveReach(
  session: SessionLike | null,
  intent: ScopeIntent,
): Promise<TenancyResult<object>> {
  if (!session?.user?.id) {
    return { ok: false, status: 401, reason: "Unauthorized" };
  }
  const scope = await resolveTenantScope(session, intent);
  if (scope.kind === "platform") return { ok: true, data: {} };
  // Returned pre-wrapped in `AND`. A caller who later writes
  // `where.OR = [...]` for a search box then cannot erase the tenancy filter,
  // because it does not live on `OR`. The merge rule stops being something a
  // reviewer has to remember.
  return {
    ok: true,
    data: { AND: [{ OR: ownershipClauses(session.user.id, scope) }] },
  };
}

/**
 * The inspection filter for a caller who is about to WRITE through it, for a
 * lookup that does not start from a known id.
 *
 * Same shape as `resolveInspectionReach`, narrower scope: the organisation
 * widening still requires ADMIN. Used where a list-style filter decides what a
 * caller may file against rather than merely see - notably the inbound
 * messaging channel, where a technician texting a job number is creating a
 * record, not reading one.
 */
export async function resolveInspectionWriteReach(
  session: SessionLike | null,
): Promise<TenancyResult<Prisma.InspectionWhereInput>> {
  return resolveReach(session, "write") as Promise<
    TenancyResult<Prisma.InspectionWhereInput>
  >;
}

export async function resolveClientReach(
  session: SessionLike | null,
): Promise<TenancyResult<Prisma.ClientWhereInput>> {
  return resolveReach(session, "read-financial") as Promise<
    TenancyResult<Prisma.ClientWhereInput>
  >;
}

export async function resolveInvoiceReach(
  session: SessionLike | null,
): Promise<TenancyResult<Prisma.InvoiceWhereInput>> {
  return resolveReach(session, "read-financial") as Promise<
    TenancyResult<Prisma.InvoiceWhereInput>
  >;
}

export async function resolveReportReach(
  session: SessionLike | null,
): Promise<TenancyResult<Prisma.ReportWhereInput>> {
  return resolveReach(session, "read") as Promise<
    TenancyResult<Prisma.ReportWhereInput>
  >;
}

/**
 * Whether the caller may link a client, report or estimate named by id in a
 * request body.
 *
 * A body id is chosen by the caller. Storing it unchecked let one business
 * attach another business's client to its own invoice and then read that
 * client's name and email back through the invoice (prelaunch audit D-021).
 * The reach required is the one the caller would need to read the record
 * directly, so linking can never expose more than a direct read would. An
 * estimate has no workspace relation of its own; it is reached through its
 * report.
 */
export async function canLinkRecord(
  session: SessionLike | null,
  kind: "client" | "report" | "estimate",
  id: unknown,
): Promise<boolean> {
  if (typeof id !== "string" || id.length === 0) return false;
  if (kind === "client") {
    const reach = await resolveClientReach(session);
    if (!reach.ok) return false;
    const row = await prisma.client.findFirst({
      where: { AND: [{ id }, reach.data] },
      select: { id: true },
    });
    return row !== null;
  }
  const reach = await resolveReportReach(session);
  if (!reach.ok) return false;
  if (kind === "report") {
    const row = await prisma.report.findFirst({
      where: { AND: [{ id }, reach.data] },
      select: { id: true },
    });
    return row !== null;
  }
  const row = await prisma.estimate.findFirst({
    where: { id, report: reach.data },
    select: { id: true },
  });
  return row !== null;
}

/**
 * RA-6800: resolve ownership-scoped `where` fragments for WRITING to an
 * inspection or its child records. Verifies access using the same model as
 * `assertInspectionTenancy` (direct owner OR active workspace member, widened
 * to the caller's organisation for a tenant ADMIN), then returns reusable
 * scopes so mutations re-assert ownership atomically at write time — closing
 * the TOCTOU gap between the access check and the write.
 *
 *   - `inspectionWhere`     → for `inspection.update` / `delete` (unique where).
 *   - `inspectionManyWhere` → for `inspection.updateMany` (merge extra
 *                             conditions, e.g. a status CAS guard).
 *   - `childInspectionFilter` → relation filter for child-record writes, used
 *                             as `{ inspection: childInspectionFilter }`.
 *                             `undefined` ONLY for an allowlisted platform
 *                             support operator, which has no tenant scope. A
 *                             tenant ADMIN always receives a real filter.
 *
 * Returns 401/404 (never 403) on failure so callers map directly to a response
 * and tenants cannot enumerate inspection IDs.
 */
export async function resolveInspectionWrite(
  session: SessionLike | null,
  inspectionId: string,
): Promise<
  TenancyResult<{
    inspectionWhere: Prisma.InspectionWhereUniqueInput;
    inspectionManyWhere: Prisma.InspectionWhereInput;
    childInspectionFilter: Prisma.InspectionWhereInput | undefined;
  }>
> {
  if (!session?.user?.id) {
    return { ok: false, status: 401, reason: "Unauthorized" };
  }
  const userId = session.user.id;
  const scope = await resolveTenantScope(session);

  // Platform support only: authorized across tenants; scope writes by id.
  if (scope.kind === "platform") {
    const insp = await prisma.inspection.findUnique({
      where: { id: inspectionId },
      select: { id: true },
    });
    if (!insp) {
      return { ok: false, status: 404, reason: "Inspection not found" };
    }
    return {
      ok: true,
      data: {
        inspectionWhere: { id: inspectionId },
        inspectionManyWhere: { id: inspectionId },
        childInspectionFilter: undefined,
      },
    };
  }

  // Everyone else, tenant ADMIN included. The same clauses are returned to the
  // caller as the write filter, so the mutation re-asserts ownership itself
  // rather than trusting this read.
  const ownerOr: Prisma.InspectionWhereInput["OR"] = ownershipClauses(
    userId,
    scope,
  );
  const insp = await prisma.inspection.findFirst({
    where: { id: inspectionId, OR: ownerOr },
    select: { id: true },
  });
  if (!insp) {
    return { ok: false, status: 404, reason: "Inspection not found" };
  }
  return {
    ok: true,
    data: {
      inspectionWhere: { id: inspectionId, OR: ownerOr },
      inspectionManyWhere: { id: inspectionId, OR: ownerOr },
      childInspectionFilter: { OR: ownerOr },
    },
  };
}

/**
 * Write a CHILD record of an inspection with the caller's scope re-asserted,
 * atomically.
 *
 * `resolveInspectionWrite` hands back a scoped `where`, but a route that then
 * upserts a child keyed on `inspectionId` alone has silently dropped it. An
 * independent review found that across six assessment routes: the child upsert
 * committed on the bare id, and the scoped parent update ran afterwards as a
 * separate statement — so the child write landed even when the scope claimed
 * nothing, and nothing rolled it back.
 *
 * Here the scoped parent update IS the gate. If it claims no row the child
 * work never runs, and both live in one transaction so a later failure undoes
 * the whole thing. Returns null when the scope no longer matches; callers map
 * that to 404, never 403, so a tenant cannot learn the id exists.
 */
export async function writeWithinInspectionScope<T>(
  scopeWhere: Prisma.InspectionWhereInput,
  parentData: Prisma.InspectionUpdateManyMutationInput,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T | null> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.inspection.updateMany({
      where: scopeWhere,
      data: parentData,
    });
    if (claimed.count === 0) return null;
    return work(tx);
  });
}

/**
 * Portal-client download tenancy: scopes by Client.id stored on the
 * portal session, NOT by the report's userId. Mirrors the pattern in
 * `app/api/portal/reports/[id]/download/route.ts`.
 */
export async function assertPortalReportTenancy(
  session:
    | (SessionLike & {
        user?: { userType?: string | null; clientId?: string | null } | null;
      })
    | null,
  reportId: string,
): Promise<TenancyResult<{ id: string; clientId: string }>> {
  if (!session?.user?.id || session.user.userType !== "client") {
    return { ok: false, status: 401, reason: "Unauthorized" };
  }
  const clientId = session.user.clientId;
  if (!clientId) {
    return { ok: false, status: 401, reason: "Client ID not bound" };
  }

  const report = await prisma.report.findFirst({
    where: { id: reportId, clientId },
    select: { id: true, clientId: true },
  });
  if (!report || !report.clientId) {
    return { ok: false, status: 404, reason: "Report not found" };
  }
  return { ok: true, data: { id: report.id, clientId: report.clientId } };
}
