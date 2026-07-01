import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeString } from "@/lib/sanitize";
import { apiError, fromException } from "@/lib/api-errors";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;
    let body: any;
    try {
      const parsed = await request.json();
      body =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed
          : {};
    } catch {
      return apiError(request, {
        code: "VALIDATION",
        message: "Invalid JSON body",
        status: 400,
      });
    }
    const category = sanitizeString(body.category, 200);
    const description = sanitizeString(body.description, 1000);
    const rate = body.rate;
    const unit = sanitizeString(body.unit, 50);

    if (!category || !description || rate === undefined || !unit) {
      return apiError(request, {
        code: "VALIDATION",
        message: "All fields are required",
        status: 400,
      });
    }
    const parsedRate = parseFloat(rate);
    if (!isFinite(parsedRate) || parsedRate < 0 || parsedRate > 1_000_000) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Rate must be a non-negative number up to 1,000,000",
        status: 400,
      });
    }

    // Check if item exists and belongs to user's library
    const existingItem = await prisma.costItem.findFirst({
      where: {
        id,
        library: {
          userId: session.user.id,
        },
      },
    });

    if (!existingItem) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Cost item not found",
        status: 404,
      });
    }

    const item = await prisma.costItem.update({
      where: { id, library: { userId: session.user.id } },
      data: {
        category,
        description,
        rate: parsedRate,
        unit,
      },
    });

    return NextResponse.json(item);
  } catch (error) {
    return fromException(request, error, { stage: "update" });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const { id } = await params;

    // Check if item exists and belongs to user's library
    const existingItem = await prisma.costItem.findFirst({
      where: {
        id,
        library: {
          userId: session.user.id,
        },
      },
    });

    if (!existingItem) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Cost item not found",
        status: 404,
      });
    }

    await prisma.costItem.delete({
      where: { id, library: { userId: session.user.id } },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return fromException(request, error, { stage: "delete" });
  }
}
