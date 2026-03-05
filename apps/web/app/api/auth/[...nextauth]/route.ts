import NextAuth from "next-auth"
import { authOptions } from "@/lib/auth"

// Fix for Next.js 13+ App Router with NextAuth
// Export handlers directly to avoid webpack chunk loading issues
const handler = NextAuth(authOptions)

export const GET = handler
export const POST = handler
