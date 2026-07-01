import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";
type ExperienceMode = "APPRENTICE" | "EXPERIENCED";

// GET — return the current user's experience mode
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(undefined, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { experienceMode: true },
    });

    return NextResponse.json({
      experienceMode: user?.experienceMode ?? "APPRENTICE",
    });
  } catch (err) {
    return fromException(undefined, err, { stage: "experience-mode:get" });
  }
}

// PATCH — update the current user's experience mode
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const body = await request.json().catch(() => ({}));
    const { experienceMode } = body as { experienceMode?: ExperienceMode };

    if (experienceMode !== "APPRENTICE" && experienceMode !== "EXPERIENCED") {
      return apiError(request, {
        code: "VALIDATION",
        message: "experienceMode must be APPRENTICE or EXPERIENCED",
        status: 400,
      });
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { experienceMode },
    });

    return NextResponse.json({ experienceMode });
  } catch (err) {
    return fromException(request, err, { stage: "experience-mode:patch" });
  }
}
