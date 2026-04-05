import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/releases/[id]/seen — marks a release as seen for the current user
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  await prisma.userReleaseSeen.upsert({
    where: { userId_releaseId: { userId: session.user.id, releaseId: id } },
    create: { userId: session.user.id, releaseId: id },
    update: {},
  });

  return NextResponse.json({ data: { ok: true } });
}
