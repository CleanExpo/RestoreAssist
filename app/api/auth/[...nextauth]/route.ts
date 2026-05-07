import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import { type NextRequest, NextResponse } from "next/server";

const handler = NextAuth(authOptions);

export const GET = handler;

// RA-1798 — NextAuth crashes with HTTP 500 (empty body) when POST has no
// body at all (Content-Length: 0 or absent Content-Type). Wrap POST to
// catch the unhandled exception and return 400 instead.
//
// RA-1818-followup: In Next.js 15 App Router, context.params is a Promise.
// When exported directly (`export const POST = handler`), Next.js resolves
// params before calling the handler. When we define our own async function,
// we receive the raw Promise and must resolve it ourselves before passing
// context to NextAuth — otherwise NextAuth reads params.nextauth as undefined,
// fails to match the route, and redirects to /login (the Google OAuth loop).
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  // Resolve params so NextAuth receives a plain object, not a Promise.
  const resolvedParams = await context.params;
  const resolvedContext = { ...context, params: resolvedParams };

  try {
    return await (handler as (req: NextRequest, ctx: typeof resolvedContext) => Promise<NextResponse>)(
      req,
      resolvedContext,
    );
  } catch (err) {
    console.error(
      "[NextAuth] Unhandled handler error (likely empty body):",
      err instanceof Error ? err.message : err,
    );
    return new NextResponse(null, { status: 400 });
  }
}
