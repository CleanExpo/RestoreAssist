import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";
import { apiError, fromException } from "@/lib/api-errors";

// Get contractor's service areas
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const profile = await prisma.contractorProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!profile) {
      return apiError(request, {
        code: "NOT_FOUND",
        message: "Contractor profile not found",
        status: 404,
      });
    }

    const serviceAreas = await prisma.contractorServiceArea.findMany({
      where: { profileId: profile.id },
      orderBy: [{ priority: "desc" }, { postcode: "asc" }],
      take: 100,
    });

    return NextResponse.json({ serviceAreas });
  } catch (error: any) {
    console.error("Error fetching service areas:", error);
    return fromException(request, error, {
      stage: "contractors/service-areas:list",
    });
  }
}

// Add new service area
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return apiError(request, {
      code: "UNAUTHORIZED",
      message: "Unauthorized",
      status: 401,
    });
  }
  const userId = session.user.id;

  // RA-1266: prevents duplicate service-area entries on retry (the unique
  // constraint already catches this with P2002, but idempotency returns a
  // cached success instead of 409 to the same client).
  return withIdempotency(request, userId, async (rawBody) => {
    try {
      const profile = await prisma.contractorProfile.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!profile) {
        return apiError(request, {
          code: "NOT_FOUND",
          message: "Contractor profile not found",
          status: 404,
        });
      }

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
      const { postcode, suburb, state, radius, isActive, priority } = body;

      // Validation
      if (!postcode || !state) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Postcode and state are required",
          status: 400,
        });
      }

      // Validate Australian postcode (4 digits)
      if (!/^\d{4}$/.test(postcode)) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid Australian postcode",
          status: 400,
        });
      }

      // Validate Australian state
      const validStates = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"];
      if (!validStates.includes(state.toUpperCase())) {
        return apiError(request, {
          code: "VALIDATION",
          message: "Invalid Australian state",
          status: 400,
        });
      }

      const serviceArea = await prisma.contractorServiceArea.create({
        data: {
          profileId: profile.id,
          postcode,
          suburb,
          state: state.toUpperCase(),
          radius: radius ? parseInt(radius) : null,
          isActive: isActive ?? true,
          priority: priority ? parseInt(priority) : 0,
        },
      });

      return NextResponse.json({ serviceArea }, { status: 201 });
    } catch (error: any) {
      console.error("Error creating service area:", error);
      // fromException maps P2002 unique-constraint violations to 409 CONFLICT.
      return fromException(request, error, {
        stage: "contractors/service-areas:create",
      });
    }
  });
}
