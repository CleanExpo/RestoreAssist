import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { generateResetCode, storeResetCode } from "@/lib/password-reset-store";
import { sendPasswordResetEmail } from "@/lib/email";
import { sanitizeString } from "@/lib/sanitize";
import { validateCsrf } from "@/lib/csrf";
import { logSecurityEvent, extractRequestContext } from "@/lib/security-audit";
import { verifyBotId } from "@/lib/auth/botid";
import { apiError, fromException } from "@/lib/api-errors";
import { deliverEmailOnce } from "@/lib/email-delivery-ledger";

// POST - Send password reset verification code
export async function POST(request: NextRequest) {
  try {
    // CSRF validation
    const csrfError = validateCsrf(request);
    if (csrfError) return csrfError;

    // Rate limit: 3 attempts per 15 minutes per IP
    const ipLimited = await applyRateLimit(request, {
      maxRequests: 3,
      prefix: "forgot-password",
      failClosedOnUpstashError: true, // RA-6940 — fail closed on limiter-store outage
    });
    if (ipLimited) return ipLimited;

    const body = await request.json();
    const email = sanitizeString(body.email, 320).toLowerCase();

    if (!email) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Email is required",
        status: 400,
      });
    }

    // RA-1286: bot-detection gate. Vercel BotID auto-bypasses in dev/preview.
    const botCheck = await verifyBotId();
    if (!botCheck.ok) {
      return apiError(request, {
        code: "VALIDATION",
        message: botCheck.reason,
        status: 400,
      });
    }

    // RA-1341: also rate-limit per target email so IP rotation (residential
    // proxies) can't bypass the 3/IP cap to brute-force a single account.
    const emailLimited = await applyRateLimit(request, {
      maxRequests: 5,
      windowMs: 60 * 60 * 1000,
      prefix: "forgot-password:email",
      key: email,
      failClosedOnUpstashError: true, // RA-6940 — fail closed on limiter-store outage
    });
    if (emailLimited) return emailLimited;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, password: true },
    });

    // Always return success to prevent email enumeration
    // But only generate code if user exists and has a password (not Google-only user)
    if (user && user.password) {
      const code = generateResetCode();
      const resetVersion = await storeResetCode(email, code);

      const reqCtx = extractRequestContext(request);
      logSecurityEvent({
        eventType: "PASSWORD_RESET_REQUESTED",
        userId: user.id,
        email,
        ...reqCtx,
      }).catch((err) => {
        // RA-1311 — log audit-write failure so operators see it; still
        // non-blocking so the user flow continues.
        console.error(
          "[forgot-password] PASSWORD_RESET_REQUESTED audit log failed:",
          err,
        );
      });

      // Keep the external response generic, but record a durable outcome for
      // this exact reset-token version. An ambiguous provider result blocks an
      // automatic duplicate send and remains visible for reconciliation.
      const deliveryKey = `password-reset:${resetVersion.id}`;
      await deliverEmailOnce({
        idempotencyKey: deliveryKey,
        kind: "PASSWORD_RESET_CODE",
        recipient: email,
        payloadIdentity: `${resetVersion.id}|${resetVersion.expiresAt.toISOString()}`,
        send: () =>
          sendPasswordResetEmail({
            recipientEmail: email,
            recipientName: user.name || user.email.split("@")[0],
            resetCode: code,
            idempotencyKey: deliveryKey,
          }),
      }).catch((err) => {
        // Enumeration resistance requires the same public response whether the
        // account exists or delivery failed. The durable ledger carries truth.
        console.error("[Password Reset] Delivery was not confirmed:", err);
      });
    }

    // Always return the same response regardless of whether user exists
    return NextResponse.json({
      success: true,
      message:
        "If an account exists with this email, a verification code has been sent.",
    });
  } catch (error) {
    return fromException(request, error, { stage: "forgot-password" });
  }
}
