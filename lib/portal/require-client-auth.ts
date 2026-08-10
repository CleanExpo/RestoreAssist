/**
 * Shared guard for /api/portal/* routes that require a logged-in homeowner.
 * Verifies the Bearer JWT and returns claims, or a ready 401 response.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateClientRequest,
  type ClientPortalClaims,
} from "@/lib/portal/client-jwt";
import { prisma } from "@/lib/prisma";

export type ClientAuthResult =
  | { ok: true; claims: ClientPortalClaims }
  | { ok: false; response: NextResponse };

function unauthorizedResult(): ClientAuthResult {
  return {
    ok: false,
    response: NextResponse.json(
      { error: "Unauthorized — please sign in again" },
      { status: 401 },
    ),
  };
}

export async function requireClientAuth(
  request: NextRequest,
): Promise<ClientAuthResult> {
  const claims = await authenticateClientRequest(request);
  if (!claims) {
    return unauthorizedResult();
  }

  try {
    const clientUser = await prisma.clientUser.findUnique({
      where: { id: claims.sub },
      select: { id: true, clientId: true },
    });

    if (!clientUser || clientUser.clientId !== claims.clientId) {
      return unauthorizedResult();
    }
  } catch (error) {
    console.error("Portal client auth revalidation failed", error);
    return unauthorizedResult();
  }

  return { ok: true, claims };
}
