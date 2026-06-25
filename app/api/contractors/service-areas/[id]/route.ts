import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiError, fromException } from "@/lib/api-errors";

// Update service area
export async function PATCH(
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

    // Verify ownership
    const serviceArea = await prisma.contractorServiceArea.findUnique({
      where: { id },
      include: {
        profile: {
          select: { userId: true },
        },
      },
    });

    if (!serviceArea) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Service area not found",
        status: 404,
      });
    }

    if (serviceArea.profile.userId !== session.user.id) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Forbidden",
        status: 403,
      });
    }

    const body = await request.json();
    const { suburb, radius, isActive, priority } = body;

    const updated = await prisma.contractorServiceArea.update({
      where: { id, profile: { userId: session.user.id } },
      data: {
        ...(suburb !== undefined && { suburb }),
        ...(radius !== undefined && {
          radius: radius ? parseInt(radius) : null,
        }),
        ...(isActive !== undefined && { isActive }),
        ...(priority !== undefined && { priority: parseInt(priority) }),
      },
    });

    return NextResponse.json({ serviceArea: updated });
  } catch (error: any) {
    console.error("Error updating service area:", error);
    return fromException(request, error, {
      stage: "contractors/service-areas:update",
    });
  }
}

// Delete service area
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

    // Verify ownership
    const serviceArea = await prisma.contractorServiceArea.findUnique({
      where: { id },
      include: {
        profile: {
          select: { userId: true },
        },
      },
    });

    if (!serviceArea) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Service area not found",
        status: 404,
      });
    }

    if (serviceArea.profile.userId !== session.user.id) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Forbidden",
        status: 403,
      });
    }

    await prisma.contractorServiceArea.delete({
      where: { id, profile: { userId: session.user.id } },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting service area:", error);
    return fromException(request, error, {
      stage: "contractors/service-areas:delete",
    });
  }
}
