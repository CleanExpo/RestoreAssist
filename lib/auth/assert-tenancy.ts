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
function isPlatformSupportOperator(userId: string): boolean {
  const allowlist = (process.env.PLATFORM_SUPPORT_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowlist.includes(userId);
}

/**
 * Resolve the caller's reach from the DATABASE, never from the session claim
 * alone — the JWT carries a role for up to 90 days and a demotion does not
 * rewrite it.
 */
async function resolveTenantScope(
  session: SessionLike | null | undefined,
): Promise<TenantScope> {
  const sessionUserId = session?.user?.id;
  if (!sessionUserId) return { kind: "self" };

  const user = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: { role: true, organizationId: true },
  });

  // Only a real, currently-ADMIN account can be raised any further. The
  // allowlist widens an admin's scope; it is not a role of its own.
  if (user?.role !== "ADMIN") return { kind: "self" };

  if (isPlatformSupportOperator(sessionUserId)) return { kind: "platform" };

  // A null organisation must never match another null organisation, or every
  // solo operator would share one tenant.
  return user.organizationId
    ? { kind: "org", organizationId: user.organizationId }
    : { kind: "self" };
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
 * `app/api/inspections/[id]/media/route.ts`. Admins bypass.
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
 * RA-6800: resolve ownership-scoped `where` fragments for WRITING to an
 * inspection or its child records. Verifies access using the same model as
 * `assertInspectionTenancy` (direct owner OR active workspace member; admins
 * bypass), then returns reusable scopes so mutations re-assert ownership
 * atomically at write time — closing the TOCTOU gap between the access check
 * and the write.
 *
 *   - `inspectionWhere`     → for `inspection.update` / `delete` (unique where).
 *   - `inspectionManyWhere` → for `inspection.updateMany` (merge extra
 *                             conditions, e.g. a status CAS guard).
 *   - `childInspectionFilter` → relation filter for child-record writes, used
 *                             as `{ inspection: childInspectionFilter }`;
 *                             `undefined` for admins (no per-tenant scope).
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
