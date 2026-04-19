import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { withIdempotency } from "@/lib/idempotency";

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        body = (rawBody ? JSON.parse(rawBody) : {}) as CreateSessionBody;
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 },
        );
      }

      // Validate required fields
      if (!body.inspectionId) {
        return NextResponse.json(
          { error: "inspectionId is required" },
          { status: 400 },
        );
      }

      const validJurisdictions = ["AU", "NZ"] as const;
      if (!validJurisdictions.includes(body.jurisdiction)) {
        return NextResponse.json(
          { error: "jurisdiction must be AU or NZ" },
          { status: 400 },
        );
      }

      const validDeviceOs = ["ios", "android", "web"] as const;
      if (!validDeviceOs.includes(body.deviceOs)) {
        return NextResponse.json(
          { error: "deviceOs must be ios, android, or web" },
          { status: 400 },
        );
      }

      // Verify inspection belongs to user (Rule 4: explicit select + ownership check)
      const inspection = await prisma.inspection.findFirst({
        where: {
          id: body.inspectionId,
          userId: userId,
        },
        select: { id: true },
      });

      if (!inspection) {
        return NextResponse.json(
          { error: "Inspection not found" },
          { status: 404 },
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
        },
        select: { id: true },
      });

      return NextResponse.json(
        { data: { sessionId: liveSession.id } },
        { status: 201 },
      );
    } catch (error) {
      console.error("[live-teacher/session POST]", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  });
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    console.error("[live-teacher/session GET]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
