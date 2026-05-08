// RA-2073 (1.0.3) — Native iOS Sign in with Apple → NextAuth session.
//
// The architectural fix for the iOS sign-in loop. Replaces the
// SFSafariViewController + handoff approach (which failed because
// Universal Links don't intercept server-side 302 redirects from
// inside SFVC reliably).
//
// Flow on iOS:
//   1. WKWebView JS calls native plugin: SignInWithApple.authorize()
//      via @capacitor-community/apple-sign-in
//   2. iOS shows native ASAuthorizationController sheet (Touch/Face ID)
//   3. Plugin returns { idToken, authorizationCode, user, nonce } to JS
//   4. JS POSTs the idToken to THIS endpoint via fetch() — the call
//      originates in WKWebView, so Set-Cookie lands in WKWebView's
//      cookie jar. That's the whole point.
//   5. This endpoint:
//        a. Verifies the JWT signature against Apple's JWKS
//        b. Validates iss / aud / exp / nonce
//        c. Finds-or-creates the User (matching the field set
//           events.createUser in lib/auth.ts:317-338 produces)
//        d. Encodes a NextAuth-compatible session JWT via next-auth/jwt
//           (so getServerSession + middleware accept it)
//        e. Returns 200 with Set-Cookie matching the cookie config in
//           lib/auth.ts:294-308
//   6. JS reads response, navigates to /dashboard with valid session.
//
// Web is unchanged — this endpoint is iOS-only by convention; web users
// continue to use NextAuth's GoogleProvider / AppleProvider OAuth flows.

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { encode as encodeJwt } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { logSecurityEvent, extractRequestContext } from "@/lib/security-audit";

// Apple's public keys endpoint (JWKS). Verifying the signature against
// these guarantees the token came from Apple's auth server.
const APPLE_JWKS = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
);
const APPLE_ISSUER = "https://appleid.apple.com";

// Match NextAuth's session config in lib/auth.ts:289-307. These constants
// MUST stay in sync; if NextAuth's cookie config changes, update here too.
const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";
const SESSION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

interface ExchangeBody {
  provider: "apple"; // future: extend with "google" when native plugin chosen
  idToken: string;
  nonce?: string;
}

function jsonError(
  request: NextRequest,
  status: number,
  code: string,
  message: string,
  email?: string,
): NextResponse {
  const ctx = extractRequestContext(request);
  // Audit every failed attempt. WARNING severity — not CRITICAL because
  // most failures will be expired tokens / misconfigured clients, not
  // attacks. CRITICAL is reserved for confirmed-malicious patterns.
  logSecurityEvent({
    eventType: "OAUTH_NATIVE_TOKEN_EXCHANGE",
    severity: "WARNING",
    email,
    ...ctx,
    details: { ok: false, code, message },
  }).catch(() => {});
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: ExchangeBody;
  try {
    body = (await request.json()) as ExchangeBody;
  } catch {
    return jsonError(request, 400, "VALIDATION", "Invalid JSON body");
  }

  if (body?.provider !== "apple") {
    // Reserved for future Google native support. Today, the iOS app
    // hides Continue with Google entirely (RA-2073 1.0.3 plan), so any
    // non-Apple provider here is an unexpected client bug.
    return jsonError(
      request,
      400,
      "UNSUPPORTED_PROVIDER",
      `provider=${body?.provider} not supported on this endpoint`,
    );
  }

  if (typeof body.idToken !== "string" || body.idToken.length < 32) {
    return jsonError(request, 400, "VALIDATION", "Missing or malformed idToken");
  }

  // Apple expects either the bundle ID (native ASAuthorizationController)
  // or the Services ID (web Sign in with Apple). The plugin we ship in
  // 1.0.3 calls ASAuthorizationController which issues `aud = bundle ID`.
  // We accept both so a future web-flow token exchange is also valid.
  const acceptedAudiences = [
    process.env.APPLE_BUNDLE_ID || "com.restoreassist.app",
    process.env.APPLE_CLIENT_ID, // Services ID like com.restoreassist.signin
  ].filter(Boolean) as string[];

  let payload: {
    sub?: unknown;
    email?: unknown;
    email_verified?: unknown;
    is_private_email?: unknown;
    nonce?: unknown;
    aud?: unknown;
    iss?: unknown;
    exp?: unknown;
  };
  try {
    const { payload: verified } = await jwtVerify(body.idToken, APPLE_JWKS, {
      issuer: APPLE_ISSUER,
      audience: acceptedAudiences,
    });
    payload = verified;
  } catch (err) {
    return jsonError(
      request,
      401,
      "TOKEN_VERIFICATION_FAILED",
      err instanceof Error ? err.message : "Apple token verification failed",
    );
  }

  // Replay protection: the plugin SHA-256s the nonce we sent before
  // forwarding it to Apple. Apple includes the SHA-256 hex back in the
  // `nonce` claim. Verify ourselves to ensure this token was minted for
  // this exact request, not replayed from another client.
  if (body.nonce) {
    const expected = crypto
      .createHash("sha256")
      .update(body.nonce)
      .digest("hex");
    if (payload.nonce !== expected) {
      return jsonError(request, 401, "NONCE_MISMATCH", "Nonce mismatch");
    }
  }

  const sub = typeof payload.sub === "string" ? payload.sub : null;
  const email =
    typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  if (!sub) {
    return jsonError(
      request,
      401,
      "MISSING_SUB",
      "Apple token missing sub claim",
    );
  }
  if (!email) {
    // Apple sometimes omits email on subsequent sign-ins (only first
    // returns it). For first sign-ins we require it; for subsequent
    // sign-ins we'd need to look up by `sub` mapped to a stored
    // appleSubject column — which we don't have today. Treat as failure
    // and surface clearly.
    return jsonError(
      request,
      401,
      "MISSING_EMAIL",
      "Apple token missing email claim. On a subsequent sign-in, sign out of Sign in with Apple in iOS Settings → Apple ID → Sign in with Apple, then retry.",
      undefined,
    );
  }

  // Find-or-create user. PrismaAdapter normally handles this for OAuth;
  // for our native flow we replicate the same shape — including the
  // exact field set events.createUser stamps in lib/auth.ts:317-338.
  let user = await prisma.user.findUnique({ where: { email } });
  let isNewUser = false;
  if (!user) {
    isNewUser = true;
    try {
      user = await prisma.user.create({
        data: {
          email,
          // Apple may include name on first auth via the `user` field on
          // the plugin response, but it's not in the JWT. Plugin caller
          // could pass it through; defer to follow-up.
          name: null,
          needsOnboarding: true,
          role: "ADMIN",
          subscriptionStatus: "TRIAL",
          creditsRemaining: 30,
          totalCreditsUsed: 0,
          trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          quickFillCreditsRemaining: 30,
          totalQuickFillUsed: 0,
          emailVerified:
            payload.email_verified === true || payload.email_verified === "true"
              ? new Date()
              : null,
        } as any,
      });
    } catch (err) {
      return jsonError(
        request,
        500,
        "USER_CREATE_FAILED",
        err instanceof Error ? err.message : "User create failed",
        email,
      );
    }
  }

  // Build the session JWT payload. Mirror what lib/auth.ts:341-360
  // jwt() callback would produce on a Provider sign-in. Subsequent
  // requests will run that callback again on `updateAge`-driven refresh
  // and pick up fresh `role` / `needsOnboarding` from the DB.
  const nowSec = Math.floor(Date.now() / 1000);
  const tokenPayload = {
    name: user.name,
    email: user.email,
    picture: user.image,
    sub: user.id,
    role: (user as { role?: string }).role ?? "ADMIN",
    mintedAt: nowSec,
    rememberMe: true,
    customExp: nowSec + SESSION_MAX_AGE_SECONDS,
    needsOnboarding: Boolean((user as { needsOnboarding?: boolean }).needsOnboarding),
  };

  let sessionToken: string;
  try {
    sessionToken = await encodeJwt({
      token: tokenPayload,
      secret: process.env.NEXTAUTH_SECRET!,
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  } catch (err) {
    return jsonError(
      request,
      500,
      "JWT_ENCODE_FAILED",
      err instanceof Error ? err.message : "Session JWT encode failed",
      email,
    );
  }

  const ctx = extractRequestContext(request);
  await logSecurityEvent({
    eventType: "OAUTH_NATIVE_TOKEN_EXCHANGE",
    severity: "INFO",
    userId: user.id,
    email: user.email,
    ...ctx,
    details: {
      ok: true,
      provider: "apple",
      isNewUser,
      sub,
      privateRelay:
        payload.is_private_email === true || payload.is_private_email === "true",
    },
  }).catch(() => {});

  // Set-Cookie on the response. Because this endpoint is fetched from
  // WKWebView, the cookie lands in WKWebView's cookie jar — exactly
  // where the dashboard middleware reads it from. This is the whole
  // architectural difference vs. the SFSafariViewController flow.
  const response = NextResponse.json(
    {
      ok: true,
      isNewUser,
      user: {
        id: user.id,
        email: user.email,
        needsOnboarding: Boolean(
          (user as { needsOnboarding?: boolean }).needsOnboarding,
        ),
      },
    },
    { status: 200 },
  );

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return response;
}
