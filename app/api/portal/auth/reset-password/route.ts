import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { signClientPortalJwt } from "@/lib/portal/client-jwt";
import {
  generateResetCode,
  storeClientResetCode,
  verifyClientResetCode,
} from "@/lib/password-reset-store";
import { sendPasswordResetEmail } from "@/lib/email";
import { sanitizeString } from "@/lib/sanitize";
import { validateCsrf } from "@/lib/csrf";
import { rejectIfBreached } from "@/lib/auth/password-breach";

const MIN_PASSWORD_LENGTH = 12;

/**
 * POST /api/portal/auth/reset-password — two-step homeowner password reset.
 *
 * Step 1 (request): { email } → generic success response; sends a code when
 * the account exists.
 * Step 2 (reset): { email, code, password, confirmPassword } → { token }
 */
export async function POST(request: NextRequest) {
  try {
    const csrfError = validateCsrf(request);
    if (csrfError) return csrfError;

    const rateLimited = await applyRateLimit(request, {
      maxRequests: 5,
      windowMs: 15 * 60 * 1000,
      prefix: "portal-auth-reset",
      failClosedOnUpstashError: true,
    });
    if (rateLimited) return rateLimited;

    const body = await request.json().catch(() => null);
    const email = sanitizeString(body?.email, 320).toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const emailLimited = await applyRateLimit(request, {
      maxRequests: 5,
      windowMs: 60 * 60 * 1000,
      prefix: "portal-auth-reset:email",
      key: email,
      failClosedOnUpstashError: true,
    });
    if (emailLimited) return emailLimited;

    const clientUser = await prisma.clientUser.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, clientId: true },
    });
    const code = sanitizeString(body?.code, 10);
    const password = typeof body?.password === "string" ? body.password : "";
    const confirmPassword =
      typeof body?.confirmPassword === "string" ? body.confirmPassword : "";

    // Always return the same response for the request step so the endpoint
    // cannot be used to enumerate homeowner accounts.
    if (!code && !password && !confirmPassword) {
      if (clientUser) {
        const resetCode = generateResetCode();
        await storeClientResetCode(clientUser.id, email, resetCode);
        await sendPasswordResetEmail({
          recipientEmail: email,
          recipientName: clientUser.name || email.split("@")[0],
          resetCode,
        });
      }
      return NextResponse.json({
        success: true,
        message:
          "If an account exists with this email, a verification code has been sent.",
      });
    }

    if (!clientUser || !code) {
      return NextResponse.json(
        { error: "Invalid or expired verification code." },
        { status: 400 },
      );
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        {
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
        },
        { status: 400 },
      );
    }
    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: "Passwords do not match" },
        { status: 400 },
      );
    }

    const breachMessage = await rejectIfBreached(password);
    if (breachMessage) {
      return NextResponse.json({ error: breachMessage }, { status: 400 });
    }

    const codeResult = await verifyClientResetCode(clientUser.id, email, code);
    if (!codeResult.valid) {
      return NextResponse.json(
        { error: codeResult.error ?? "Invalid or expired verification code." },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.clientUser.update({
      where: { id: clientUser.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        lastLoginAt: new Date(),
      },
    });

    // Sign the homeowner straight in after a successful reset.
    const token = await signClientPortalJwt({
      clientUserId: clientUser.id,
      clientId: clientUser.clientId,
      email: clientUser.email,
      name: clientUser.name,
    });

    return NextResponse.json({ token });
  } catch (error) {
    console.error("Portal password reset error:", error);
    return NextResponse.json(
      { error: "Failed to reset password" },
      { status: 500 },
    );
  }
}
