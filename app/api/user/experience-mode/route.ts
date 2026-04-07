import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ExperienceMode } from "@prisma/client";

// GET — return the current user's experience mode
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { experienceMode: true },
  });

  return NextResponse.json({
    experienceMode: user?.experienceMode ?? "EXPERIENCED",
  });
}

// PATCH — update the current user's experience mode
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { experienceMode } = body as { experienceMode?: ExperienceMode };

  if (experienceMode !== "APPRENTICE" && experienceMode !== "EXPERIENCED") {
    return NextResponse.json(
      { error: "experienceMode must be APPRENTICE or EXPERIENCED" },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { experienceMode },
  });

  return NextResponse.json({ experienceMode });
}
