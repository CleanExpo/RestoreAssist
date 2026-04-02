import { NextRequest, NextResponse } from "next/server";

// Minimal diagnostic middleware — no next-auth dependency
// Testing if Edge Runtime middleware infrastructure works at all
export function middleware(_req: NextRequest) {
  return NextResponse.next();
}
