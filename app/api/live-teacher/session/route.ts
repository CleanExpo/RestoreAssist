import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";
import { normalizeClaimType } from "@/lib/evidence/claim-type";
import { validateSubmission } from "@/lib/evidence/submission-gate";

// POST — create a new LiveTeacherSession
// GET  — list current user's active sessions
// Rule 1: getServerSession required on every route
// Rule 10: rate-limit keyed on session.user.id

interface CreateSessionBody {
  inspectionId: string;
  jurisdiction: "AU" | "NZ";
  deviceOs: "ios" | "android" | "web";
  hadLidar?: boolean;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  const rateLimited = await applyRateLimit(request, {
    maxRequests: 30,
    windowMs: 60_000,
    key: userId,
    prefix: "live-teacher-session",
  });
  if (rateLimited) return rateLimited;

  // RA-1266: prevents duplicate LiveTeacherSession rows on retry.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: CreateSessionBody;
      try {
        const parsed = rawBody ? JSON.parse(rawBody) : {};
        body = (
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : {}
        ) as CreateSessionBody;
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }

      // Validate required fields
      if (!body.inspectionId) {
        return apiError(request, {
          code: "VALIDATION",
          message: "inspectionId is required",
          status: 400,
        });
      }

      const validJurisdictions = ["AU", "NZ"] as const;
      if (!validJurisdictions.includes(body.jurisdiction)) {
        return apiError(request, {
          code: "VALIDATION",
          message: "jurisdiction must be AU or NZ",
          status: 400,
        });
      }

      const validDeviceOs = ["ios", "android", "web"] as const;
      if (!validDeviceOs.includes(body.deviceOs)) {
        return apiError(request, {
          code: "VALIDATION",
          message: "deviceOs must be ios, android, or web",
          status: 400,
        });
      }

      // Verify inspection belongs to user (Rule 4: explicit select + ownership check)
      const inspection = await prisma.inspection.findFirst({
        where: {
          id: body.inspectionId,
          userId: userId,
        },
        select: { id: true, claimType: true },
      });

      if (!inspection) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Inspection not found",
          status: 404,
        });
      }

      // RA-7052: "before" completeness snapshot. Best-effort — session
      // creation must NEVER fail over a snapshot. When claimType doesn't
      // resolve to a known workflow, omit the field rather than store a
      // meaningless 100%.
      let startCompletionPct: number | undefined;
      try {
        const claimType = normalizeClaimType(inspection.claimType);
        if (claimType) {
          const validation = await validateSubmission(
            body.inspectionId,
            claimType,
          );
          startCompletionPct = validation.completionPercentage;
        }
      } catch (snapshotError) {
        console.error(
          "[live-teacher/session] start-completeness snapshot failed (non-blocking):",
          snapshotError,
        );
      }

      // Create session (Rule 4: explicit select on result)
      const liveSession = await prisma.liveTeacherSession.create({
        data: {
          inspectionId: body.inspectionId,
          userId: userId,
          jurisdiction: body.jurisdiction,
          deviceOs: body.deviceOs,
          hadLidar: body.hadLidar ?? false,
          ...(startCompletionPct !== undefined && { startCompletionPct }),
        },
        select: { id: true },
      });

      return NextResponse.json(
        { data: { sessionId: liveSession.id } },
        { status: 201 },
      );
    } catch (error) {
      return fromException(request, error, { stage: "session-create" });
    }
  });
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    // Rule 10: rate-limit
    const rateLimited = await applyRateLimit(request, {
      maxRequests: 30,
      windowMs: 60_000,
      key: session.user.id,
      prefix: "live-teacher-session",
    });
    if (rateLimited) return rateLimited;

    // Rule 4: explicit select + take limit
    const sessions = await prisma.liveTeacherSession.findMany({
      where: {
        userId: session.user.id,
        endedAt: null, // active only
      },
      select: {
        id: true,
        inspectionId: true,
        startedAt: true,
        jurisdiction: true,
        deviceOs: true,
        hadLidar: true,
      },
      orderBy: { startedAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ data: sessions });
  } catch (error) {
    return fromException(request, error, { stage: "session-list" });
  }
}
