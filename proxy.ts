import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function proxy(req) {
    // Additional proxy logic can be added here
    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname

        // Allow access to public routes
        if (
          path.startsWith("/login") ||
          path.startsWith("/signup") ||
          path === "/" ||
          path.startsWith("/api/auth") ||
          path.startsWith("/_next") ||
          path.startsWith("/favicon") ||
          path.startsWith("/about") ||
          path.startsWith("/contact") ||
          path.startsWith("/features") ||
          path.startsWith("/pricing") ||
          path.startsWith("/solutions") ||
          path.startsWith("/how-it-works") ||
          path.startsWith("/resources") ||
          path.startsWith("/blog") ||
          path.startsWith("/faq") ||
          path.startsWith("/help") ||
          path.startsWith("/compliance")
        ) {
          return true
        }

        // Require authentication for protected routes
        if (
          path.startsWith("/dashboard") ||
          path.startsWith("/reports") ||
          path.startsWith("/clients") ||
          path.startsWith("/settings") ||
          path.startsWith("/analytics") ||
          path.startsWith("/integrations") ||
          path.startsWith("/cost-libraries")
        ) {
          return !!token
        }

        // Default: allow access
        return true
      },
    },
  }
)

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/reports/:path*",
    "/clients/:path*",
    "/settings/:path*",
    "/analytics/:path*",
    "/integrations/:path*",
    "/cost-libraries/:path*",
  ]
}
