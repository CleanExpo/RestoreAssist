import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // TODO: Fetch scope data from database
    const mockScope = {
      id: params.id,
      reportId: "mock-report-id",
      scopeType: "WATER",
      phases: [
        {
          id: "phase-1",
          name: "Emergency Mitigation",
          description: "Immediate water extraction and drying setup",
          status: "completed",
          items: [
            {
              id: "item-1",
              description: "Water extraction - truck mounted",
              quantity: 2,
              unit: "hr",
              hours: 2,
              rate: 250,
              subtotal: 500,
            },
            {
              id: "item-2",
              description: "Large dehumidifier setup",
              quantity: 3,
              unit: "ea",
              hours: 0.5,
              rate: 75,
              subtotal: 225,
            },
          ],
        },
      ],
      labourCostTotal: 1500,
      equipmentCostTotal: 2250,
      chemicalCostTotal: 450,
      totalDuration: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return NextResponse.json(mockScope, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch scope" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    // TODO: Update scope in database
    return NextResponse.json({ message: "Scope updated successfully" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update scope" }, { status: 500 });
  }
}
