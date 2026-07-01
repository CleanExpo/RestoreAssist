/**
 * POST /api/inspections/[id]/group-readings
 * PATCH /api/inspections/[id]/group-readings
 *
 * RA-1196 — AI auto-grouping of moisture readings into affected areas.
 *
 * POST: uses Claude Haiku to cluster this inspection's moisture readings
 *       into affected-area groups (fuzzy name match, e.g.
 *       "Master Bed wall" + "Master Bedroom floor" -> same group).
 *       Returns a preview payload. Writes NOTHING — user approves in UI.
 *
 * PATCH: bulk-applies reviewed groups to MoistureReading.affectedArea.
 *
 * Rules:
 *  - getServerSession required (CLAUDE.md rule 1)
 *  - Subscription gate allowlist: TRIAL / ACTIVE / LIFETIME (rule 8)
 *  - Rate limit: 10/min/user (ticket)
 *  - Anthropic key via getAnthropicApiKey(userId) — no env fallback
 *  - IICRC S500:2021 §6 (structural drying chambers) cited in prompt
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { groupReadings } from "@/lib/services/ai/group-readings";
import { apiError, fromException } from "@/lib/api-errors";

const ALLOWED_SUBSCRIPTION_STATUSES = ["TRIAL", "ACTIVE", "LIFETIME"];

type GroupResponse = {
  groups: Array<{
    name: string;
    locations: string[];
    readingIds: string[];
    averageMoisture: number;
    elevatedCount: number;
  }>;
  unsortedReadingIds: string[];
};

// Moisture %MC threshold above which a reading is "elevated" for summary badge.
// 16%MC aligns with IICRC S500:2021 drying-goal guidance for gypsum/timber.
const ELEVATED_THRESHOLD = 16;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
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
      windowMs: 60 * 1000,
      maxRequests: 10,
      prefix: "group-readings",
      key: userId,
    });
    if (rateLimited) return rateLimited;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionStatus: true },
    });
    if (
      !user ||
      !ALLOWED_SUBSCRIPTION_STATUSES.includes(user.subscriptionStatus ?? "")
    ) {
      return apiError(request, {
        code: "PAYMENT_REQUIRED",
        message: "Active subscription required",
        status: 402,
      });
    }

    const { id: inspectionId } = await context.params;

    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, userId },
      select: { id: true },
    });
    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    const readings = await prisma.moistureReading.findMany({
      where: { inspectionId },
      select: {
        id: true,
        location: true,
        surfaceType: true,
        moistureLevel: true,
        depth: true,
      },
      orderBy: { recordedAt: "asc" },
      take: 500,
    });

    if (readings.length === 0) {
      return NextResponse.json({
        groups: [],
        unsortedReadingIds: [],
      } satisfies GroupResponse);
    }

    // Short-circuit trivially small sets — one group, no AI call needed.
    if (readings.length === 1) {
      const r = readings[0];
      return NextResponse.json({
        groups: [
          {
            name: r.location,
            locations: [r.location],
            readingIds: [r.id],
            averageMoisture: parseFloat(r.moistureLevel.toFixed(2)),
            elevatedCount: r.moistureLevel >= ELEVATED_THRESHOLD ? 1 : 0,
          },
        ],
        unsortedReadingIds: [],
      } satisfies GroupResponse);
    }

    const result = await groupReadings({
      userId,
      payload: { readings },
    });

    if (!result.ok) {
      console.error("[InspectionsGroupReadings]", {
        inspectionId,
        userId,
        reason: result.reason,
        detail: result.detail,
      });
      const status =
        result.reason === "KEY_MISSING"
          ? 402
          : result.reason === "RATE_LIMITED"
            ? 429
            : result.reason === "MODEL_OVERLOADED"
              ? 503
              : result.reason === "PARSE_FAILED"
                ? 502
                : 500;
      const headers: Record<string, string> =
        result.retryAfterMs != null
          ? { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) }
          : {};
      return NextResponse.json(
        { error: result.reason },
        { status, headers },
      );
    }

    return NextResponse.json(result.data satisfies GroupResponse);
  } catch (error) {
    return fromException(request, error, { stage: "group-readings-post" });
  }
}

/**
 * PATCH — apply user-approved groups to MoistureReading.affectedArea.
 *
 * Body: {
 *   assignments: Array<{ name: string; readingIds: string[] }>,
 *   clearUnlisted?: boolean  // default false
 * }
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
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
      windowMs: 60 * 1000,
      maxRequests: 10,
      prefix: "group-readings-patch",
      key: userId,
    });
    if (rateLimited) return rateLimited;

    const { id: inspectionId } = await context.params;

    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, userId },
      select: { id: true },
    });
    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    let body: {
      assignments?: Array<{ name?: string; readingIds?: string[] }>;
      clearUnlisted?: boolean;
    };
    try {
      body = await request.json();
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }

    const assignments = Array.isArray(body.assignments) ? body.assignments : [];
    if (assignments.length === 0) {
      return apiError(request, {
        code: "VALIDATION",
        message: "assignments array is required",
        status: 400,
      });
    }

    const touchedIds = new Set<string>();
    type Op = { name: string; ids: string[] };
    const ops: Op[] = [];
    for (const a of assignments) {
      const name =
        typeof a.name === "string" ? a.name.trim().slice(0, 200) : "";
      const ids = Array.isArray(a.readingIds)
        ? a.readingIds.filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          )
        : [];
      if (!name || ids.length === 0) continue;
      ids.forEach((id) => touchedIds.add(id));
      ops.push({ name, ids });
    }

    // updateMany with inspectionId guard prevents cross-inspection IDOR.
    const result = await prisma.$transaction(async (tx) => {
      let updated = 0;
      for (const op of ops) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = await (tx.moistureReading.updateMany as any)({
          where: { id: { in: op.ids }, inspectionId },
          data: { affectedArea: op.name },
        });
        updated += r.count;
      }
      let cleared = 0;
      if (body.clearUnlisted) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = await (tx.moistureReading.updateMany as any)({
          where: {
            inspectionId,
            id: { notIn: Array.from(touchedIds) },
            NOT: { affectedArea: null },
          },
          data: { affectedArea: null },
        });
        cleared = r.count;
      }
      return { updated, cleared };
    });

    await prisma.auditLog
      .create({
        data: {
          inspectionId,
          action: "Moisture readings grouped",
          entityType: "MoistureReading",
          entityId: inspectionId,
          userId,
          changes: JSON.stringify({
            groupCount: ops.length,
            updated: result.updated,
            cleared: result.cleared,
          }),
        },
      })
      .catch((e) => console.warn("[group-readings] audit failed:", e));

    return NextResponse.json({
      updated: result.updated,
      cleared: result.cleared,
      groupCount: ops.length,
    });
  } catch (error) {
    return fromException(request, error, { stage: "group-readings-patch" });
  }
}
