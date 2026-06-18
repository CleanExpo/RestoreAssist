/**
 * RA-4861 — POST /api/admin/portal-accounts/[id]/rotate
 *
 * Admin-only. Generates a fresh 256-bit token for the given
 * ClientPortalAccount, stamps `tokenRotatedAt = NOW()`, and returns the
 * new token ONCE. Old token immediately stops working (replaced in the
 * same row).
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

  try {
    // Atomic rotate: only updates if the account exists AND is not revoked.
    // This eliminates the TOCTOU window between the old findUnique + update.
    const newToken = mintToken();
    const result = await prisma.clientPortalAccount.updateMany({
      where: { id, revokedAt: null },
      data: { token: newToken, tokenRotatedAt: new Date() },
    });

    if (result.count === 0) {
      // Either the account doesn't exist or it was revoked — read to distinguish.
      const check = await prisma.clientPortalAccount.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!check) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Portal account not found",
          status: 404,
        });
      }
      return apiError(request, {
        code: "CONFLICT",
        message: "Cannot rotate a revoked portal account",
        status: 409,
      });
    }

    // Fetch the updated row to return to the caller (updateMany has no select).
    const updated = await prisma.clientPortalAccount.findUnique({
      where: { id },
      select: { id: true, clientId: true, token: true, tokenRotatedAt: true },
    });

    return Response.json({ data: updated });
  } catch (err) {
    return fromException(request, err, { stage: "rotate" });
  }
}
