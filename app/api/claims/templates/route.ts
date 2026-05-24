/**
 * API Route: Get Standard Templates
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user || !session.user.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const templateType = searchParams.get("templateType");
    const activeOnly = searchParams.get("activeOnly") === "true";

    const where: any = {
      OR: [
        { userId },
        { userId: null }, // System-wide templates
      ],
    };

    if (templateType) {
      where.templateType = templateType;
    }

    if (activeOnly) {
      where.isActive = true;
    }

    const templates = await prisma.standardTemplate.findMany({
      where,
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      take: 200,
    });

    return NextResponse.json({ templates });
  } catch (err) {
    return fromException(request, err, { stage: "load" });
  }
}
