import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAdminFromDb } from "@/lib/admin-auth";
import { z } from "zod";
import { apiError, fromException } from "@/lib/api-errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Validation schema for PATCH
// ---------------------------------------------------------------------------

const patchTicketSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  category: z
    .enum(["general", "billing", "technical", "feature_request", "bug"])
    .optional(),
});

// ---------------------------------------------------------------------------
// GET /api/support/tickets/[id] — admin only
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;

    const { id } = await context.params;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
        // RA-6936 — replies emailed to the requester, oldest first.
        replies: {
          orderBy: { createdAt: "asc" },
          take: 100,
        },
      },
    });

    if (!ticket) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Ticket not found",
        status: 404,
      });
    }

    return NextResponse.json({ ticket });
  } catch (error) {
    return fromException(request, error, { stage: "get" });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/support/tickets/[id] — admin only
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    const auth = await verifyAdminFromDb(session);
    if (auth.response) return auth.response;

    const { id } = await context.params;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }
    const parsed = patchTicketSchema.safeParse(rawBody);

    if (!parsed.success) {
      // RA-1548 — left raw: rich 422 with `issues` array sibling (zod details).
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.issues },
        { status: 422 },
      );
    }

    const { status, priority, category } = parsed.data;

    // Nothing to update
    if (!status && !priority && !category) {
      return apiError(request, {
        code: "VALIDATION",
        message: "No updatable fields provided",
        status: 400,
      });
    }

    const resolvedAt =
      status === "resolved"
        ? new Date()
        : status === "open" || status === "in_progress"
          ? null
          : undefined;

    const ticket = await prisma.supportTicket.update({
      where: { id },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(resolvedAt !== undefined ? { resolvedAt } : {}),
      },
    });

    return NextResponse.json({ ticket });
  } catch (error) {
    // fromException maps Prisma P2025 (record-to-update not found) -> 404.
    return fromException(request, error, { stage: "patch" });
  }
}
