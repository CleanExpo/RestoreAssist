import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiError, fromException } from "@/lib/api-errors";

// Get contractor's own profile
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
      include: {
        user: {
          select: {
            businessName: true,
            businessLogo: true,
            businessAddress: true,
            email: true,
          },
        },
        certifications: {
          orderBy: { createdAt: "desc" },
        },
        serviceAreas: {
          orderBy: [{ priority: "desc" }, { postcode: "asc" }],
        },
      },
    });

    // RA-7723: no row yet is the normal state for a new owner — the first
    // save creates it. Return an empty profile, not an error.
    return NextResponse.json({ profile: profile ?? null });
  } catch (error: any) {
    console.error("Error fetching contractor profile:", error);
    return fromException(request, error, {
      stage: "contractors/profile:get",
    });
  }
}

// Create or update contractor profile
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return apiError(request, {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
        status: 401,
      });
    }

    const body = await request.json();
    const {
      publicDescription,
      yearsInBusiness,
      teamSize,
      insuranceCertificate,
      isPubliclyVisible,
      specializations,
      servicesOffered,
      searchKeywords,
    } = body;

    // RA-7723: only the business owner may publish the contractor listing.
    // `role: "ADMIN"` is every self-registered owner (D-023); MANAGER and USER
    // are invited staff. Role is read from the DB, not the JWT (RULES.md #3).
    // This used to compare against "CONTRACTOR", which the Role enum has
    // never contained, so every save was refused.
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, businessName: true },
    });

    if (user?.role !== "ADMIN") {
      return apiError(request, {
        code: "FORBIDDEN",
        message:
          "Only the workspace owner can edit the contractor profile. Ask your account owner to make this change.",
        status: 403,
      });
    }

    // Generate slug from business name
    const slug = (user?.businessName ?? "contractor")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Upsert contractor profile
    const profile = await prisma.contractorProfile.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        slug,
        publicDescription,
        yearsInBusiness: yearsInBusiness ? parseInt(yearsInBusiness) : null,
        teamSize: teamSize ? parseInt(teamSize) : null,
        insuranceCertificate,
        isPubliclyVisible: isPubliclyVisible ?? true,
        specializations: specializations || [],
        servicesOffered,
        searchKeywords: searchKeywords || [],
      },
      update: {
        publicDescription,
        yearsInBusiness: yearsInBusiness ? parseInt(yearsInBusiness) : null,
        teamSize: teamSize ? parseInt(teamSize) : null,
        insuranceCertificate,
        isPubliclyVisible: isPubliclyVisible ?? true,
        specializations: specializations || [],
        servicesOffered,
        searchKeywords: searchKeywords || [],
      },
      include: {
        certifications: true,
        serviceAreas: true,
      },
    });

    return NextResponse.json({ profile });
  } catch (error: any) {
    console.error("Error updating contractor profile:", error);
    // fromException maps P2002 unique-constraint violations to 409 CONFLICT.
    return fromException(request, error, {
      stage: "contractors/profile:upsert",
    });
  }
}
