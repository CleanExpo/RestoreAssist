import "server-only";
import type { ReportShareScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  resolveReportFinancialReach,
  resolveReportReach,
  type SessionLike,
} from "@/lib/auth/assert-tenancy";
import { getResourceTenant, type ResourceTenant } from "@/lib/organization-credits";
import { lookupReportShareAccess } from "@/lib/report-share/access";
import type { ReportReadGrant } from "./snapshot";

/**
 * RA-8105 W1.2: the one server gate in front of the report experience.
 *
 * - A share token is checked against the stored ReportShareAccess row only.
 *   The legacy signed insurer token (D-8, `verifyReportReaderToken`'s
 *   LEGACY_HMAC branch) is never accepted here.
 * - When a share token is presented (even an empty one), the token alone
 *   decides. A refused token is never rescued by the caller's session.
 * - Without a token, the session is checked with the same tenancy filter as
 *   every other report read, ANDed with the report id. That filter includes
 *   active members of the report's workspace, as it does for every other
 *   report read in the app; narrowing it here alone is a product decision.
 * - The grant's organisation is the report's tenant from `getResourceTenant`
 *   (the firm at the time the report was created). If that cannot be
 *   resolved, the read is refused.
 * - Every refusal after the caller presented something is the same 404, so a
 *   caller cannot tell "other firm", "revoked", "expired", "legacy" and
 *   "does not exist" apart.
 * - Money follows the existing rules: the session caller needs the financial
 *   reach; a share link keeps today's behaviour (RA-7771: only MANAGER+ can
 *   mint the owner link because it shows cost; the insurer portal reads the
 *   whole report).
 */
export type ReportReadDecision =
  | { ok: true; grant: ReportReadGrant }
  | { ok: false; status: 401 | 404 };

const GRANT_TTL_MS = 5 * 60 * 1000;

/**
 * The grants this gate issued. The set and the function that adds to it are
 * private to this module and nothing here exports a way to mint a grant, so
 * the snapshot builder's `isIssuedReportReadGrant` check can only pass for an
 * object this gate returned. A copy with a field changed is a different object.
 */
const issued = new WeakSet<object>();

function issueGrant(fields: ReportReadGrant): ReportReadGrant {
  const grant: ReportReadGrant = Object.freeze({
    reportId: fields.reportId,
    organisationId: fields.organisationId,
    audience: fields.audience,
    mayViewAddress: fields.mayViewAddress,
    mayViewFinancials: fields.mayViewFinancials,
    expiresAt: fields.expiresAt,
  });
  issued.add(grant);
  return grant;
}

export function isIssuedReportReadGrant(grant: unknown): grant is ReportReadGrant {
  return typeof grant === "object" && grant !== null && issued.has(grant);
}

/**
 * The tenant key of a report, from the repository's own ownership rule
 * (`getResourceTenant`: the firm the author belonged to when the report was
 * created). The prefix keeps organisation and person keys from colliding.
 * The evidence adapter must use this same function.
 */
export function reportTenantKey(tenant: ResourceTenant): string {
  return tenant.organizationId ? "org_" + tenant.organizationId : "usr_" + tenant.ownerId;
}

const SCOPE_AUDIENCE: Record<ReportShareScope, ReportReadGrant["audience"]> = {
  OWNER_VIEW: "property-owner",
  INSURER: "insurer",
};

const TENANT_SELECT = {
  id: true,
  userId: true,
  createdAt: true,
} as const;

async function tenantKeyOf(report: { userId: string; createdAt: Date }): Promise<string | null> {
  const tenant = await getResourceTenant(report.userId, report.createdAt);
  return tenant ? reportTenantKey(tenant) : null;
}

const NOT_FOUND: ReportReadDecision = { ok: false, status: 404 };

function sessionAudience(role: string | null | undefined): ReportReadGrant["audience"] {
  if (role === "ADMIN") return "owner";
  if (role === "MANAGER") return "manager";
  return "technician";
}

async function byShareToken(reportId: string, token: string, now: Date): Promise<ReportReadGrant | null> {
  const access = await lookupReportShareAccess(token);
  if (!access || access.reportId !== reportId) return null;
  const audience = SCOPE_AUDIENCE[access.scope];
  if (!audience) return null;
  const report = await prisma.report.findUnique({ where: { id: reportId }, select: TENANT_SELECT });
  if (!report) return null;
  const organisationId = await tenantKeyOf(report);
  if (!organisationId) return null;
  const expiresAt = Math.min(access.expiresAt.getTime(), now.getTime() + GRANT_TTL_MS);
  return issueGrant({
    reportId: report.id,
    organisationId,
    audience,
    mayViewAddress: true,
    mayViewFinancials: true,
    expiresAt: new Date(expiresAt).toISOString(),
  });
}

async function bySession(
  reportId: string,
  session: SessionLike,
  now: Date,
): Promise<ReportReadGrant | null> {
  const reach = await resolveReportReach(session);
  if (!reach.ok) return null;
  const report = await prisma.report.findFirst({
    where: { AND: [{ id: reportId }, reach.data] },
    select: TENANT_SELECT,
  });
  if (!report) return null;
  const organisationId = await tenantKeyOf(report);
  if (!organisationId) return null;
  const money = await resolveReportFinancialReach(session);
  const mayViewFinancials =
    money.ok && (await prisma.report.count({ where: { AND: [{ id: reportId }, money.data] } })) === 1;
  return issueGrant({
    reportId: report.id,
    organisationId,
    audience: sessionAudience(session.user?.role),
    mayViewAddress: true,
    mayViewFinancials,
    expiresAt: new Date(now.getTime() + GRANT_TTL_MS).toISOString(),
  });
}

export async function authoriseReportExperienceRead(input: {
  reportId: string;
  session: SessionLike | null;
  shareToken?: string | null;
}): Promise<ReportReadDecision> {
  const now = new Date();
  const tokenPresented = typeof input.shareToken === "string";
  const hasSession = Boolean(input.session?.user?.id);
  if (!tokenPresented && !hasSession) return { ok: false, status: 401 };

  let grant: ReportReadGrant | null;
  if (tokenPresented) {
    const token = input.shareToken!.trim();
    grant = token ? await byShareToken(input.reportId, token, now) : null;
  } else {
    grant = await bySession(input.reportId, input.session!, now);
  }
  return grant ? { ok: true, grant } : NOT_FOUND;
}
