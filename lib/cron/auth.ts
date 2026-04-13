import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Verifies the CRON_SECRET in the Authorization header.
 * Uses timingSafeEqual to prevent timing oracle attacks.
 * Vercel automatically includes this header when invoking cron routes.
 *
 * @param request - The incoming request
 * @returns NextResponse with 401 error if auth fails, null if auth passes
 */
export function verifyCronAuth(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;

  // Use constant-time comparison to prevent timing oracle attacks
  try {
    const a = Buffer.from(authHeader, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null; // Auth passed
}
