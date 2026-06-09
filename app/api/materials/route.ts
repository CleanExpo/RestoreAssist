import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError, fromException } from "@/lib/api-errors";

// GET /api/materials — ANZ materials library (spec §5.1). Optional ?region=AU|NZ.
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

    const region = request.nextUrl.searchParams.get("region");
    const where = region ? { region: { has: region } } : {};

    const materials = await (prisma as any).material.findMany({
      where,
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ materials });
  } catch (error) {
    return fromException(request, error, { stage: "list-materials" });
  }
}
