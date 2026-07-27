/**
 * Shared guard for /api/portal/* routes that require a logged-in homeowner.
 * Verifies the Bearer JWT and returns claims, or a ready 401 response.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateClientRequest,
  type ClientPortalClaims,
} from "@/lib/portal/client-jwt";

export type ClientAuthResult =
  | { ok: true; claims: ClientPortalClaims }
  | { ok: false; response: NextResponse };

export async function requireClientAuth(
  request: NextRequest,
): Promise<ClientAuthResult> {
  const claims = await authenticateClientRequest(request);
  if (!claims) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unauthorized — please sign in again" },
        { status: 401 },
      ),
    };
  }
  return { ok: true, claims };
}
