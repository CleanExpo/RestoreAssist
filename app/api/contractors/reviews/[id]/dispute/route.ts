import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

// Submit a dispute for a review (contractors only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;
  const { id } = await params;

  // RA-1266: dispute is a terminal decision — prevents re-timestamping on retry.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid JSON body",
          status: 400,
        });
      }
      const { disputeReason } = body;

      const review = await prisma.contractorReview.findUnique({
        where: { id },
        include: {
          profile: { select: { userId: true } },
        },
      });

      if (!review) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Review not found",
          status: 404,
        });
      }

      if (review.profile.userId !== userId) {
        return apiError(request, {
          code: "FORBIDDEN",
          message: "Forbidden",
          status: 403,
        });
      }

      if (review.disputeStatus !== "NONE") {
        return apiError(request, {
          code: "VALIDATION",
          message: "Review has already been disputed",
          status: 400,
        });
      }

      if (!disputeReason || disputeReason.trim().length === 0) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Dispute reason is required",
          status: 400,
        });
      }

      const updated = await prisma.contractorReview.update({
        where: { id },
        data: {
          disputeStatus: "PENDING_REVIEW",
          disputeReason,
          disputeSubmittedAt: new Date(),
          status: "DISPUTED",
        },
      });

      return NextResponse.json({ review: updated });
    } catch (error: any) {
      console.error("Error disputing review:", error);
      return fromException(request, error, {
        stage: "contractors/reviews:dispute",
      });
    }
  });
}
