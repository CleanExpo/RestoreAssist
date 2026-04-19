import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { applyRateLimit, getClientIp } from "@/lib/rate-limiter";
import { sanitizeString } from "@/lib/sanitize";
import { validateCsrf } from "@/lib/csrf";
import { sendWelcomeEmail } from "@/lib/email";
import { notifyWelcome } from "@/lib/notifications";
import { seedDemoDataForNewUser } from "@/lib/demo-data";
import { logSecurityEvent, extractRequestContext } from "@/lib/security-audit";
import { verifyTurnstile } from "@/lib/turnstile";
import { track } from "@/lib/analytics/track";

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
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }
    const name = sanitizeString(body.name, 200);
    const email = sanitizeString(body.email, 320);
    const { password, acceptedTerms, turnstileToken } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 },
      );
    }

    // RA-1286: CAPTCHA gate on the public signup endpoint. Soft-allows
    // when TURNSTILE_SECRET_KEY is unset (dev / staging).
    const captcha = await verifyTurnstile(
      typeof turnstileToken === "string" ? turnstileToken : null,
      getClientIp(request),
    );
    if (!captcha.ok) {
      return NextResponse.json({ error: captcha.reason }, { status: 400 });
    }

    // RA-1255: ToS + Privacy acceptance mandatory for new email signups.
    // Server-side re-check — don't trust just the client-side guard.
    if (acceptedTerms !== true) {
      return NextResponse.json(
        {
          error:
            "You must accept the Terms of Service and Privacy Policy to create an account",
        },
        { status: 400 },
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Please provide a valid email address" },
        { status: 400 },
      );
    }

    // RA-1258: raise floor to 12 chars per NIST SP 800-63B / OWASP 2024.
    if (typeof password !== "string" || password.length < 12) {
      return NextResponse.json(
        { error: "Password must be at least 12 characters" },
        { status: 400 },
      );
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
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 400 },
      );
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
      sendWelcomeEmail({
        recipientEmail: email,
        recipientName: name,
        loginUrl: `${APP_URL}/login`,
        trialDays: 30,
        trialCredits: 30,
      }).catch((err) => console.error("[Register] Welcome email failed:", err));
      notifyWelcome(user.id).catch((err) =>
        console.error("[Register] notifyWelcome failed:", err),
      );
      // RA-1239: seed demo data so trial users don't land on an empty dashboard
      seedDemoDataForNewUser(user.id).catch((err) =>
        console.error("[Register] seedDemoDataForNewUser failed:", err),
      );
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
          },
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
      sendWelcomeEmail({
        recipientEmail: email,
        recipientName: name,
        loginUrl: `${APP_URL}/login`,
        trialDays: 30,
        trialCredits: 30,
      }).catch((err) => console.error("[Register] Welcome email failed:", err));
      notifyWelcome(updatedUser.id).catch((err) =>
        console.error("[Register] notifyWelcome failed:", err),
      );
      // RA-1239: seed demo data so trial users don't land on an empty dashboard
      seedDemoDataForNewUser(updatedUser.id).catch((err) =>
        console.error("[Register] seedDemoDataForNewUser failed:", err),
      );
      const reqCtx = extractRequestContext(request);
      logSecurityEvent({
        eventType: "ACCOUNT_REGISTERED",
        userId: updatedUser.id,
        email: updatedUser.email,
        ...reqCtx,
        details: { role: "ADMIN", hasOrganization: true },
      }).catch(() => {});
      // RA-1246 — signup_completed (unconditional)
      track(updatedUser.id, "signup_completed", {
        hasOrganization: true,
      }).catch(() => {});
      const { password: _, ...userWithoutPassword } = updatedUser;
      return NextResponse.json(
        { message: "User created successfully", user: userWithoutPassword },
        { status: 201 },
      );
    } catch (e) {
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
    const prismaError = error as { code?: string };
    if (prismaError?.code === "P2002") {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Registration failed. Please try again." },
      { status: 500 },
    );
  }
}
