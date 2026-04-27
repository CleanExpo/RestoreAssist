import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { applyRateLimit, getClientIp } from "@/lib/rate-limiter";
import { sanitizeString } from "@/lib/sanitize";
import { validateCsrf } from "@/lib/csrf";
import { verifyResetCode } from "@/lib/password-reset-store";
import { logSecurityEvent, extractRequestContext } from "@/lib/security-audit";
import { verifyTurnstile } from "@/lib/turnstile";
import { rejectIfBreached } from "@/lib/auth/password-breach";

// RA-1342 — aligned to registration min (12). NIST SP 800-63B §5.1.1.2
// recommends 8 as an absolute floor, but registration enforces 12 —
// reset/change must match or the policy is trivially bypassed by setting
// a weak password via reset after registering with a strong one.
const MIN_PASSWORD_LENGTH = 12;

// POST - Reset password with verification code
export async function POST(request: NextRequest) {
  try {
    // CSRF validation
    const csrfError = validateCsrf(request);
    if (csrfError) return csrfError;

    // Rate limit: 5 attempts per 15 minutes per IP
    const ipLimited = await applyRateLimit(request, {
      maxRequests: 5,
      prefix: "reset-password",
    });
    if (ipLimited) return ipLimited;

    const body = await request.json();
    const email = sanitizeString(body.email, 320).toLowerCase();
    const newPassword = body.newPassword;
    const code = sanitizeString(body.code, 10);
    const turnstileToken =
      typeof body.turnstileToken === "string" ? body.turnstileToken : null;

    if (!email || !newPassword || !code) {
      return NextResponse.json(
        { error: "Email, verification code, and new password are required" },
        { status: 400 },
      );
    }

    // RA-1286: CAPTCHA gate. Soft-allow when TURNSTILE_SECRET_KEY unset.
    const captcha = await verifyTurnstile(turnstileToken, getClientIp(request));
    if (!captcha.ok) {
      return NextResponse.json({ error: captcha.reason }, { status: 400 });
    }

    // RA-1341: second limit per target email so IP rotation can't grind
    // through code guesses for a specific account.
    const emailLimited = await applyRateLimit(request, {
      maxRequests: 10,
      windowMs: 60 * 60 * 1000,
      prefix: "reset-password:email",
      key: email,
    });
    if (emailLimited) return emailLimited;

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        {
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        },
        { status: 400 },
      );
    }

    // RA-1591 — HIBP breach check. Rejects known-compromised passwords
    // before they become the user's new credential. Fail-open on network
    // / HIBP outage.
    const breachMsg = await rejectIfBreached(newPassword);
    if (breachMsg) {
      return NextResponse.json({ error: breachMsg }, { status: 400 });
    }

    // Verify the reset code
    const codeResult = await verifyResetCode(email, code);
    if (!codeResult.valid) {
      return NextResponse.json({ error: codeResult.error }, { status: 400 });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update user password
    await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        mustChangePassword: false,
      },
    });

    const reqCtx = extractRequestContext(request);
    logSecurityEvent({
      eventType: "PASSWORD_RESET_COMPLETED",
      userId: user.id,
      email,
      ...reqCtx,
    }).catch((err) => {
      // RA-1311 — log audit-write failure so operators see it; still
      // non-blocking so the user's reset completes regardless.
      console.error(
        "[reset-password] PASSWORD_RESET_COMPLETED audit log failed:",
        err,
      );
    });

    return NextResponse.json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error: any) {
    console.error("Error resetting password:", error);
    return NextResponse.json(
      { error: "An error occurred. Please try again." },
      { status: 500 },
    );
  }
}
