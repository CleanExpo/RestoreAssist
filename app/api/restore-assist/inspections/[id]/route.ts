import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import prisma from "@/lib/prisma";

// GET /api/restore-assist/inspections/[id] - Get single inspection
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const report = await prisma.report.findFirst({
      where: {
        id: params.id,
        userId: user.id,
      },
      include: {
        scope: {
          select: {
            id: true,
            scopeType: true,
          },
        },
        estimates: {
          select: {
            id: true,
            status: true,
            version: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    if (!report) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
    }

    return NextResponse.json(report, { status: 200 });
  } catch (error) {
    console.error("Error fetching inspection:", error);
    return NextResponse.json(
      { error: "Failed to fetch inspection" },
      { status: 500 }
    );
  }
}

// DELETE /api/restore-assist/inspections/[id] - Delete inspection
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check ownership
    const report = await prisma.report.findFirst({
      where: {
        id: params.id,
        userId: user.id,
      },
    });

    if (!report) {
      return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
    }

    // Delete report (cascade will handle related records)
    await prisma.report.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ message: "Inspection deleted successfully" }, { status: 200 });
  } catch (error) {
    console.error("Error deleting inspection:", error);
    return NextResponse.json(
      { error: "Failed to delete inspection" },
      { status: 500 }
    );
  }
}
