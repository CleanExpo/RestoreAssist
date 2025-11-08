import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // TODO: Generate cost estimation from scope
    const estimateId = "mock-estimate-id";
    return NextResponse.json({ estimateId, message: "Estimate generated successfully" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to generate estimate" }, { status: 500 });
  }
}
