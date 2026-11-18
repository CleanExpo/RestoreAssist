/**
 * Shared guard for /api/portal/* routes that require a logged-in homeowner.
 * Verifies the Bearer JWT and returns claims, or a ready 401 response.
 *
 * RA-8461 — this is the one owner of "a token outlives a credential change".
 * A token is refused unless it carries the fingerprint of the account's
 * current password hash, so setting the password again ends every earlier
 * session. Tokens minted before binding existed carry no fingerprint and are
 * refused too: the homeowner signs in once more.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateClientRequest,
  type ClientPortalClaims,
} from "@/lib/portal/client-jwt";
import { credentialFingerprintMatches } from "@/lib/portal/credential-fingerprint";
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
      select: { id: true, clientId: true, passwordHash: true },
    });

    if (
      !clientUser ||
      clientUser.clientId !== claims.clientId ||
      !credentialFingerprintMatches(
        claims.credentialFingerprint,
        clientUser.passwordHash,
      )
    ) {
      return unauthorizedResult();
    }
  } catch (error) {
    console.error("Portal client auth revalidation failed", error);
    return unauthorizedResult();
  }

  return { ok: true, claims };
}
