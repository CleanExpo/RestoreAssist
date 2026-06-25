import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiError, fromException } from "@/lib/api-errors";

// Respond to a review (contractors only)
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

    const body = await request.json();
    const { contractorResponse } = body;

    // Get review and verify ownership
    const review = await prisma.contractorReview.findUnique({
      where: { id },
      include: {
        profile: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!review) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Review not found",
        status: 404,
      });
    }

    if (review.profile.userId !== session.user.id) {
      return apiError(request, {
        code: "FORBIDDEN",
        message: "Forbidden",
        status: 403,
      });
    }

    if (!contractorResponse || contractorResponse.trim().length === 0) {
      return apiError(request, {
        code: "VALIDATION",
        message: "Response cannot be empty",
        status: 400,
      });
    }

    const updated = await prisma.contractorReview.update({
      where: { id, profile: { userId: session.user.id } },
      data: {
        contractorResponse,
        respondedAt: new Date(),
      },
    });

    return NextResponse.json({ review: updated });
  } catch (error: any) {
    console.error("Error responding to review:", error);
    return fromException(request, error, {
      stage: "contractors/reviews:respond",
    });
  }
}
