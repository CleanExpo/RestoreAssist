import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

// GET /api/releases/unseen — returns the latest release the user hasn't dismissed yet
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Sign in required",
        status: 401,
      });
    }

    const latest = await prisma.appRelease.findFirst({
      orderBy: { createdAt: "desc" },
      where: {
        seenBy: {
          none: { userId: session.user.id },
        },
      },
      select: {
        id: true,
        version: true,
        title: true,
        notes: true,
        mergedAt: true,
      },
    });

    return NextResponse.json({ data: latest ?? null });
  } catch (error) {
    return fromException(request, error, { stage: "releases-unseen" });
  }
}
