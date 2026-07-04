import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { applyRateLimit } from "@/lib/rate-limiter";
import { validateCsrf } from "@/lib/csrf";
import { logSecurityEvent, extractRequestContext } from "@/lib/security-audit";
import { rejectIfBreached } from "@/lib/auth/password-breach";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

export async function POST(request: NextRequest) {
  // CSRF validation (outside wrapper — returns early without consuming body)
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  // Rate limit: 5 attempts per 15 minutes per user. Keyed on session.user.id
  // (CLAUDE.md rule 8) so rotating source IPs can't multiply the per-user
  // attempt budget.
  const rateLimited = await applyRateLimit(request, {
    maxRequests: 5,
    prefix: "change-password",
    key: userId,
    failClosedOnUpstashError: true, // RA-6940 — fail closed on limiter-store outage
  });
  if (rateLimited) return rateLimited;

  // RA-1266: retry replays the bcrypt hash + update — expensive, and
  // the cached response saves the ~250ms hash cost on idempotent retry.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let parsedBody: { currentPassword?: string; newPassword?: string };
      try {
        parsedBody = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const { currentPassword, newPassword } = parsedBody;

      if (!currentPassword || !newPassword) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Current password and new password are required",
          status: 400,
        });
      }

      // RA-1342 — aligned to registration min (12). Matches reset-password +
      // registration so the policy can't be bypassed by setting a weak
      // password via change-password after registering strong.
      if (newPassword.length < 12) {
        return apiError(request, {
          code: "VALIDATION",
          message: "New password must be at least 12 characters long",
          status: 400,
        });
      }

      // RA-1591 — HIBP breach check before accepting the new password.
      const breachMsg = await rejectIfBreached(newPassword);
      if (breachMsg) {
        return apiError(request, {
          code: "VALIDATION",
          message: breachMsg,
          status: 400,
        });
      }

      // Get user with password
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { password: true, mustChangePassword: true },
      });

      if (!user || !user.password) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Password not set. Please contact support.",
          status: 400,
        });
      }

      // Verify current password (works for both regular and forced password change)
      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        user.password,
      );

      if (!isCurrentPasswordValid) {
        const reqCtx = extractRequestContext(request);
        logSecurityEvent({
          eventType: "LOGIN_FAILED",
          severity: "WARNING",
          userId,
          email: session.user.email ?? undefined,
          ...reqCtx,
          details: {
            reason: "incorrect_current_password",
            context: "change_password",
          },
        }).catch(() => {});
        return apiError(request, {
          code: "VALIDATION",
          message: "Current password is incorrect",
          status: 400,
        });
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 12);

      // Update password and clear mustChangePassword flag
      await prisma.user.update({
        where: { id: userId },
        data: {
          password: hashedNewPassword,
          mustChangePassword: false,
        },
      });

      const reqCtx = extractRequestContext(request);
      logSecurityEvent({
        eventType: "PASSWORD_CHANGED",
        userId,
        email: session.user.email ?? undefined,
        ...reqCtx,
      }).catch((err) => {
        // RA-1311 — surface security-log write failures so operators can
        // spot a broken logger chain; still non-blocking for the caller.
        console.error("[change-password] security log failed:", err);
      });

      return NextResponse.json(
        { message: "Password changed successfully" },
        { status: 200 },
      );
    } catch (err) {
      return fromException(request, err, { stage: "update" });
    }
  });
}
