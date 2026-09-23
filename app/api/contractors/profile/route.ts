import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { apiError, fromException } from "@/lib/api-errors";
import { randomUUID } from "crypto";

function slugify(name: string | null | undefined): string {
  const slug = (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "contractor";
}

// First free slug of base, base-2 ... base-20, then base-<random>.
async function findFreeSlug(base: string): Promise<string> {
  for (let n = 1; n <= 20; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const taken = await prisma.contractorProfile.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  return `${base}-${randomUUID().slice(0, 8)}`;
}

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

    // RA-7728: the public slug is unique across all owners. An owner who
    // already has a profile keeps their slug (links must not churn); a new
    // profile gets the first free slug, so a second business with the same
    // name no longer fails its first save with a 409.
    const existing = await prisma.contractorProfile.findUnique({
      where: { userId: session.user.id },
      select: { slug: true },
    });
    const slug =
      existing?.slug ?? (await findFreeSlug(slugify(user?.businessName)));

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
