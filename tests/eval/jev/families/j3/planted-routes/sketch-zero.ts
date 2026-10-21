// Planted defect: the sketch estimate returns no lines whatever was drawn.
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ estimate: { lineItems: [], totalRoomAreaM2: 0, totalDamageAreaM2: 0, extractedAt: new Date().toISOString() } });
}
