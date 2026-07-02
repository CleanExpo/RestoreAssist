import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limiter";
import { fromException } from "@/lib/api-errors";

// Public endpoint — returns only isPubliclyVisible contractor profiles.
// No auth required by design; rate-limited to prevent directory scraping.
export async function GET(request: NextRequest) {
  const limited = await applyRateLimit(request, {
    prefix: "contractors",
    windowMs: 60 * 1000,
    maxRequests: 30,
  });
  if (limited) return limited;

  try {
    const { searchParams } = new URL(request.url);

    // Query parameters
    const search = searchParams.get("search");
    const postcode = searchParams.get("postcode");
    const state = searchParams.get("state");
    const certification = searchParams.get("certification");
    const minRating = searchParams.get("minRating");
    const specialization = searchParams.get("specialization");
    const requestedPage = parseInt(searchParams.get("page") || "1", 10);
    const requestedLimit = parseInt(searchParams.get("limit") || "20", 10);
    const page = Number.isFinite(requestedPage)
      ? Math.max(1, requestedPage)
      : 1;
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(1, requestedLimit), 50)
      : 20;

    // Build where clause
    const where: any = {
      isPubliclyVisible: true,
    };

    // Search filter
    if (search) {
      where.OR = [
        { user: { businessName: { contains: search, mode: "insensitive" } } },
        { publicDescription: { contains: search, mode: "insensitive" } },
        { specializations: { hasSome: [search] } },
      ];
    }

    // Postcode filter
    if (postcode) {
      where.serviceAreas = {
        some: {
          postcode,
          isActive: true,
        },
      };
    }

    // State filter
    if (state) {
      where.serviceAreas = {
        some: {
          state,
          isActive: true,
        },
      };
    }

    // Certification filter
    if (certification) {
      where.certifications = {
        some: {
          certificationType: certification,
          verificationStatus: "VERIFIED",
        },
      };
    }

    // Minimum rating filter
    if (minRating) {
      const rating = parseFloat(minRating);
      if (!isNaN(rating)) {
        where.averageRating = { gte: rating };
      }
    }

    // Specialization filter
    if (specialization) {
      where.specializations = {
        has: specialization,
      };
    }

    // Fetch contractors
    const [contractors, total] = await Promise.all([
      prisma.contractorProfile.findMany({
        where,
        include: {
          user: {
            select: {
              businessName: true,
              businessLogo: true,
              businessAddress: true,
            },
          },
          certifications: {
            where: { verificationStatus: "VERIFIED" },
            select: {
              certificationType: true,
              certificationName: true,
            },
          },
          serviceAreas: {
            where: { isActive: true },
            select: {
              postcode: true,
              suburb: true,
              state: true,
            },
            take: 5,
          },
        },
        orderBy: [
          { isVerified: "desc" },
          { averageRating: "desc" },
          { totalReviews: "desc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.contractorProfile.count({ where }),
    ]);

    return NextResponse.json({
      contractors: contractors.map((c) => ({
        id: c.id,
        slug: c.slug,
        businessName: c.user.businessName,
        businessLogo: c.user.businessLogo,
        businessAddress: c.user.businessAddress,
        publicDescription: c.publicDescription,
        yearsInBusiness: c.yearsInBusiness,
        teamSize: c.teamSize,
        isVerified: c.isVerified,
        averageRating: c.averageRating,
        totalReviews: c.totalReviews,
        completedJobs: c.completedJobs,
        specializations: c.specializations,
        certifications: c.certifications,
        serviceAreas: c.serviceAreas,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return fromException(request, error, { stage: "list" });
  }
}
