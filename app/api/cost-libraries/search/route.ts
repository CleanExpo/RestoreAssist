import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/cost-libraries/search?q=<term>&category=<cat>&limit=<n>
 *
 * Lightweight search across the signed-in user's CostItems for autocomplete
 * on the estimator's line-item description field. Paired with
 * POST /api/cost-libraries/promote which pushes custom items INTO the library;
 * this endpoint pulls them OUT for reuse on future estimates.
 *
 * Matches on description (case-insensitive contains). Optional category
 * narrow. Returns category + description + rate + unit + sourceCostItemId
 * so the UI can populate the row in one click.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const q = (searchParams.get("q") ?? "").trim();
    const category = searchParams.get("category") ?? undefined;
    const limit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get("limit") ?? "10", 10)),
    );

    if (q.length < 2) {
      return NextResponse.json({ items: [] });
    }

    // Items from libraries owned by this user only.
    const items = await prisma.costItem.findMany({
      where: {
        library: { userId: session.user.id },
        ...(category ? { category } : {}),
        description: { contains: q, mode: "insensitive" },
      },
      select: {
        id: true,
        category: true,
        description: true,
        rate: true,
        unit: true,
        libraryId: true,
      },
      orderBy: [{ description: "asc" }],
      take: limit,
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("[cost-libraries/search] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
