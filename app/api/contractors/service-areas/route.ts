import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";

// Get contractor's service areas
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await prisma.contractorProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!profile) {
      return NextResponse.json(
        { error: "Contractor profile not found" },
        { status: 404 },
      );
    }

    const serviceAreas = await prisma.contractorServiceArea.findMany({
      where: { profileId: profile.id },
      orderBy: [{ priority: "desc" }, { postcode: "asc" }],
    });

    return NextResponse.json({ serviceAreas });
  } catch (error: any) {
    console.error("Error fetching service areas:", error);
    return NextResponse.json(
      { error: "Failed to fetch service areas" },
      { status: 500 },
    );
  }
}

// Add new service area
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        return NextResponse.json(
          { error: "Contractor profile not found" },
          { status: 404 },
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
      const { postcode, suburb, state, radius, isActive, priority } = body;

      // Validation
      if (!postcode || !state) {
        return NextResponse.json(
          { error: "Postcode and state are required" },
          { status: 400 },
        );
      }

      // Validate Australian postcode (4 digits)
      if (!/^\d{4}$/.test(postcode)) {
        return NextResponse.json(
          { error: "Invalid Australian postcode" },
          { status: 400 },
        );
      }

      // Validate Australian state
      const validStates = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"];
      if (!validStates.includes(state.toUpperCase())) {
        return NextResponse.json(
          { error: "Invalid Australian state" },
          { status: 400 },
        );
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

      // Handle unique constraint violation
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "Service area for this postcode already exists" },
          { status: 409 },
        );
      }

      return NextResponse.json(
        { error: "Failed to create service area" },
        { status: 500 },
      );
    }
  });
}
