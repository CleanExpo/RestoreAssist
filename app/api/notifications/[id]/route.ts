import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

const TYPE_MAP: Record<string, string> = {
  INFO: "info",
  SUCCESS: "success",
  WARNING: "warning",
  ERROR: "error",
};

export async function GET(
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

    const { id } = await params;

    // Handle static welcome notification
    if (id === "welcome") {
      return NextResponse.json({
        id: "welcome",
        title: "Welcome to RestoreAssist",
        message:
          "Get started by creating your first report or configuring your cost libraries.",
        type: "info",
        read: false,
        createdAt: new Date().toISOString(),
      });
    }

    try {
      const notification = await prisma.notification.findFirst({
        where: {
          id,
          userId: session.user.id,
        },
      });

      if (!notification) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Notification not found",
          status: 404,
        });
      }

      return NextResponse.json({
        ...notification,
        type: TYPE_MAP[notification.type] || "info",
      });
    } catch (err) {
      return apiError(request, {
        code: "UPSTREAM_FAILED",
        message: "Notifications not available",
        status: 503,
        err,
        stage: "load",
      });
    }
  } catch (err) {
    return fromException(request, err, { stage: "load" });
  }
}

export async function DELETE(
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

    const { id } = await params;

    // Handle static welcome notification
    if (id === "welcome") {
      return NextResponse.json({ success: true });
    }

    try {
      const result = await prisma.notification.deleteMany({
        where: { id, userId: session.user.id },
      });

      if (result.count === 0) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Notification not found",
          status: 404,
        });
      }

      return NextResponse.json({ success: true });
    } catch {
      return NextResponse.json({ success: true });
    }
  } catch (err) {
    return fromException(request, err, { stage: "delete" });
  }
}
