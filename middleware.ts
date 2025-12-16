import { withAuth } from "next-auth/middleware"

export default withAuth(
  function middleware(req) {
    // Log API requests (with error handling to prevent crashes)
    if (req.nextUrl.pathname.startsWith('/api/')) {
      try {
        // Dynamic import to prevent middleware initialization errors
        const { logger } = require("@/lib/logger")
        const userId = req.nextauth?.token?.sub || 'anonymous'
        logger.apiRequest(
          req.method || 'GET',
          req.nextUrl.pathname,
          userId,
          {
            query: Object.fromEntries(req.nextUrl.searchParams),
            userAgent: req.headers.get('user-agent') || undefined,
            ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined
          }
        )
      } catch (error) {
        // Silently fail - don't break the request if logging fails
        console.error('[Middleware] Logging error:', error)
      }
    }
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Allow access to public routes
        if (req.nextUrl.pathname.startsWith("/login") || 
            req.nextUrl.pathname.startsWith("/signup") ||
            req.nextUrl.pathname === "/" ||
            req.nextUrl.pathname.startsWith("/api/auth") ||
            req.nextUrl.pathname.startsWith("/_next") ||
            req.nextUrl.pathname.startsWith("/favicon")) {
          return true
        }
        
        // Require authentication for protected routes
        if (req.nextUrl.pathname.startsWith("/dashboard")) {
          return !!token
        }
        
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
    "/help/:path*"
  ]
}
