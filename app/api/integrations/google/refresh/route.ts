/**
 * POST /api/integrations/google/refresh — RA-1271
 *
 * Proactively refresh the calling user's Google OAuth access token.
 * Used when the client hits a 401 on a Drive/Gmail call and wants to
 * recover without a full re-consent round-trip.
 *
 * Returns:
 *   200 { ok: true,  refreshed: true,  expiresAt }  on success
 *   200 { ok: true,  refreshed: false, reason }     if already fresh
 *   401                                              unauth
 *   404 { ok: false, reason: "no-google-account" }  no Google account on this user
 *   410 { ok: false, reason: "invalid_grant" }      refresh token dead — user must re-consent
 *   502 { ok: false, reason }                       Google-side failure
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const REFRESH_WINDOW_S = 5 * 60; // skip refresh if access_token has >5 min left

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { ok: false, reason: "missing-google-client-env" },
      { status: 500 },
    );
  }

  const account = await prisma.account.findFirst({
    where: {
      userId: session.user.id,
      provider: "google",
      refresh_token: { not: null },
    },
    select: { id: true, refresh_token: true, expires_at: true },
  });

  if (!account || !account.refresh_token) {
    return NextResponse.json(
      { ok: false, reason: "no-google-account" },
      { status: 404 },
    );
  }

  // Skip if still fresh — saves a Google API call.
  const nowS = Math.floor(Date.now() / 1000);
  if (account.expires_at && account.expires_at - nowS > REFRESH_WINDOW_S) {
    return NextResponse.json({
      ok: true,
      refreshed: false,
      reason: "token-still-fresh",
      expiresAt: account.expires_at,
    });
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: account.refresh_token,
    grant_type: "refresh_token",
  });

  let res: Response;
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        reason: err instanceof Error ? err.message : "fetch-failed",
      },
      { status: 502 },
    );
  }

  if (!res.ok) {
    const text = await res.text();
    const isInvalidGrant =
      res.status === 400 && text.includes("invalid_grant");
    if (isInvalidGrant) {
      // Kill the dead refresh token so the UI can prompt re-consent.
      await prisma.account.update({
        where: { id: account.id },
        data: { refresh_token: null, access_token: null, expires_at: null },
      });
    }
    return NextResponse.json(
      {
        ok: false,
        reason: isInvalidGrant ? "invalid_grant" : `upstream-${res.status}`,
        detail: text.slice(0, 200),
      },
      { status: isInvalidGrant ? 410 : 502 },
    );
  }

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  const expiresAt = data.expires_in
    ? Math.floor(Date.now() / 1000) + data.expires_in
    : null;

  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: data.access_token ?? null,
      expires_at: expiresAt,
    },
  });

  return NextResponse.json({
    ok: true,
    refreshed: true,
    expiresAt,
  });
}
