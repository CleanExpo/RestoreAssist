import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";

// Get reviews (filtered by contractor slug or client)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contractorSlug = searchParams.get("contractorSlug");
    const myReviews = searchParams.get("myReviews") === "true";

    const session = await getServerSession(authOptions);

    if (myReviews && !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let where: any = {
      status: "PUBLISHED",
      disputeStatus: { notIn: ["UNDER_INVESTIGATION", "RESOLVED_REMOVED"] },
    };

    if (myReviews) {
      // Get reviews submitted by this client
      const clientUser = await (prisma.clientUser as any).findUnique({
        where: { userId: session?.user?.id },
        select: { id: true },
      });

      if (!clientUser) {
        return NextResponse.json(
          { error: "Client user not found" },
          { status: 404 },
        );
      }

      where = {
        clientUserId: clientUser.id,
      };
      delete where.status;
      delete where.disputeStatus;
    } else if (contractorSlug) {
      // Get reviews for specific contractor
      const profile = await prisma.contractorProfile.findUnique({
        where: { slug: contractorSlug },
        select: { id: true },
      });

      if (!profile) {
        return NextResponse.json(
          { error: "Contractor not found" },
          { status: 404 },
        );
      }

      where.profileId = profile.id;
    }

    const reviews = await prisma.contractorReview.findMany({
      where,
      include: {
        profile: {
          select: {
            slug: true,
            user: {
              select: {
                businessName: true,
                businessLogo: true,
              },
            },
          },
        },
        clientUser: {
          select: {
            name: true,
          },
        },
        report: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({
      reviews: reviews.map((r) => ({
        id: r.id,
        contractorSlug: r.profile.slug,
        businessName: r.profile.user.businessName,
        businessLogo: r.profile.user.businessLogo,
        overallRating: r.overallRating,
        qualityRating: r.qualityRating,
        timelinessRating: r.timelinessRating,
        communicationRating: r.communicationRating,
        valueRating: r.valueRating,
        reviewTitle: r.reviewTitle,
        reviewText: r.reviewText,
        contractorResponse: r.contractorResponse,
        respondedAt: r.respondedAt,
        disputeStatus: r.disputeStatus,
        status: r.status,
        isVerifiedJob: r.isVerifiedJob,
        helpfulCount: r.helpfulCount,
        notHelpfulCount: r.notHelpfulCount,
        createdAt: r.createdAt,
        clientName: (r.clientUser as any).name || "Anonymous",
        reportTitle: r.report?.title,
      })),
    });
  } catch (error: any) {
    console.error("Error fetching reviews:", error);
    return NextResponse.json(
      { error: "Failed to fetch reviews" },
      { status: 500 },
    );
  }
}

// Submit a new review (clients only)
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // RA-1266: reviews are public-facing content — a double-post creates
  // two identical reviews from the same client, which gives the illusion
  // of an inflated rating count. Idempotency-Key catches the retry.
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      const clientUser = await (prisma.clientUser as any).findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!clientUser) {
        return NextResponse.json(
          { error: "Only clients can submit reviews" },
          { status: 403 },
        );
      }

      let body: any;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 },
        );
      }
      const {
        contractorSlug,
        reportId,
        overallRating,
        qualityRating,
        timelinessRating,
        communicationRating,
        valueRating,
        reviewTitle,
        reviewText,
      } = body;

      // Validation
      if (!contractorSlug || !overallRating || !reviewText) {
        return NextResponse.json(
          { error: "Missing required fields" },
          { status: 400 },
        );
      }

      const subRatings = [
        qualityRating,
        timelinessRating,
        communicationRating,
        valueRating,
      ];
      const allRatings = [
        overallRating,
        ...subRatings.filter((r) => r !== undefined),
      ];
      if (allRatings.some((r) => r < 1 || r > 5)) {
        return NextResponse.json(
          { error: "Rating must be between 1 and 5" },
          { status: 400 },
        );
      }

      // Get contractor profile
      const profile = await prisma.contractorProfile.findUnique({
        where: { slug: contractorSlug },
        select: { id: true },
      });

      if (!profile) {
        return NextResponse.json(
          { error: "Contractor not found" },
          { status: 404 },
        );
      }

      // Check if report exists and belongs to this client
      let isVerifiedJob = false;
      if (reportId) {
        const report = await prisma.report.findFirst({
          where: {
            id: reportId,
            clientId: (clientUser as any).clientId,
          },
        });

        if (report) {
          isVerifiedJob = true;
        }
      }

      // Check if client already reviewed this contractor for this report
      if (reportId) {
        const existingReview = await prisma.contractorReview.findFirst({
          where: {
            profileId: profile.id,
            clientUserId: clientUser.id,
            reportId,
          },
        });

        if (existingReview) {
          return NextResponse.json(
            {
              error:
                "You have already reviewed this contractor for this report",
            },
            { status: 409 },
          );
        }
      }

      // Create review
      const review = await prisma.contractorReview.create({
        data: {
          profileId: profile.id,
          clientUserId: clientUser.id,
          reportId,
          overallRating,
          qualityRating,
          timelinessRating,
          communicationRating,
          valueRating,
          reviewTitle,
          reviewText,
          isVerifiedJob,
          status: "PUBLISHED", // Auto-publish as per user requirement
        },
      });

      // Update contractor's cached ratings
      await updateContractorRatings(profile.id);

      return NextResponse.json({ review }, { status: 201 });
    } catch (error: any) {
      console.error("Error creating review:", error);
      return NextResponse.json(
        { error: "Failed to create review" },
        { status: 500 },
      );
    }
  });
}

// Helper function to update contractor's cached ratings
async function updateContractorRatings(profileId: string) {
  const stats = await prisma.contractorReview.aggregate({
    where: {
      profileId,
      status: "PUBLISHED",
      disputeStatus: { notIn: ["UNDER_INVESTIGATION", "RESOLVED_REMOVED"] },
    },
    _avg: {
      overallRating: true,
    },
    _count: true,
  });

  await prisma.contractorProfile.update({
    where: { id: profileId },
    data: {
      averageRating: stats._avg.overallRating || 0,
      totalReviews: stats._count,
    },
  });
}
