/**
 * RA-8596 — admin read surface over CancellationFeedback.
 *
 * app/api/cancel-subscription/route.ts writes a CancellationFeedback row
 * (reason, comment, plan at cancel, tenure) whenever an owner cancels with
 * a reason (RA-1243). Until this route, nothing read that table, so the
 * churn signal was collected and never seen.
 *
 * Returns:
 *   - items: recent feedback, newest first, cursor-paged (default 20, cap 50)
 *   - reasonCounts90d: count per reason over the last 90 days
 *
 * Platform-staff only, like business-metrics: every self-registered owner
 * is an ADMIN, so the ADMIN check alone would let any firm read other
 * firms' cancel comments. PLATFORM_SUPPORT_USER_IDS is the staff allowlist.
 *
 * The comment is returned as stored text. The page renders it as a React
 * text node, never as HTML.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  verifyAdminFromDb,
  verifyPlatformSupportOperator,
} from "@/lib/admin-auth";
import { fromException } from "@/lib/api-errors";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const REASON_WINDOW_DAYS = 90;

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;
    const operator = verifyPlatformSupportOperator(auth);
    if (operator.response) return operator.response;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(
        1,
        parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) ||
          DEFAULT_LIMIT,
      ),
    );
    const cursor = searchParams.get("cursor") || null;

    const since = new Date(
      Date.now() - REASON_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const [rows, reasonGroups] = await Promise.all([
      prisma.cancellationFeedback.findMany({
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          createdAt: true,
          reason: true,
          comment: true,
          subscriptionPlan: true,
          tenureDays: true,
        },
      }),
      prisma.cancellationFeedback.groupBy({
        by: ["reason"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    const reasonCounts90d: Record<string, number> = {};
    for (const group of reasonGroups) {
      reasonCounts90d[group.reason] = group._count._all;
    }

    return NextResponse.json({
      items,
      nextCursor,
      limit,
      reasonCounts90d,
      reasonWindowSince: since.toISOString(),
    });
  } catch (err) {
    return fromException(request, err, {
      stage: "admin/cancellation-feedback:list",
    });
  }
}
