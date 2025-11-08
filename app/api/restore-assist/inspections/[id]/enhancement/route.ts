import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    // TODO: Save tier answers to database
    return NextResponse.json({ message: "Answers saved successfully" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to save answers" }, { status: 500 });
  }
}
