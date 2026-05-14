/**
 * RA-4861 — POST /api/admin/portal-accounts/[id]/revoke
 *
 * Admin-only. Marks a ClientPortalAccount as revoked by stamping
 * `revokedAt = NOW()`. The row stays in the DB for audit purposes —
 * `lookupPortalAccount` filters out revoked rows so the token stops
 * working immediately. Idempotent: re-revoking a revoked row is a
 * no-op (returns 200 with the existing revokedAt).
 *
 * Writes an `AuditLog` row only when the account is attached to an
 * inspection-context — for now the model is Client-scoped and the
 * existing AuditLog schema is Inspection-scoped (FK constraint), so we
 * stamp the action on the response body and rely on the row's own
 * `revokedAt` timestamp as the audit record. A follow-up ticket can
 * widen AuditLog to allow Client-scoped rows.
 */

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;

  const { id } = await params;

  const existing = await prisma.clientPortalAccount.findUnique({
    where: { id },
    select: { id: true, clientId: true, revokedAt: true },
  });
  if (!existing) {
    return apiError(request, {
      code: "NOT_FOUND",
      message: "Portal account not found",
      status: 404,
    });
  }
  if (existing.revokedAt) {
    return Response.json({
      data: {
        id: existing.id,
        clientId: existing.clientId,
        revokedAt: existing.revokedAt,
        alreadyRevoked: true,
      },
    });
  }

  try {
    const updated = await prisma.clientPortalAccount.update({
      where: { id },
      data: { revokedAt: new Date() },
      select: { id: true, clientId: true, revokedAt: true },
    });

    return Response.json({ data: updated });
  } catch (err) {
    return fromException(request, err, { stage: "revoke" });
  }
}
