/**
 * RA-4861 — POST /api/admin/portal-accounts/[id]/rotate
 *
 * Admin-only. Generates a fresh 256-bit token for the given
 * ClientPortalAccount, stamps `tokenRotatedAt = NOW()`, and returns the
 * new token ONCE. Old token immediately stops working (replaced in the
 * same row).
 *
 * RA-7634: rotation also clears the client's UNSIGNED signing tokens, in
 * the same transaction. The old portal link disclosed them, so a leaked link
 * must not keep signing power through them; signed rows are untouched. Staff
 * re-send any signing request the client still needs.
 *
 * Refuses to rotate a revoked account (409) — revoke is terminal.
 */

import { randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { clearClientSigningLinks } from "@/lib/portal/clear-client-signing-links";

function mintToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;

  const { id } = await params;
  const organizationId = auth.user?.organizationId;

  const ownershipWhere = organizationId
    ? { id, client: { user: { organizationId } } }
    : null;
  const existing = ownershipWhere
    ? await prisma.clientPortalAccount.findUnique({
        where: ownershipWhere,
        select: { id: true, revokedAt: true },
      })
    : null;
  if (!existing) {
    return apiError(request, {
      code: "NOT_FOUND",
      message: "Portal account not found",
      status: 404,
    });
  }
  if (existing.revokedAt) {
    return apiError(request, {
      code: "CONFLICT",
      message: "Cannot rotate a revoked portal account",
      status: 409,
    });
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const rotated = await tx.clientPortalAccount.update({
        where: ownershipWhere!,
        data: {
          token: mintToken(),
          tokenRotatedAt: new Date(),
        },
        select: {
          id: true,
          clientId: true,
          token: true,
          tokenRotatedAt: true,
        },
      });
      await clearClientSigningLinks(tx, rotated.clientId);
      return rotated;
    });

    return Response.json({ data: updated });
  } catch (err) {
    return fromException(request, err, { stage: "rotate" });
  }
}
