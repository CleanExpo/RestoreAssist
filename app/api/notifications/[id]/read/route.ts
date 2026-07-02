import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

export async function POST(
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

      const updated = await prisma.notification.update({
        where: { id, userId: session.user.id },
        data: { read: true },
      });

      return NextResponse.json({ notification: updated });
    } catch {
      return NextResponse.json({ success: true });
    }
  } catch (error) {
    return fromException(request, error, { stage: "mark-read" });
  }
}
