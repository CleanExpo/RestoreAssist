import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl

    // 1. Log ALL API requests
    if (pathname.startsWith("/api")) {
      console.log(
        `[API REQUEST] ${req.method} ${pathname} | ${new Date().toISOString()}`
      )
    }

    // 2. Continue request
    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl

        // 3. Public routes (no auth required)
        if (
          pathname === "/" ||
          pathname.startsWith("/login") ||
          pathname.startsWith("/signup") ||
          pathname.startsWith("/api/auth") ||
          pathname.startsWith("/_next") ||
          pathname.startsWith("/favicon")
        ) {
          return true
        }

        // 4. Protected dashboard routes
        if (pathname.startsWith("/dashboard")) {
          return !!token
        }

        // 5. Allow other routes
        return true
      },
    },
  }
)

export const config = {
  matcher: [
    "/api/:path*",
    "/dashboard/:path*",
    "/reports/:path*",
    "/clients/:path*",
    "/settings/:path*",
    "/analytics/:path*",
    "/integrations/:path*",
    "/cost-libraries/:path*",
    "/help/:path*"
  ]
}
