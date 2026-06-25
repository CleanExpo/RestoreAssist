import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

/**
 * GET /api/authority-forms/templates
 * Get all available authority form templates
 *
 * Requires authenticated session — returns 401 for unauthenticated callers.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const templates = await prisma.authorityFormTemplate.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        isActive: true,
      },
      orderBy: { name: "asc" },
      take: 100,
    });

    return NextResponse.json({ templates });
  } catch (error) {
    // RA-786: do not leak error.message to clients
    console.error("Error fetching authority form templates:", error);
    return fromException(request, error, { stage: "list-templates" });
  }
}
