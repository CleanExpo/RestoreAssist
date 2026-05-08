// RA-2073 — OAuth handoff: phase 1 (mint).
//
// On iOS Capacitor, OAuth completes inside SFSafariViewController which has
// its own cookie jar isolated from the parent WKWebView. After the OAuth
// callback runs and NextAuth sets the session cookie INSIDE SFVC, we need
// to ferry that session into the WebView. This endpoint runs while the user
// is still inside SFVC (the cookie is readable here), captures the encoded
// JWT verbatim, persists it under a one-time handoff token, and 302s to
// /auth/redeem?token=<X>&next=<Y>.
//
// /auth/redeem is a Universal Link target (the AASA file at /.well-known/
// apple-app-site-association excludes /api/auth/* but includes /auth/*).
// iOS intercepts the 302 → closes SFVC → opens /auth/redeem in the
// WKWebView. The redeem route returns Set-Cookie with the persisted JWT,
// landing the cookie in WKWebView's cookie jar.
//
// Configured via lib/oauth-native.ts: on iOS, the OAuth callbackUrl is
// rewritten to /api/auth/handoff/initiate?next=<originalCallbackUrl>, so
// NextAuth lands users here after the callback succeeds.
//
// Security:
//   - Tokens are sha256-hashed at rest; plaintext is never persisted.
//   - 60s TTL, single-use (redeemedAt set on first use, row deleted shortly after).
//   - Endpoint requires a valid existing NextAuth session cookie. If the
//     cookie is missing the user is redirected to /login.
//   - "next" parameter is restricted to same-origin paths to prevent
//     open-redirect abuse.
//
// On web, /api/auth/* is excluded from Universal Links so this endpoint
// would still be reachable directly — but the lib/oauth-native.ts wrapper
// only routes iOS users through here. Web users land on /dashboard
// directly per NextAuth's normal flow.

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";

const TOKEN_TTL_SECONDS = 60;
const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";

function isSafeNextPath(next: string | null): string {
  // Only accept absolute same-origin paths. Falls back to /dashboard on
  // anything suspicious — protocol-relative URLs (//evil.com), absolute
  // URLs to other origins, or empty values.
  if (!next || typeof next !== "string") return "/dashboard";
  if (!next.startsWith("/")) return "/dashboard";
  if (next.startsWith("//")) return "/dashboard";
  return next;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const next = isSafeNextPath(url.searchParams.get("next"));

  // 1. Read the existing NextAuth session cookie. We read the cookie
  //    VALUE directly (the encoded JWT string) so we can re-emit it as
  //    Set-Cookie from /auth/redeem. We also call getServerSession to
  //    verify it's still valid (not expired, not tampered).
  const sessionTokenCookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (!sessionTokenCookie?.value) {
    // No cookie present — user landed here without completing OAuth.
    // Redirect to /login. (This is the Path B fallback if the OAuth
    // callback failed silently.)
    return NextResponse.redirect(new URL("/login", url.origin), { status: 302 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    // Cookie present but session is invalid (expired / revoked).
    return NextResponse.redirect(
      new URL("/login?error=HandoffSessionInvalid", url.origin),
      { status: 302 },
    );
  }

  // 2. Mint a single-use opaque handoff token. 32 random bytes, base64url
  //    encoded → ~43-char URL-safe string. Stored as sha256 hash; the
  //    plaintext only travels in the URL between this redirect and
  //    /auth/redeem (which is a Universal Link target — the trip is
  //    intercepted by iOS within milliseconds).
  const plaintext = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(plaintext).digest("hex");

  await prisma.oAuthHandoffToken.create({
    data: {
      tokenHash,
      userId: session.user.id,
      encodedJwt: sessionTokenCookie.value,
      expiresAt: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000),
    },
  });

  // 3. Redirect to /auth/redeem. iOS Universal Links will intercept this
  //    redirect target (it matches the AASA "/*" rule), close the
  //    SFSafariViewController, and open the URL in the parent WKWebView.
  const redeemUrl = new URL("/auth/redeem", url.origin);
  redeemUrl.searchParams.set("token", plaintext);
  redeemUrl.searchParams.set("next", next);

  return NextResponse.redirect(redeemUrl, { status: 302 });
}
