import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/auth/get-api-session";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
import { RELEASE_NOTES_NOT_READY } from "@/lib/releases/release-state";

// GET /api/releases/unseen — returns the latest release the user hasn't dismissed yet
export async function GET(request: NextRequest) {
  try {
    const session = await getApiSession(request);
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
        // RA-8607: never show a release whose notes are still being written
        // or whose notes job failed.
        notes: { notIn: [...RELEASE_NOTES_NOT_READY] },
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
