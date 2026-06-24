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

async function hasCurrentAdminRole(
  session: SessionLike | null | undefined,
): Promise<boolean> {
  if (session?.user?.role !== "ADMIN" || !session.user.id) return false;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  return user?.role === "ADMIN";
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
  const admin = await hasCurrentAdminRole(session);

  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: { id: true, userId: true },
  });
  if (!report) {
    return { ok: false, status: 404, reason: "Report not found" };
  }
  if (!admin && report.userId !== userId) {
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
  const admin = await hasCurrentAdminRole(session);

  // Admin path: read by id only.
  if (admin) {
    const insp = await prisma.inspection.findUnique({
      where: { id: inspectionId },
      select: { id: true, userId: true, workspaceId: true },
    });
    if (!insp) {
      return { ok: false, status: 404, reason: "Inspection not found" };
    }
    return { ok: true, data: insp };
  }

  // Member path: own the inspection OR be an active member of its workspace.
  const insp = await prisma.inspection.findFirst({
    where: {
      id: inspectionId,
      OR: [
        { userId },
        {
          workspace: {
            members: { some: { userId, status: "ACTIVE" } },
          },
        },
      ],
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
  const admin = await hasCurrentAdminRole(session);

  // Admin path: authorized globally; scope writes by id only.
  if (admin) {
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

  // Member path: own the inspection OR be an active member of its workspace.
  const ownerOr: Prisma.InspectionWhereInput["OR"] = [
    { userId },
    { workspace: { members: { some: { userId, status: "ACTIVE" } } } },
  ];
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
