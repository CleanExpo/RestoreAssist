// Planted defect: the webhook processes events without checking any signature.
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const event = JSON.parse(await req.text());
  return NextResponse.json({ received: true, type: event?.type ?? null });
}
