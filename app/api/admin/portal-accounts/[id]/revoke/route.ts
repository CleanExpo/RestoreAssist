/**
 * RA-4861 — POST /api/admin/portal-accounts/[id]/revoke
 *
 * Admin-only. Marks a ClientPortalAccount as revoked by stamping
 * `revokedAt = NOW()`. The row stays in the DB for audit purposes —
 * `lookupPortalAccount` filters out revoked rows so the token stops
 * working immediately. Idempotent: re-revoking a revoked row does not
 * rewrite revokedAt or add a second audit row (returns 200 with the
 * existing revokedAt and `alreadyRevoked: true`).
 *
 * RA-7634: revoking also clears the client's UNSIGNED signing tokens, in
 * the same transaction. The portal link disclosed those tokens, so they
 * die with it; signed rows are untouched. This runs on re-revoke too, so
 * an account revoked before this fix is contained by revoking it again.
 * Staff re-send any signing request the client still needs.
 *
 * Audit trail: matches the pattern in
 * `app/api/inspections/[id]/reopen/route.ts`. The existing `AuditLog`
 * model is inspection-scoped (FK constraint on `inspectionId`), so we
 * stamp the audit row against the Client's most-recent inspection when
 * one exists. When the Client has no inspections (a freshly-created
 * Client whose portal account was minted before any job started) we
 * gracefully skip the audit row — the table's own `revokedAt` /
 * `updatedAt` columns are the durable record in that case. A follow-up
 * ticket can widen `AuditLog` to allow Client-scoped rows.
 */

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { clearClientSigningLinks } from "@/lib/portal/clear-client-signing-links";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;
  const adminUserId = auth.user!.id;

  const { id } = await params;
  const organizationId = auth.user?.organizationId;

  const ownershipWhere = organizationId
    ? { id, client: { user: { organizationId } } }
    : null;
  const existing = ownershipWhere
    ? await prisma.clientPortalAccount.findUnique({
        where: ownershipWhere,
        select: { id: true, clientId: true, revokedAt: true },
      })
    : null;
  if (!existing) {
    return apiError(request, {
      code: "NOT_FOUND",
      message: "Portal account not found",
      status: 404,
    });
  }
  const alreadyRevoked = existing.revokedAt !== null;

  try {
    const revoked = await prisma.$transaction(async (tx) => {
      const account = alreadyRevoked
        ? existing
        : await tx.clientPortalAccount.update({
            where: ownershipWhere!,
            data: { revokedAt: new Date() },
            select: { id: true, clientId: true, revokedAt: true },
          });

      await clearClientSigningLinks(tx, existing.clientId);

      // Audit trail. Scope to the most-recent inspection for the client so
      // we satisfy the inspection-FK. If no inspection exists we skip the
      // audit — the row's own `revokedAt` is still the durable record.
      // Inspection has no direct `clientId` — it links to Client through
      // `Report.clientId`. Pick the newest Inspection whose Report points
      // at this Client; if none exists we skip the audit cleanly.
      if (!alreadyRevoked) {
        const anchor = await tx.inspection.findFirst({
          where: { report: { clientId: existing.clientId } },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        if (anchor) {
          await tx.auditLog.create({
            data: {
              inspectionId: anchor.id,
              action: "CLIENT_PORTAL_ACCOUNT_REVOKED",
              entityType: "ClientPortalAccount",
              entityId: existing.id,
              userId: adminUserId,
              changes: JSON.stringify({ clientId: existing.clientId }),
            },
          });
        }
      }

      return account;
    });

    return Response.json({
      data: alreadyRevoked ? { ...revoked, alreadyRevoked: true } : revoked,
    });
  } catch (err) {
    return fromException(request, err, { stage: "revoke" });
  }
}
