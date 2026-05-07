import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import { type NextRequest, NextResponse } from "next/server";

const handler = NextAuth(authOptions);

export const GET = handler;

// RA-1798 — NextAuth crashes with HTTP 500 (empty body) when POST has no
// body at all (Content-Length: 0 or absent Content-Type). Real users never
// hit this, but probes/attackers do, flooding the error feed. Wrap POST to
// catch the unhandled exception and return 400 instead.
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  try {
    return await (handler as (req: NextRequest, ctx: typeof context) => Promise<NextResponse>)(req, context);
  } catch (err) {
    console.error(
      "[NextAuth] Unhandled handler error (likely empty body):",
      err instanceof Error ? err.message : err,
    );
    return new NextResponse(null, { status: 400 });
  }
}
