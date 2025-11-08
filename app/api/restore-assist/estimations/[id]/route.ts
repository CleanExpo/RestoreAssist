import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // TODO: Fetch estimation data from database
    const mockEstimate = {
      id: params.id,
      reportId: "mock-report-id",
      scopeId: "mock-scope-id",
      status: "DRAFT",
      version: 1,
      lineItems: [
        {
          id: "line-1",
          code: "L001",
          category: "Prelims",
          description: "Site setup and protection",
          qty: 1,
          unit: "ls",
          rate: 450,
          subtotal: 450,
          isScopeLinked: true,
        },
        {
          id: "line-2",
          code: "L002",
          category: "Mitigation",
          description: "Water extraction",
          qty: 2,
          unit: "hr",
          rate: 250,
          subtotal: 500,
          formula: "2 hours @ $250/hr",
          isScopeLinked: true,
        },
        {
          id: "line-3",
          code: "E001",
          category: "Equipment",
          description: "Large dehumidifier",
          qty: 3,
          unit: "day",
          rate: 75,
          subtotal: 225,
          isScopeLinked: false,
        },
      ],
      labourSubtotal: 3500,
      equipmentSubtotal: 2250,
      chemicalsSubtotal: 450,
      subcontractorSubtotal: 0,
      travelSubtotal: 150,
      wasteSubtotal: 200,
      overheads: 800,
      profit: 1200,
      contingency: 500,
      escalation: 0,
      subtotalExGST: 9050,
      gst: 905,
      totalIncGST: 9955,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return NextResponse.json(mockEstimate, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch estimate" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    // TODO: Update estimate in database
    return NextResponse.json({ message: "Estimate updated successfully" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update estimate" }, { status: 500 });
  }
}
