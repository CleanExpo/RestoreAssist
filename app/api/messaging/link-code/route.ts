/**
 * Text the Job In (S1) — issue a one-time code that links a chat account.
 *
 * POST /api/messaging/link-code -> { data: { code, expiresAt } }
 *
 * The technician texts "link CODE" to the RestoreAssist bot within 10 minutes.
 * No settings UI in S1.
 *
 * DARK BY DEFAULT: 404 unless TEXT_JOB_IN_ENABLED === "true".
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiError, fromException } from "@/lib/api-errors";
import { applyRateLimit } from "@/lib/rate-limiter";
import { issueLinkCode } from "@/lib/messaging/link-codes";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (process.env.TEXT_JOB_IN_ENABLED !== "true") {
    return apiError(req, { code: "NOT_FOUND", message: "Not found", status: 404 });
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(req, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  const limited = await applyRateLimit(req, {
    prefix: "messaging-link-code",
    key: userId,
    windowMs: 15 * 60 * 1000,
    maxRequests: 5,
  });
  if (limited) return limited;

  try {
    const { code, expiresAt } = await issueLinkCode(userId);
    return NextResponse.json({
      data: { code, expiresAt: expiresAt.toISOString() },
    });
  } catch (error) {
    return fromException(req, error, { stage: "messaging-link-code" });
  }
}
