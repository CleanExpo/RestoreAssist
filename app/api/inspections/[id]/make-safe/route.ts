import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";

// RA-1136a: Make-Safe compliance gate
// ICA Code of Practice §3.1 · AS/NZS 1170.0 · WHS Regulations 2011

export const MAKE_SAFE_ACTIONS = [
  "power_isolated",
  "gas_isolated",
  "mould_containment",
  "water_stopped",
  "occupant_briefing",
] as const;

export type MakeSafeActionName = (typeof MAKE_SAFE_ACTIONS)[number];

type RouteContext = { params: Promise<{ id: string }> };

// ── Auth + ownership guard ─────────────────────────────────────────────────

async function authorise(request: NextRequest, inspectionId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const rateLimited = await applyRateLimit(request, {
    windowMs: 60_000,
    maxRequests: 30,
    prefix: "make-safe",
    key: session.user.id,
  });
  if (rateLimited) return { error: rateLimited };

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, userId: session.user.id },
    select: { id: true },
  });
  if (!inspection) {
    return {
      error: NextResponse.json(
        { error: "Inspection not found" },
        { status: 404 },
      ),
    };
  }

  return { userId: session.user.id };
}

// ── GET — list all MakeSafeAction rows for this inspection ─────────────────

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const auth = await authorise(request, id);
    if (auth.error) return auth.error;

    const actions = await prisma.makeSafeAction.findMany({
      where: { inspectionId: id },
      orderBy: { action: "asc" },
      take: 10,
      select: {
        id: true,
        action: true,
        applicable: true,
        completed: true,
        completedAt: true,
        completedByUserId: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ data: actions });
  } catch (err) {
    console.error("[make-safe GET]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ── POST — upsert a single MakeSafeAction ─────────────────────────────────

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const auth = await authorise(request, id);
    if (auth.error) return auth.error;

    const body = await request.json();
    const { action, applicable, completed, notes } = body as {
      action: string;
      applicable?: boolean;
      completed?: boolean;
      notes?: string;
    };

    if (!action || !(MAKE_SAFE_ACTIONS as readonly string[]).includes(action)) {
      return NextResponse.json(
        {
          error: `Invalid action. Must be one of: ${MAKE_SAFE_ACTIONS.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Read existing row to detect completed transition
    const existing = await prisma.makeSafeAction.findUnique({
      where: { inspectionId_action: { inspectionId: id, action } },
      select: { completed: true },
    });

    const wasCompleted = existing?.completed ?? false;
    const nowCompleted = completed ?? wasCompleted;
    const transitioningToCompleted = !wasCompleted && nowCompleted;

    const result = await prisma.makeSafeAction.upsert({
      where: { inspectionId_action: { inspectionId: id, action } },
      create: {
        inspectionId: id,
        action,
        applicable: applicable ?? true,
        completed: nowCompleted,
        completedAt: nowCompleted ? new Date() : null,
        completedByUserId: nowCompleted ? auth.userId : null,
        notes: notes ?? null,
      },
      update: {
        ...(applicable !== undefined && { applicable }),
        ...(completed !== undefined && {
          completed,
          ...(transitioningToCompleted && {
            completedAt: new Date(),
            completedByUserId: auth.userId,
          }),
        }),
        ...(notes !== undefined && { notes }),
      },
      select: {
        id: true,
        action: true,
        applicable: true,
        completed: true,
        completedAt: true,
        notes: true,
      },
    });

    return NextResponse.json({ data: result }, { status: 200 });
  } catch (err) {
    console.error("[make-safe POST]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ── PATCH — batch-update multiple MakeSafeAction rows ────────────────────

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const auth = await authorise(request, id);
    if (auth.error) return auth.error;

    const body = await request.json();
    const { actions } = body as {
      actions: Array<{
        action: string;
        applicable?: boolean;
        completed?: boolean;
        notes?: string;
      }>;
    };

    if (!Array.isArray(actions) || actions.length === 0) {
      return NextResponse.json(
        { error: "Body must include a non-empty actions array" },
        { status: 400 },
      );
    }

    // Validate all action names up-front before any DB writes
    const invalid = actions.filter(
      (a) => !(MAKE_SAFE_ACTIONS as readonly string[]).includes(a.action),
    );
    if (invalid.length > 0) {
      return NextResponse.json(
        {
          error: `Invalid action names: ${invalid.map((a) => a.action).join(", ")}. Must be one of: ${MAKE_SAFE_ACTIONS.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Load existing rows to detect completed transitions
    const existing = await prisma.makeSafeAction.findMany({
      where: { inspectionId: id, action: { in: actions.map((a) => a.action) } },
      select: { action: true, completed: true },
      take: 10,
    });
    const existingMap = new Map(existing.map((r) => [r.action, r.completed]));

    const results = await Promise.all(
      actions.map((item) => {
        const wasCompleted = existingMap.get(item.action) ?? false;
        const nowCompleted = item.completed ?? wasCompleted;
        const transitioningToCompleted = !wasCompleted && nowCompleted;

        return prisma.makeSafeAction.upsert({
          where: {
            inspectionId_action: { inspectionId: id, action: item.action },
          },
          create: {
            inspectionId: id,
            action: item.action,
            applicable: item.applicable ?? true,
            completed: nowCompleted,
            completedAt: nowCompleted ? new Date() : null,
            completedByUserId: nowCompleted ? auth.userId : null,
            notes: item.notes ?? null,
          },
          update: {
            ...(item.applicable !== undefined && {
              applicable: item.applicable,
            }),
            ...(item.completed !== undefined && {
              completed: item.completed,
              ...(transitioningToCompleted && {
                completedAt: new Date(),
                completedByUserId: auth.userId,
              }),
            }),
            ...(item.notes !== undefined && { notes: item.notes }),
          },
          select: {
            id: true,
            action: true,
            applicable: true,
            completed: true,
            completedAt: true,
            notes: true,
          },
        });
      }),
    );

    return NextResponse.json({ data: results });
  } catch (err) {
    console.error("[make-safe PATCH]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
