// Native iOS sign-in token exchange.
//
// History:
//   - 1.0.3(14) (RA-2073): introduced this endpoint to back native Apple
//     Sign-In on iOS. The architectural fix for the SFSafariViewController
//     cookie-jar isolation that caused the 1.0.2(12) sign-in loop —
//     because this endpoint is fetched from inside WKWebView, the
//     Set-Cookie response lands in WKWebView's cookie jar directly.
//   - 1.0.4(15) (RA-2076): adds Google native sign-in alongside Apple.
//     Same architecture — the capgo plugin presents Google's native iOS
//     sheet, returns the Google identity JWT to JS in WKWebView, JS POSTs
//     here, we verify the JWT against Google's JWKS, find-or-create the
//     User, and Set-Cookie the NextAuth session token.
//
// Flow on iOS (per provider):
//   1. WKWebView JS calls SocialLogin.login({ provider, options })
//   2. Native plugin presents the iOS sheet (ASAuthorizationController for
//      Apple, GIDSignIn for Google)
//   3. Plugin returns the identity JWT to JS
//   4. JS POSTs `{ provider, idToken, nonce }` to THIS endpoint via fetch()
//   5. This endpoint:
//        a. Verifies the JWT signature against the provider's JWKS
//        b. Validates iss / aud / exp / nonce
//        c. Finds-or-creates the User (matching the field set
//           events.createUser in lib/auth.ts:317-338 produces)
//        d. Encodes a NextAuth-compatible session JWT via next-auth/jwt
//        e. Returns 200 with Set-Cookie matching lib/auth.ts:294-308
//   6. JS reads response, navigates to /dashboard with valid session.
//
// Web is unchanged — this endpoint is iOS-only by convention; web users
// continue to use NextAuth's GoogleProvider / AppleProvider OAuth flows.

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { jwtVerify, createRemoteJWKSet, type JWTPayload } from "jose";
import { encode as encodeJwt } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { logSecurityEvent, extractRequestContext } from "@/lib/security-audit";
import { PRICING_CONFIG } from "@/lib/pricing";

// Free-trial grant — sourced from PRICING_CONFIG (the SSOT) so the native iOS
// signup path grants the identical 15-day / 30-credit trial as email/register
// and Google OAuth. See lib/__tests__/pricing-integrity.test.ts.
const TRIAL_REPORT_CREDITS = PRICING_CONFIG.free.trialReportCredits;
const TRIAL_QUICK_FILL_CREDITS = PRICING_CONFIG.free.trialQuickFillCredits;
const TRIAL_DURATION_MS = PRICING_CONFIG.free.trialDays * 24 * 60 * 60 * 1000;

// Apple's public keys endpoint (JWKS). Verifying the signature against
// these guarantees the token came from Apple's auth server.
const APPLE_JWKS = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
);
const APPLE_ISSUER = "https://appleid.apple.com";

// Google's public keys endpoint (JWKS). Verifying the signature against
// these guarantees the token came from Google's auth server.
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
// Google issues tokens with either `https://accounts.google.com` or
// `accounts.google.com`. Both are valid (per Google's docs).
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

// Match NextAuth's session config in lib/auth.ts:289-307. These constants
// MUST stay in sync; if NextAuth's cookie config changes, update here too.
const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";
const SESSION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
const TOKEN_VERIFICATION_FAILED_MESSAGE = "Token verification failed";
const USER_CREATE_FAILED_MESSAGE = "User create failed";
const SESSION_JWT_ENCODE_FAILED_MESSAGE = "Session JWT encode failed";

type Provider = "apple" | "google";

interface ExchangeBody {
  provider: Provider;
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

interface VerifiedClaims {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
  // Apple-specific signals (undefined for Google)
  isPrivateRelay?: boolean;
}

/**
 * Verify the inbound idToken against the provider's JWKS and return a
 * normalised claims object. Throws on verification failure.
 */
async function verifyAndNormaliseToken(
  provider: Provider,
  idToken: string,
  noncePlaintext: string | undefined,
): Promise<VerifiedClaims> {
  let payload: JWTPayload;

  if (provider === "apple") {
    // Apple expects either the bundle ID (native ASAuthorizationController)
    // or the Services ID (web Sign in with Apple). The plugin we ship in
    // 1.0.3+ calls ASAuthorizationController which issues `aud = bundle ID`.
    // Both audiences accepted so a future web-flow exchange also works.
    const acceptedAudiences = [
      process.env.APPLE_BUNDLE_ID || "com.restoreassist.app",
      process.env.APPLE_CLIENT_ID, // Services ID like com.restoreassist.signin
    ].filter(Boolean) as string[];

    const { payload: verified } = await jwtVerify(idToken, APPLE_JWKS, {
      issuer: APPLE_ISSUER,
      audience: acceptedAudiences,
    });
    payload = verified;
  } else {
    // Google — JWKS at oauth2/v3/certs, audience = the iOS-type OAuth
    // client ID (the same value used to initialise the plugin client-side).
    const acceptedAudiences = [
      process.env.GOOGLE_IOS_CLIENT_ID,
      process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      "292141944467-8hhd4eub33tplq6ep5lc9iltu8jcatvp.apps.googleusercontent.com",
    ].filter(Boolean) as string[];

    const { payload: verified } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: GOOGLE_ISSUERS,
      audience: acceptedAudiences,
    });
    payload = verified;
  }

  // Replay protection: the IdP is SUPPOSED to echo the nonce we sent in
  // the token's `nonce` claim. In practice:
  //   - Apple ASAuthorizationController echoes it back ✓
  //   - Google via capgo SocialLogin 1.0.4(15) DOES NOT — the plugin
  //     drops `options.nonce` before calling GIDSignIn, so Google's
  //     idToken has no nonce claim at all (claim=undefined).
  //     Evidence: SecurityEvent 2026-05-15T10:29:08Z claim=… (empty).
  //
  // Strategy: enforce nonce check IF AND ONLY IF the IdP returned one.
  // When the claim is absent (Google native iOS via capgo), skip and
  // rely on the JWT's iss/aud/exp/signature for authenticity. Standard
  // NextAuth OAuth flows don't enforce nonce on their callback either,
  // so this matches the security posture of the web path.
  //
  // When the claim IS present, accept either plaintext OR SHA-256 hex
  // match for plugin-version forward compatibility.
  //
  // TODO(RA-iOS-nonce): file follow-up to either patch the capgo plugin
  // upstream to forward the nonce, or swap to a plugin that does.
  if (
    noncePlaintext &&
    typeof payload.nonce === "string" &&
    payload.nonce.length > 0
  ) {
    const sha256Hex = crypto
      .createHash("sha256")
      .update(noncePlaintext)
      .digest("hex");
    if (payload.nonce !== noncePlaintext && payload.nonce !== sha256Hex) {
      // Do not embed nonce material (even truncated) in the error — it can
      // reach logs/aggregators. The length is enough to debug a mismatch.
      throw new Error(
        `Nonce mismatch (claim length=${payload.nonce.length}, nonce present but neither exact nor SHA-256 match)`,
      );
    }
  }

  const sub = typeof payload.sub === "string" ? payload.sub : null;
  if (!sub) throw new Error(`${provider} token missing sub claim`);

  const email =
    typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  const emailVerified =
    payload.email_verified === true || payload.email_verified === "true";
  const name = typeof payload.name === "string" ? payload.name : null;
  const picture = typeof payload.picture === "string" ? payload.picture : null;

  if (provider === "apple") {
    return {
      sub,
      email,
      emailVerified,
      name,
      picture,
      isPrivateRelay:
        payload.is_private_email === true ||
        payload.is_private_email === "true",
    };
  }
  return { sub, email, emailVerified, name, picture };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: ExchangeBody;
  try {
    body = (await request.json()) as ExchangeBody;
  } catch {
    return jsonError(request, 400, "VALIDATION", "Invalid JSON body");
  }

  if (body?.provider !== "apple" && body?.provider !== "google") {
    return jsonError(
      request,
      400,
      "UNSUPPORTED_PROVIDER",
      `provider=${body?.provider} not supported on this endpoint`,
    );
  }
  const provider: Provider = body.provider;

  if (typeof body.idToken !== "string" || body.idToken.length < 32) {
    return jsonError(
      request,
      400,
      "VALIDATION",
      "Missing or malformed idToken",
    );
  }

  let claims: VerifiedClaims;
  try {
    claims = await verifyAndNormaliseToken(provider, body.idToken, body.nonce);
  } catch (err) {
    console.error("[native-token-exchange] token verification failed:", err);
    return jsonError(
      request,
      401,
      "TOKEN_VERIFICATION_FAILED",
      TOKEN_VERIFICATION_FAILED_MESSAGE,
    );
  }

  if (!claims.email) {
    // Apple sometimes omits email on subsequent sign-ins (only first
    // returns it). Google omits it only if the user revoked the email
    // scope. We require it for find-or-create today; a future change
    // could store appleSubject/googleSubject and look up by sub.
    return jsonError(
      request,
      401,
      "MISSING_EMAIL",
      provider === "apple"
        ? "Apple token missing email claim. On a subsequent sign-in, sign out of Sign in with Apple in iOS Settings → Apple ID → Sign in with Apple, then retry."
        : "Google token missing email claim. Re-grant the email scope and retry.",
    );
  }
  const email = claims.email;

  // Find-or-create user. PrismaAdapter normally handles this for OAuth;
  // for our native flow we replicate the same shape — including the
  // exact field set events.createUser stamps in lib/auth.ts:317-338.
  let user: any;
  let isNewUser = false;
  try {
    user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      isNewUser = true;
      try {
        user = await prisma.user.create({
          data: {
            email,
            name: claims.name,
            image: claims.picture,
            needsOnboarding: true,
            role: "ADMIN",
            subscriptionStatus: "TRIAL",
            creditsRemaining: TRIAL_REPORT_CREDITS,
            totalCreditsUsed: 0,
            trialEndsAt: new Date(Date.now() + TRIAL_DURATION_MS),
            quickFillCreditsRemaining: TRIAL_QUICK_FILL_CREDITS,
            totalQuickFillUsed: 0,
            emailVerified: claims.emailVerified ? new Date() : null,
          } as any,
        });
      } catch (err) {
        console.error("[native-token-exchange] user create failed:", err);
        return jsonError(
          request,
          500,
          "USER_CREATE_FAILED",
          USER_CREATE_FAILED_MESSAGE,
          email,
        );
      }
    }
  } catch (err) {
    console.error("[native-token-exchange] user lookup failed:", err);
    return jsonError(
      request,
      500,
      "USER_CREATE_FAILED",
      USER_CREATE_FAILED_MESSAGE,
      email,
    );
  }

  // Stamp setupCompletedAt the SAME way the jwt() callback does in
  // lib/auth.ts:396-418. Without this claim the middleware's setup-wizard
  // gate (when SETUP_WIZARD_ENABLED=true) sees `!token.setupCompletedAt`
  // as truthy and redirects EVERY iOS native sign-in to /setup, which
  // doesn't render well inside WKWebView and produced a 3-day "app is
  // dead" report on the App Store build. Fail-open on DB error — auth
  // must not break on a transient Prisma blip.
  let setupCompletedAt: string | null = null;
  try {
    const userWithOrg = await prisma.user.findUnique({
      where: { id: user.id },
      select: { organization: { select: { setupCompletedAt: true } } },
    });
    const value = (
      userWithOrg as { organization?: { setupCompletedAt: Date | null } } | null
    )?.organization?.setupCompletedAt;
    setupCompletedAt = value ? (value as Date).toISOString() : null;
  } catch {
    // Fail-open — middleware will treat null the same as a real null
    // from the DB.
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
    needsOnboarding: Boolean(
      (user as { needsOnboarding?: boolean }).needsOnboarding,
    ),
    setupCompletedAt,
  };

  let sessionToken: string;
  try {
    sessionToken = await encodeJwt({
      token: tokenPayload,
      secret: process.env.NEXTAUTH_SECRET!,
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  } catch (err) {
    console.error("[native-token-exchange] session JWT encode failed:", err);
    return jsonError(
      request,
      500,
      "JWT_ENCODE_FAILED",
      SESSION_JWT_ENCODE_FAILED_MESSAGE,
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
      provider,
      isNewUser,
      sub: claims.sub,
      privateRelay: claims.isPrivateRelay ?? false,
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
