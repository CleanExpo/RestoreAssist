/**
 * Shared guard for /api/portal/* routes that require a logged-in homeowner.
 * Verifies the Bearer JWT and returns claims, or a ready 401 response.
 *
 * RA-8461 — this is the one owner of "a token outlives a credential change".
 * A token is refused unless it carries the fingerprint of the account's
 * current password hash, so setting the password again ends every earlier
 * session.
 *
 * Interim (RA-8461 slice 1): a token minted before binding carries no
 * fingerprint and is still accepted. Nothing can change a portal password
 * yet, so such a token cannot be stale, and refusing it would sign out
 * homeowners who have forgotten their password before recovery exists.
 * The change that first writes ClientUser.passwordHash (recovery) must make
 * a missing fingerprint a refusal in the same commit.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateClientRequest,
  ClientPortalJwtConfigError,
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
      select: { id: true, clientId: true, passwordHash: true },
    });

    if (
      !clientUser ||
      clientUser.clientId !== claims.clientId ||
      (claims.credentialFingerprint !== null &&
        !credentialFingerprintMatches(
          claims.credentialFingerprint,
          clientUser.passwordHash,
        ))
    ) {
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
