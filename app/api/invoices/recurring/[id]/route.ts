import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

const MUTABLE_STATUSES = ["ACTIVE", "PAUSED", "CANCELLED"] as const;
type MutableStatus = (typeof MUTABLE_STATUSES)[number];

function isMutableStatus(value: unknown): value is MutableStatus {
  return (
    typeof value === "string" &&
    (MUTABLE_STATUSES as readonly string[]).includes(value)
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

    const body = (await request.json().catch(() => null)) as {
      status?: unknown;
    } | null;
    if (!body || !isMutableStatus(body.status)) {
      return apiError(request, {
        code: "VALIDATION",
        message: `status must be one of ${MUTABLE_STATUSES.join(", ")}`,
        status: 400,
      });
    }

    const { id } = await params;
    const pausedAt = body.status === "PAUSED" ? new Date() : null;
    const updated = await prisma.recurringInvoice.updateMany({
      where: { id, userId: session.user.id },
      data: { status: body.status, pausedAt },
    });

    if (updated.count === 0) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Recurring invoice not found",
        status: 404,
      });
    }

    const recurringInvoice = await prisma.recurringInvoice.findFirst({
      where: { id, userId: session.user.id },
      select: {
        id: true,
        status: true,
        pausedAt: true,
        updatedAt: true,
      },
    });

    if (!recurringInvoice) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Recurring invoice not found",
        status: 404,
      });
    }

    return NextResponse.json({ recurringInvoice });
  } catch (error) {
    return fromException(request, error, { stage: "update-recurring" });
  }
}
