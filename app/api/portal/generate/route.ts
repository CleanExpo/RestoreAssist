import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generatePortalToken, portalTokenExpiresAt } from "@/lib/portal-token";
import { apiError, fromException } from "@/lib/api-errors";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const body = await request.json();
    const { inspectionId } = body as { inspectionId?: string };

    if (!inspectionId || typeof inspectionId !== "string") {
      return apiError(request, {
        code: "VALIDATION",
        message: "inspectionId is required",
        status: 400,
      });
    }

    // Verify the inspection belongs to the authenticated user
    const inspection = await prisma.inspection.findFirst({
      where: {
        id: inspectionId,
        userId: session.user.id,
      },
      select: { id: true },
    });

    if (!inspection) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Inspection not found",
        status: 404,
      });
    }

    const token = generatePortalToken(inspectionId);
    const expiresAt = portalTokenExpiresAt();

    const baseUrl =
      process.env.NEXTAUTH_URL?.replace(/\/$/, "") ??
      (request.headers.get("origin") || "http://localhost:3000");

    const portalUrl = `${baseUrl}/portal/${token}`;

    return NextResponse.json({ portalUrl, expiresAt });
  } catch (error) {
    console.error("Portal generate error:", error);
    return fromException(request, error, { stage: "portal/generate:post" });
  }
}
