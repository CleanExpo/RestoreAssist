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

    const inspections = await prisma.report.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        reportNumber: true,
        clientName: true,
        propertyAddress: true,
        inspectionDate: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        title: true,
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
    const { reportNumber, clientName, propertyAddress, inspectionDate, technicianNotes } = body;

    // Create basic inspection report
    const report = await prisma.report.create({
      data: {
        userId: user.id,
        title: `Inspection - ${clientName}`,
        reportNumber: reportNumber || `INS-${Date.now()}`,
        clientName,
        propertyAddress,
        inspectionDate: inspectionDate ? new Date(inspectionDate) : new Date(),
        status: "DRAFT",
        hazardType: "WATER",
        insuranceType: "Property",
        detailedReport: technicianNotes,
      },
    });

    return NextResponse.json(
      { id: report.id, message: "Inspection created successfully" },
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
