import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    // Middleware runs after authentication is verified
    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname

        // Allow access to public routes
        if (
          pathname.startsWith("/login") ||
          pathname.startsWith("/signup") ||
          pathname === "/" ||
          pathname.startsWith("/api/auth") ||
          pathname.startsWith("/_next") ||
          pathname.startsWith("/favicon") ||
          pathname.startsWith("/public")
        ) {
          return true
        }

        // Protect all /api routes except /api/auth
        if (pathname.startsWith("/api")) {
          return !!token
        }

        // Protect dashboard and other authenticated routes
        if (
          pathname.startsWith("/dashboard") ||
          pathname.startsWith("/reports") ||
          pathname.startsWith("/clients") ||
          pathname.startsWith("/settings") ||
          pathname.startsWith("/analytics") ||
          pathname.startsWith("/integrations") ||
          pathname.startsWith("/cost-libraries") ||
          pathname.startsWith("/help")
        ) {
          return !!token
        }

        return true
      },
    },
  }
)

export const config = {
  matcher: [
    // Dashboard routes
    "/dashboard/:path*",
    "/reports/:path*",
    "/clients/:path*",
    "/settings/:path*",
    "/analytics/:path*",
    "/integrations/:path*",
    "/cost-libraries/:path*",
    "/help/:path*",
    // API routes (except auth)
    "/api/:path*"
  ]
}
