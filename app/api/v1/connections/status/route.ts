import { NextResponse } from "next/server";
import { buildRestoreAssistConnectionStatus } from "@/lib/connections/status";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(buildRestoreAssistConnectionStatus());
}
