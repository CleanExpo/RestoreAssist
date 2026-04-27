import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

// POST /api/releases/[id]/seen — marks a release as seen for the current user
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Sign in required",
        status: 401,
      });
    }

    const { id } = await params;

    await prisma.userReleaseSeen.upsert({
      where: { userId_releaseId: { userId: session.user.id, releaseId: id } },
      create: { userId: session.user.id, releaseId: id },
      update: {},
    });

    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return fromException(request, error, { stage: "release-seen" });
  }
}
