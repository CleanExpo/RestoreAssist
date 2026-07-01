import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeString } from "@/lib/sanitize";
import { apiError, fromException } from "@/lib/api-errors";

export async function GET(
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

    const library = await prisma.costLibrary.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        items: {
          orderBy: {
            category: "asc",
          },
        },
        _count: {
          select: {
            items: true,
          },
        },
      },
    });

    if (!library) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Cost library not found",
        status: 404,
      });
    }

    return NextResponse.json(library);
  } catch (error) {
    return fromException(request, error, { stage: "get" });
  }
}

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
    const name = sanitizeString(body.name, 200);
    const region = sanitizeString(body.region, 200);
    const description = sanitizeString(body.description, 1000);
    const isDefault = body.isDefault;

    if (!name || !region) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Name and region are required",
        status: 400,
      });
    }

    // Check if library exists and belongs to user
    const existingLibrary = await prisma.costLibrary.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existingLibrary) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Cost library not found",
        status: 404,
      });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.costLibrary.updateMany({
        where: {
          userId: session.user.id,
          isDefault: true,
          id: { not: id },
        },
        data: {
          isDefault: false,
        },
      });
    }

    const library = await prisma.costLibrary.update({
      where: { id, userId: session.user.id },
      data: {
        name,
        region,
        description,
        isDefault: isDefault || false,
      },
      include: {
        items: {
          orderBy: {
            category: "asc",
          },
        },
        _count: {
          select: {
            items: true,
          },
        },
      },
    });

    return NextResponse.json(library);
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

    // Check if library exists and belongs to user
    const existingLibrary = await prisma.costLibrary.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!existingLibrary) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Cost library not found",
        status: 404,
      });
    }

    await prisma.costLibrary.delete({
      where: { id, userId: session.user.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return fromException(request, error, { stage: "delete" });
  }
}
