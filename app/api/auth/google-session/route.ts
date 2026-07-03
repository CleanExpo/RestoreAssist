import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyGoogleAuthToken } from "@/lib/auth";
import { applyRateLimit } from "@/lib/rate-limiter";
import { fromException } from "@/lib/api-errors";

// POST - Confirm a NextAuth session may be created for a Google-authenticated user.
//
// RA-6940 (enumeration guard): this endpoint previously returned id/email/name/
// role for ANY email posted by an unauthenticated caller — a user-enumeration
// and role-disclosure oracle. It now requires the short-lived gauth HMAC issued
// by /api/auth/google-signin (the same proof lib/auth.ts's CredentialsProvider
// verifies) BEFORE any user data is returned. Every failure — missing token,
// invalid token, or unknown user — returns the identical generic body so the
// response neither confirms nor denies that an account exists.
//
// No in-repo caller exists (the dashboard flow goes google-signin -> NextAuth
// signIn("credentials") directly); the gate is for parity with any out-of-repo
// consumer completing the same handshake.

function genericFailure(): NextResponse {
  return NextResponse.json({ success: false }, { status: 401 });
}

export async function POST(request: NextRequest) {
  try {
    // Auth-adjacent unauthenticated surface: rate limit fail-closed.
    const rateLimited = await applyRateLimit(request, {
      maxRequests: 10,
      prefix: "google-session",
      failClosedOnUpstashError: true,
    });
    if (rateLimited) return rateLimited;

    let body: { email?: unknown; googleAuthToken?: unknown };
    try {
      body = await request.json();
    } catch {
      return genericFailure();
    }

    const email = typeof body.email === "string" ? body.email : "";
    const token =
      typeof body.googleAuthToken === "string" ? body.googleAuthToken : "";

    // Proof-of-Google-auth FIRST — before any database lookup, so an invalid
    // caller learns nothing about which emails exist.
    if (!email || !token || !verifyGoogleAuthToken(email, token)) {
      return genericFailure();
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Identical shape and status to the invalid-token branch.
      return genericFailure();
    }

    // Return success - the client will call NextAuth signIn with credentials
    // (email + the same gauth token), which CredentialsProvider re-verifies.
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "google-session" });
  }
}
