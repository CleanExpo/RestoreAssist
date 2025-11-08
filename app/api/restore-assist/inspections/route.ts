import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import prisma from "@/lib/prisma";

// GET /api/restore-assist/inspections - List all inspections
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const inspections = await prisma.inspectionReport.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        claimReference: true,
        clientName: true,
        propertyAddress: true,
        incidentDate: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        reportDepth: true,
        version: true,
      },
    });

    return NextResponse.json({ inspections }, { status: 200 });
  } catch (error) {
    console.error("Error fetching inspections:", error);
    return NextResponse.json(
      { error: "Failed to fetch inspections" },
      { status: 500 }
    );
  }
}

// POST /api/restore-assist/inspections - Create new inspection
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await req.json();
    const { claimReference, clientName, propertyAddress, incidentDate, attendanceDate, technicianReport } = body;

    // Create basic inspection report
    const inspection = await prisma.inspectionReport.create({
      data: {
        userId: user.id,
        claimReference: claimReference || `CLAIM-${Date.now()}`,
        clientName,
        propertyAddress,
        incidentDate: incidentDate ? new Date(incidentDate) : new Date(),
        attendanceDate: attendanceDate ? new Date(attendanceDate) : new Date(),
        technicianReport: technicianReport || '',
        status: "DRAFT",
        reportDepth: "BASIC",
        version: 1,
        waterCategory: null,
        propertyType: null,
        constructionYear: null,
        occupancyStatus: null,
      },
    });

    return NextResponse.json(
      { id: inspection.id, message: "Inspection created successfully" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating inspection:", error);
    return NextResponse.json(
      { error: "Failed to create inspection" },
      { status: 500 }
    );
  }
}
