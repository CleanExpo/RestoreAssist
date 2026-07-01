/**
 * GET /api/integrations/xero/sync-status — RA-1112
 *
 * Surfaces the Xero sync lifecycle to the authenticated user. Rows carry
 * only user-safe fields (rule #7 — lastError was sanitised at write time
 * in `lib/integrations/xero/sync-status.ts`).
 *
 * Filters:
 *   ?state=queued|syncing|synced|failed|dead_letter
 *   ?entityType=invoice|credit_note|payment|contact|transition
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

const VALID_STATES = new Set([
  "queued",
  "syncing",
  "synced",
  "failed",
  "dead_letter",
]);
const VALID_ENTITY_TYPES = new Set([
  "invoice",
  "credit_note",
  "payment",
  "contact",
  "transition",
]);

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }

  // Subscription gate (rule #8) — sync-status is part of the paid integration
  // surface. Allow TRIAL / ACTIVE / LIFETIME.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { subscriptionStatus: true, lifetimeAccess: true },
  });
  const status = user?.subscriptionStatus;
  const isPaid =
    user?.lifetimeAccess === true || status === "TRIAL" || status === "ACTIVE";
  if (!isPaid) {
    return apiError(request, {
      code: "PAYMENT_REQUIRED",
      message: "Subscription required",
      status: 402,
    });
  }

  const { searchParams } = new URL(request.url);
  const state = searchParams.get("state");
  const entityType = searchParams.get("entityType");

  if (state && !VALID_STATES.has(state)) {
    return apiError(request, {
      code: "VALIDATION",
      message: "Invalid state",
      status: 400,
    });
  }
  if (entityType && !VALID_ENTITY_TYPES.has(entityType)) {
    return apiError(request, {
      code: "VALIDATION",
      message: "Invalid entityType",
      status: 400,
    });
  }

  try {
    const rows = await prisma.xeroSyncStatus.findMany({
      where: {
        userId: session.user.id,
        ...(state ? { state } : {}),
        ...(entityType ? { entityType } : {}),
      },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        xeroEntityId: true,
        state: true,
        attemptCount: true,
        lastAttemptAt: true,
        lastError: true,
        nextRetryAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 200, // rule #4 bounded take
    });

    return NextResponse.json({ data: rows });
  } catch (err) {
    // Rule #7 — no raw error.message in 500s (fromException emits a generic
    // "Internal server error" message; details go to reportError only).
    return fromException(request, err, { stage: "list" });
  }
}
