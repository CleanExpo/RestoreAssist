import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const { id } = await params;

    // Verify library belongs to user
    const library = await prisma.costLibrary.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!library) {
      return NextResponse.json({ error: "Library not found" }, { status: 404 });
    }

    const body = (await request.json()) as {
      items: Array<{
        category?: string;
        description: string;
        unit: string;
        rate: number;
      }>;
    };
    const { items } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "No items provided" }, { status: 400 });
    }

    // Filter out any rows with missing required fields
    const valid = items.filter(
      (i) =>
        i.description && i.unit && typeof i.rate === "number" && !isNaN(i.rate),
    );
    const skipped = items.length - valid.length;

    const created = await prisma.costItem.createMany({
      data: valid.map((i) => ({
        libraryId: id,
        category: i.category ?? "Uncategorised",
        description: i.description,
        unit: i.unit,
        rate: i.rate,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({ imported: created.count, skipped });
  } catch (error) {
    console.error("Error importing cost items:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
