/**
 * RA-4861 — POST /api/admin/clients/[clientId]/portal-account
 *
 * Admin-only. Creates a fresh `ClientPortalAccount` row for the given
 * Client and returns the freshly-minted token ONCE. After this call the
 * token is never re-displayed — admins must rotate to regenerate.
 *
 * Contract:
 *   - 401 when no session
 *   - 403 when caller is not ADMIN (DB re-check per CLAUDE.md rule #3)
 *   - 404 when the Client does not exist
 *   - 201 + `{ data: { id, token, clientId, createdAt } }` on success
 *
 * Token: `crypto.randomBytes(32).toString("base64url")` — 256 bits,
 * never derived from clientId or timestamp.
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
  { params }: { params: Promise<{ clientId: string }> },
) {
  const session = await getServerSession(authOptions);
  const auth = await verifyAdminFromDb(session);
  if (auth.response) return auth.response;

  const { clientId } = await params;

  // Verify the Client exists and belongs to this admin — prevents IDOR
  // where any admin could mint tokens for other tenants' clients.
  const client = await prisma.client.findUnique({
    where: { id: clientId, userId: auth.user!.id },
    select: { id: true },
  });
  if (!client) {
    return apiError(request, {
      code: "NOT_FOUND",
      message: "Client not found",
      status: 404,
    });
  }

  try {
    const account = await prisma.clientPortalAccount.create({
      data: {
        clientId,
        token: mintToken(),
      },
      select: {
        id: true,
        clientId: true,
        token: true,
        createdAt: true,
      },
    });

    return Response.json({ data: account }, { status: 201 });
  } catch (err) {
    return fromException(request, err, { stage: "create" });
  }
}
