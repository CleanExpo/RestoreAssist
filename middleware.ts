import { withAuth } from "next-auth/middleware"

export default withAuth(
  function middleware(req) {
    // Add any additional middleware logic here
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
