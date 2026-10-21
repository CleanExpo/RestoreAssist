// Planted defect: unhandled JSON parse error becomes a 500.
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    return NextResponse.json(body);
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
