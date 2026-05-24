// RA-2073 — OAuth handoff: phase 2 (redeem).
//
// This endpoint runs INSIDE the WKWebView. iOS Universal Links closes the
// SFSafariViewController and opens this URL here. The redeem flow:
//
//   1. Look up the handoff token (single-use, 60s TTL).
//   2. Mark it redeemed.
//   3. Return 302 to ?next= with Set-Cookie: __Secure-next-auth.session-token
//      = <persisted JWT>. Because this Set-Cookie is on a response fetched
//      by WKWebView, the cookie lands in WKWebView's cookie jar (NOT the
//      stale SFSafariViewController jar) — which is exactly the goal.
//
// Path: /auth/redeem (NOT under /api/auth/* on purpose — the AASA file
// excludes /api/auth/* from Universal Links so the OAuth dance and the
// initiate step complete inside SFVC, but /auth/* is included so iOS
// intercepts the handoff hop).
//
// Failure modes:
//   - Token missing / wrong / expired / already redeemed → redirect to
//     /login with an error code. The browser still works as a fallback
//     (user can email/password sign in).
//   - Server error during DB lookup → fail closed, redirect to /login.
//
// This route uses Next.js' Route Handler API. The `Response` we return
// includes both `Set-Cookie` and `Location` headers, so the redirect
// chain is: redeem → 302 with cookie → next URL → cookie sent → session
// available.

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";

// Match NextAuth's session.maxAge (lib/auth.ts:291). Keeping these in
// sync is important: if NextAuth's cookie maxAge differs from this one,
// users could see a session-token cookie that outlives the JWT inside
// it (or vice-versa). 90 days = 7,776,000 seconds.
const COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

function isSafeNextPath(next: string | null): string {
  if (!next || typeof next !== "string") return "/dashboard";
  if (!next.startsWith("/")) return "/dashboard";
  if (next.startsWith("//")) return "/dashboard";
  return next;
}

function loginRedirect(origin: string, error: string): NextResponse {
  const url = new URL("/login", origin);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url, { status: 302 });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const tokenPlaintext = url.searchParams.get("token");
  const next = isSafeNextPath(url.searchParams.get("next"));

  if (!tokenPlaintext || tokenPlaintext.length < 16) {
    return loginRedirect(url.origin, "HandoffMissingToken");
  }

  const tokenHash = crypto
    .createHash("sha256")
    .update(tokenPlaintext)
    .digest("hex");

  // Atomic redeem: mark the token consumed only if it's still valid.
  // updateMany returns count=0 if no row matched (already redeemed,
  // expired, or never existed) — that's our race-safe gate.
  const now = new Date();
  const updateResult = await prisma.oAuthHandoffToken.updateMany({
    where: {
      tokenHash,
      redeemedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      redeemedAt: now,
    },
  });

  if (updateResult.count === 0) {
    // Token doesn't exist, was already used, or is expired. Fail closed.
    return loginRedirect(url.origin, "HandoffInvalidToken");
  }

  // Now safe to read the row (we own the redeem). Pull the persisted JWT.
  const row = await prisma.oAuthHandoffToken.findUnique({
    where: { tokenHash },
    select: { encodedJwt: true },
  });

  if (!row?.encodedJwt) {
    // Should be unreachable given the updateMany count check, but defend
    // against partial DB state.
    return loginRedirect(url.origin, "HandoffMissingJwt");
  }

  // Best-effort cleanup. If this fails it's not fatal — expiresAt
  // ensures stale rows are excluded from future redeems anyway.
  prisma.oAuthHandoffToken.delete({ where: { tokenHash } }).catch(() => {
    /* swallowed — expiresAt prevents reuse */
  });

  // Return 302 with the session cookie attached. WKWebView stores the
  // cookie in its own jar (this is the whole point of the handoff)
  // before following the Location header to the target page.
  const response = NextResponse.redirect(new URL(next, url.origin), {
    status: 302,
  });

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: row.encodedJwt,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });

  return response;
}
