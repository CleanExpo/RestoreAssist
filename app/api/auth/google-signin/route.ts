import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getAdminAuth } from "@/lib/firebase-admin";
import { applyRateLimit } from "@/lib/rate-limiter";
import { sanitizeString } from "@/lib/sanitize";
import { validateCsrf } from "@/lib/csrf";
import { logSecurityEvent, extractRequestContext } from "@/lib/security-audit";
import { sendWelcomeEmail } from "@/lib/email";
import { notifyWelcome } from "@/lib/notifications";
import { sendFounderSignupAlert } from "@/lib/email/founder-signup-alert";
import { seedDemoDataForNewUser } from "@/lib/demo-data";
import { PRICING_CONFIG } from "@/lib/pricing";
import { apiError, fromException } from "@/lib/api-errors";
import { canonicalEmail, lockEmailIdentity } from "@/lib/email-identity";
import { deliverEmailOnce } from "@/lib/email-delivery-ledger";

const APP_URL = process.env.NEXTAUTH_URL || "https://restoreassist.app";

// Free-trial grant — sourced from PRICING_CONFIG (the SSOT) so every signup
// path (email/register, Google OAuth, native iOS, profile auto-create) grants
// the same 15-day / 30-credit trial and the marketing copy can never drift.
const TRIAL_DAYS = PRICING_CONFIG.free.trialDays;
const TRIAL_REPORT_CREDITS = PRICING_CONFIG.free.trialReportCredits;
const TRIAL_QUICK_FILL_CREDITS = PRICING_CONFIG.free.trialQuickFillCredits;
const TRIAL_DURATION_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

/** Generate a time-limited HMAC token proving the user just authenticated via Google */
function generateGoogleAuthToken(email: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required");
  }
  const timestamp = Date.now().toString();
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(`gauth:${email}:${timestamp}`)
    .digest("hex");
  return `gauth:${timestamp}:${hmac}`;
}

// POST - Handle Google sign-in via Firebase
// Creates user in database if doesn't exist, otherwise updates and returns user
export async function POST(request: NextRequest) {
  try {
    // CSRF validation
    const csrfError = validateCsrf(request);
    if (csrfError) return csrfError;

    // Rate limit: 10 attempts per 15 minutes per IP
    const rateLimited = await applyRateLimit(request, {
      maxRequests: 10,
      prefix: "google-signin",
      failClosedOnUpstashError: true, // RA-6940 — fail closed on limiter-store outage
    });
    if (rateLimited) return rateLimited;

    // Verify Firebase token
    const authHeader = request.headers.get("authorization");
    const idToken = authHeader?.replace("Bearer ", "");

    if (!idToken) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "No token provided",
        status: 401,
      });
    }

    // Verify token with Firebase Admin - MANDATORY
    const adminAuth = await getAdminAuth();
    let verifiedEmail: string | undefined;

    if (adminAuth) {
      try {
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        const signInProvider = decodedToken.firebase?.sign_in_provider;
        if (
          decodedToken.email_verified !== true ||
          signInProvider !== "google.com"
        ) {
          return apiError(request, {
            code: "UNAUTHORIZED",
            message: "A verified Google account is required",
            status: 401,
          });
        }
        verifiedEmail = decodedToken.email;
      } catch {
        // Expected client error (forged/expired token) — 401s are not
        // reported to observability per the apiError envelope design.
        return apiError(request, {
          code: "UNAUTHORIZED",
          message:
            "Invalid or expired authentication token. Please try signing in again.",
          status: 401,
        });
      }
    } else {
      // Firebase Admin SDK is not available — NEVER fall back to trusting the client-provided email.
      // The client-supplied body.email is completely attacker-controlled and could be set to any
      // existing user's address, granting full account takeover without any credential.
      // Return 503 so the client can show an appropriate error and retry later.
      return apiError(request, {
        code: "UPSTREAM_FAILED",
        message:
          "Authentication service temporarily unavailable. Please try again.",
        status: 503,
        stage: "firebase-admin-unavailable",
      });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }
    const name = sanitizeString(body.name, 200);
    const image = sanitizeString(body.image, 2000);
    // Always use the server-verified email from the Firebase token (never body.email)
    const userEmail = verifiedEmail ? canonicalEmail(verifiedEmail) : undefined;

    if (!userEmail) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Email is required",
        status: 400,
      });
    }

    const accountResult = await prisma.$transaction(async (tx) => {
      await lockEmailIdentity(tx, userEmail);
      const activeInvite = await tx.userInvite.findFirst({
        where: {
          email: { equals: userEmail, mode: "insensitive" },
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (activeInvite) return { kind: "INVITED" as const };

      const existingUser = await tx.user.findUnique({
        where: { email: userEmail },
        select: { id: true, email: true, name: true, image: true, role: true },
      });
      if (existingUser) {
        const user = await tx.user.update({
          where: { email: userEmail },
          data: {
            name: name || existingUser.name,
            image: image || existingUser.image,
            emailVerified: new Date(),
          },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            role: true,
          },
        });
        return { kind: "EXISTING" as const, user };
      }

      const user = await tx.user.create({
        data: {
          email: userEmail,
          name: name || userEmail.split("@")[0] || "User",
          image,
          emailVerified: new Date(),
          role: "ADMIN",
          subscriptionStatus: "TRIAL",
          creditsRemaining: TRIAL_REPORT_CREDITS,
          totalCreditsUsed: 0,
          trialEndsAt: new Date(Date.now() + TRIAL_DURATION_MS),
          quickFillCreditsRemaining: TRIAL_QUICK_FILL_CREDITS,
          totalQuickFillUsed: 0,
        },
        select: { id: true, email: true, name: true, image: true, role: true },
      });
      return { kind: "NEW" as const, user };
    });

    if (accountResult.kind === "INVITED") {
      return apiError(request, {
        code: "CONFLICT",
        message:
          "A team invitation is waiting for this email. Use the secure invitation link instead.",
        status: 409,
      });
    }
    const authenticatedUser = accountResult.user;

    if (accountResult.kind === "EXISTING") {
      const reqCtx = extractRequestContext(request);
      logSecurityEvent({
        eventType: "GOOGLE_SIGNIN",
        userId: authenticatedUser.id,
        email: authenticatedUser.email,
        ...reqCtx,
        details: { isNewUser: false },
      }).catch(() => {});

      return NextResponse.json({
        ...authenticatedUser,
        googleAuthToken: generateGoogleAuthToken(userEmail),
      });
    }
    const newUser = authenticatedUser;

    const reqCtx = extractRequestContext(request);
    logSecurityEvent({
      eventType: "GOOGLE_SIGNIN",
      userId: newUser.id,
      email: newUser.email,
      ...reqCtx,
      details: { isNewUser: true },
    }).catch(() => {});

    // RA-1254: Google OAuth new-signups previously skipped the welcome
    // email that email+password signups get — the template existed but
    // was only called from /api/auth/register.
    // Serverless work is not guaranteed to survive after the response commits.
    // Await each independent side effect without letting one failure suppress
    // the others or change the generic successful sign-in response.
    const sideEffects = await Promise.allSettled([
      deliverEmailOnce({
        idempotencyKey: `google-signin-welcome:${newUser.id}`,
        kind: "GOOGLE_SIGNIN_WELCOME",
        recipient: userEmail,
        payloadIdentity: `${newUser.id}|${userEmail}|${APP_URL}`,
        send: () =>
          sendWelcomeEmail({
            recipientEmail: userEmail,
            recipientName: name || userEmail.split("@")[0] || "there",
            loginUrl: `${APP_URL}/login`,
            trialDays: TRIAL_DAYS,
            trialCredits: TRIAL_REPORT_CREDITS,
            idempotencyKey: `google-signin-welcome:${newUser.id}`,
          }),
      }),
      notifyWelcome(newUser.id),
      // Launch-night Unit 4 — Google signups must announce themselves to the
      // founder too, or ad traffic that picks "Continue with Google" is
      // invisible. Self-swallowing; allSettled logs anything it returns.
      sendFounderSignupAlert({
        userId: newUser.id,
        name: name || userEmail.split("@")[0] || "there",
        email: userEmail,
        // `accountResult.user` is a narrow select without the trial columns,
        // and widening that shared helper's select on launch night is not
        // worth the ripple. These are the same constants the welcome email
        // above reports, and they are what the grant just applied — the
        // stored trialEndsAt differs only by the seconds since the insert.
        trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
        creditsRemaining: TRIAL_REPORT_CREDITS,
      }),
      // RA-1239: demo data seed so Google signups don't land on empty dashboard.
      seedDemoDataForNewUser(newUser.id),
    ]);
    for (const [index, result] of sideEffects.entries()) {
      if (result.status === "rejected") {
        console.error(
          `[google-signin] post-signin side effect ${index + 1} failed:`,
          result.reason,
        );
      }
    }

    return NextResponse.json({
      ...newUser,
      googleAuthToken: generateGoogleAuthToken(userEmail),
    });
  } catch (error) {
    return fromException(request, error, { stage: "google-signin" });
  }
}
