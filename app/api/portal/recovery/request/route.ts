import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limiter";
import { requestPortalInvitationResend } from "@/lib/portal/request-invitation-resend";
import { GENERIC_INVITE_RESEND_MESSAGE } from "@/lib/portal/recovery-paths";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * POST /api/portal/recovery/request
 * Public client recovery — no contractor session. Rate-limited.
 * Response body never discloses whether the email matched an invitation.
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimited = await applyRateLimit(request, {
      maxRequests: 5,
      windowMs: 15 * 60 * 1000,
      prefix: "portal-recovery-request",
    });
    if (rateLimited) return rateLimited;

    const body = (await request.json().catch(() => ({}))) as { email?: unknown };
    const email = typeof body.email === "string" ? body.email : "";

    const result = await requestPortalInvitationResend(email);
    if (!result.ok) {
      return apiError(request, {
        code: "VALIDATION",
        message: result.detail ?? "Enter a valid email address",
        status: 400,
      });
    }

    return NextResponse.json({ message: GENERIC_INVITE_RESEND_MESSAGE });
  } catch (error) {
    console.error("Error requesting portal invitation resend:", error);
    return fromException(request, error, {
      stage: "portal/recovery/request:post",
    });
  }
}
