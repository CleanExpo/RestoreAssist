import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * RA-1259: Onboarding gate for Google OAuth signups.
 *
 * New OAuth users have `needsOnboarding=true` set by the NextAuth
 * `createUser` event (see lib/auth.ts). They skipped the account-type
 * form the credentials flow uses, so we hold them on
 * /onboarding/account-type until the business fields (name, ABN, ACN,
 * state/territory, acceptance) are persisted.
 *
 * Middleware is preferred over a layout useEffect because:
 *   1. It gates on the server — no protected dashboard HTML flashes
 *      before the redirect kicks in.
 *   2. One check covers every /dashboard/* route; we don't have to
 *      thread a hook through every layout that might exist.
 *   3. It cannot be bypassed by disabling JS.
 */
export async function middleware(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Unauthenticated — let the dashboard layout's own redirect to /login handle it.
  if (!token) {
    return NextResponse.next();
  }

  const needsOnboarding = Boolean((token as any).needsOnboarding);
  if (!needsOnboarding) {
    return NextResponse.next();
  }

  // Already on the onboarding page — don't loop.
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/onboarding/account-type")) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/onboarding/account-type";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Only run on dashboard routes. API, auth, static assets are unaffected.
  matcher: ["/dashboard/:path*"],
};
