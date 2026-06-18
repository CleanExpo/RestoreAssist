import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { sanitizeString } from "@/lib/sanitize";
import { validateCsrf } from "@/lib/csrf";
import { sendWelcomeEmail } from "@/lib/email";
import { sendWithRetry } from "@/lib/email-retry";
import { notifyWelcome } from "@/lib/notifications";
import { logSecurityEvent, extractRequestContext } from "@/lib/security-audit";
import { rejectIfBreached } from "@/lib/auth/password-breach";
import { verifyBotId } from "@/lib/auth/botid";
import { track } from "@/lib/analytics/track";
import { apiError } from "@/lib/api-errors";

const APP_URL = process.env.NEXTAUTH_URL || "https://restoreassist.app";

export async function POST(request: NextRequest) {
  try {
    const csrfError = validateCsrf(request);
    if (csrfError) return csrfError;

    const rateLimited = await applyRateLimit(request, {
      maxRequests: 5,
      prefix: "register",
    });
    if (rateLimited) return rateLimited;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid request body",
        status: 400,
      });
    }
    const name = sanitizeString(body.name, 200);
    const email = sanitizeString(body.email, 320);
    const { password, acceptedTerms } = body;

    if (!name || !email || !password) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Name, email, and password are required",
        status: 400,
      });
    }

    // RA-1286: bot-detection gate on the public signup endpoint. Vercel BotID
    // auto-bypasses in dev/preview (NODE_ENV !== "production").
    const botCheck = await verifyBotId();
    if (!botCheck.ok) {
      return apiError(request, {
        code: "VALIDATION",
        message: botCheck.reason,
        status: 400,
      });
    }

    // RA-1255: ToS + Privacy acceptance mandatory for new email signups.
    // Server-side re-check — don't trust just the client-side guard.
    if (acceptedTerms !== true) {
      return apiError(request, {
        code: "VALIDATION",
        message:
          "You must accept the Terms of Service and Privacy Policy to create an account",
        status: 400,
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Please provide a valid email address",
        status: 400,
      });
    }

    // RA-1258: raise floor to 12 chars per NIST SP 800-63B / OWASP 2024.
    if (typeof password !== "string" || password.length < 12) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Password must be at least 12 characters",
        status: 400,
      });
    }

    // RA-1591 — HIBP k-anonymity breach check. Fails open on network
    // error (rejectIfBreached returns null); only blocks when HIBP
    // confirms the password has been seen in a known breach.
    const breachMsg = await rejectIfBreached(password);
    if (breachMsg) {
      return apiError(request, {
        code: "VALIDATION",
        message: breachMsg,
        status: 400,
      });
    }

    // RA-1340: hash password FIRST so the duplicate-email path takes the
    // same ~250ms bcrypt cost as the create path. Previously the hash only
    // ran after the uniqueness check — a ~250ms timing oracle revealed
    // whether an email was registered, even with a generic error message.
    const hashedPassword = await bcrypt.hash(password, 12);

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      return apiError(request, {
        code: "CONFLICT",
        message: "User with this email already exists",
        status: 400,
      });
    }

    // All registrations create an ADMIN user with their own organisation
    const canCreateOrganization = Boolean(prisma.organization?.create);

    if (!canCreateOrganization) {
      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: "ADMIN",
          subscriptionStatus: "TRIAL",
          creditsRemaining: 30,
          totalCreditsUsed: 0,
          trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          quickFillCreditsRemaining: 30,
          totalQuickFillUsed: 0,
          // RA-1255: cast needed until Prisma client regenerates in Vercel build
          acceptedTermsAt: new Date() as any,
        } as any,
      });
      sendWithRetry(
        () =>
          sendWelcomeEmail({
            recipientEmail: email,
            recipientName: name,
            loginUrl: `${APP_URL}/login`,
            trialDays: 30,
            trialCredits: 30,
          }),
        { stage: "signup-welcome" },
      ).catch((err) => console.error("[Register] Welcome email failed:", err));
      notifyWelcome(user.id).catch((err) =>
        console.error("[Register] notifyWelcome failed:", err),
      );
      // Sample data is now seeded by /api/setup/activate (Phase 5+),
      // branded with the user's hydrated business profile instead of
      // generic placeholders. See docs/superpowers/specs/2026-05-12-onboarding-redesign-design.md.
      const reqCtx = extractRequestContext(request);
      logSecurityEvent({
        eventType: "ACCOUNT_REGISTERED",
        userId: user.id,
        email: user.email,
        ...reqCtx,
        details: { role: "ADMIN", hasOrganization: false },
      }).catch(() => {});
      // RA-1246 — signup_completed (unconditional)
      track(user.id, "signup_completed", { hasOrganization: false }).catch(
        () => {},
      );
      const { password: _, ...userWithoutPassword } = user;
      return NextResponse.json(
        {
          message: "User created successfully",
          user: userWithoutPassword,
          warning:
            "Organisation setup is pending. Please run `npx prisma generate` and restart the dev server to enable team features.",
        },
        { status: 201 },
      );
    }

    try {
      const updatedUser = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name,
            email,
            password: hashedPassword,
            role: "ADMIN",
            subscriptionStatus: "TRIAL",
            creditsRemaining: 30,
            totalCreditsUsed: 0,
            trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            quickFillCreditsRemaining: 30,
            totalQuickFillUsed: 0,
            // RA-1255: cast needed until Prisma client regenerates in Vercel build
            acceptedTermsAt: new Date() as any,
          } as any,
        });
        const orgName = `${name}'s Organisation`;
        const org = await tx.organization.create({
          data: { name: orgName, ownerId: user.id },
        });
        return await tx.user.update({
          where: { id: user.id },
          data: { organizationId: org.id },
        });
      });
      // RA-1309 — await all post-transaction side effects via allSettled so
      // they run concurrently but we don't return the HTTP response until
      // they're done. Previous code fired them as unawaited fire-and-forgets
      // which (a) could race with NextAuth's first session write on the
      // replica, and (b) meant unhandled rejections crashed the process
      // instead of being caught locally. allSettled guarantees one of the
      // callback `.catch()`s swallows each rejection so nothing bubbles.
      const reqCtx = extractRequestContext(request);
      await Promise.allSettled([
        sendWithRetry(
          () =>
            sendWelcomeEmail({
              recipientEmail: email,
              recipientName: name,
              loginUrl: `${APP_URL}/login`,
              trialDays: 30,
              trialCredits: 30,
            }),
          { stage: "signup-welcome" },
        ).catch((err) =>
          console.error("[Register] Welcome email failed:", err),
        ),
        notifyWelcome(updatedUser.id).catch((err) =>
          console.error("[Register] notifyWelcome failed:", err),
        ),
        // Sample data is now seeded by /api/setup/activate (Phase 5+),
        // branded with the user's hydrated business profile instead of
        // generic placeholders. See docs/superpowers/specs/2026-05-12-onboarding-redesign-design.md.
        logSecurityEvent({
          eventType: "ACCOUNT_REGISTERED",
          userId: updatedUser.id,
          email: updatedUser.email,
          ...reqCtx,
          details: { role: "ADMIN", hasOrganization: true },
        }).catch(() => {}),
        // RA-1246 — signup_completed (unconditional)
        track(updatedUser.id, "signup_completed", {
          hasOrganization: true,
        }).catch(() => {}),
      ]);
      const { password: _, ...userWithoutPassword } = updatedUser;
      return NextResponse.json(
        { message: "User created successfully", user: userWithoutPassword },
        { status: 201 },
      );
    } catch (e) {
      // RA-1800 — P2002 from the user.create inside the transaction means a
      // duplicate email slipped past the findUnique check (race condition).
      // Return 400 CONFLICT, not 500, so the client can surface a useful message.
      const eCode =
        (e as { code?: string; cause?: { code?: string } })?.code ??
        (e as { cause?: { code?: string } })?.cause?.code;
      if (eCode === "P2002") {
        return apiError(request, {
          code: "CONFLICT",
          message: "User with this email already exists",
          status: 400,
        });
      }
      // RA-1305 — the previous fallback created a User-only row (no
      // Organization, no organizationId) and returned 201 with warning
      // text. That left an ADMIN user orphaned from any org, which
      // NPEs downstream code that assumes `user.organization.members`
      // etc. Worse: the user record would require manual DB cleanup
      // before they could re-register (P2002 on email).
      // Correct behaviour: the transaction failed → nothing was
      // committed → return 500 and let the client retry. No orphan.
      console.error(
        "[Register] Organisation setup failed — returning 500, no orphan user created:",
        e instanceof Error ? e.message : String(e),
      );
      return NextResponse.json(
        {
          error: "Registration failed — please try again.",
          detail:
            "Organisation setup transaction aborted; no partial user was created.",
        },
        { status: 500 },
      );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const stack = error instanceof Error ? error.stack : undefined;
    console.error(
      "[Register] Registration error:",
      message,
      stack ?? String(error),
    );
    // RA-1800 — check both error.code and error.cause.code; Prisma wraps
    // transaction P2002s differently depending on context.
    const prismaError = error as { code?: string; cause?: { code?: string } };
    const p2002 =
      prismaError?.code === "P2002" || prismaError?.cause?.code === "P2002";
    if (p2002) {
      return apiError(request, {
        code: "CONFLICT",
        message: "User with this email already exists",
        status: 400,
      });
    }
    return apiError(request, {
      code: "INTERNAL",
      message: "Registration failed. Please try again.",
      status: 500,
      err: error,
      stage: "register",
    });
  }
}
