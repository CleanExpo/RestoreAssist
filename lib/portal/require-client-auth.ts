/**
 * Shared guard for /api/portal/* routes that require a logged-in homeowner.
 * Verifies the Bearer JWT and returns claims, or a ready 401 response.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateClientRequest,
  ClientPortalJwtConfigError,
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

function portalAuthUnavailableResult(message: string, code: string): ClientAuthResult {
  return {
    ok: false,
    response: NextResponse.json({ error: message, code }, { status: 503 }),
  };
}

export async function requireClientAuth(
  request: NextRequest,
): Promise<ClientAuthResult> {
  let claims: ClientPortalClaims | null;
  try {
    claims = await authenticateClientRequest(request);
  } catch (error) {
    if (error instanceof ClientPortalJwtConfigError) {
      return portalAuthUnavailableResult(error.message, error.code);
    }
    throw error;
  }

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
    return portalAuthUnavailableResult(
      "Portal sign-in could not be verified — try again shortly",
      "UPSTREAM_FAILED",
    );
  }

  return { ok: true, claims };
}
