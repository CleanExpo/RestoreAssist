import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/releases/unseen — returns the latest release the user hasn't dismissed yet
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
}
