import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // TODO: Generate scope of works
    const scopeId = "mock-scope-id";
    return NextResponse.json({ scopeId, message: "Scope generated successfully" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to generate scope" }, { status: 500 });
  }
}
