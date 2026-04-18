import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { withIdempotency } from "@/lib/idempotency";

// Get contractor's certifications
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

    const certifications = await prisma.contractorCertification.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ certifications });
  } catch (error: any) {
    console.error("Error fetching certifications:", error);
    return NextResponse.json(
      { error: "Failed to fetch certifications" },
      { status: 500 },
    );
  }
}

// Add new certification
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // RA-1266: prevents duplicate certification records on retry.
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
      const {
        certificationType,
        certificationName,
        issuingBody,
        certificationNumber,
        issueDate,
        expiryDate,
        documentUrl,
      } = body;

      // Validation
      if (
        !certificationType ||
        !certificationName ||
        !issuingBody ||
        !issueDate
      ) {
        return NextResponse.json(
          { error: "Missing required fields" },
          { status: 400 },
        );
      }

      const certification = await prisma.contractorCertification.create({
        data: {
          profileId: profile.id,
          certificationType,
          certificationName,
          issuingBody,
          certificationNumber,
          issueDate: new Date(issueDate),
          expiryDate: expiryDate ? new Date(expiryDate) : null,
          documentUrl,
          verificationStatus: "PENDING",
        },
      });

      return NextResponse.json({ certification }, { status: 201 });
    } catch (error: any) {
      console.error("Error creating certification:", error);
      return NextResponse.json(
        { error: "Failed to create certification" },
        { status: 500 },
      );
    }
  });
}
