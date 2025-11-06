import NextAuth from "next-auth"
import { authOptions } from "@/lib/auth"
import { NextRequest } from "next/server"

console.log('[NextAuth Route] Initializing NextAuth handler')

const handler = NextAuth(authOptions)

// Wrap handlers to add logging
const wrappedGET = async (req: NextRequest, ...args: any[]) => {
  console.log('[NextAuth GET]', req.method, req.url)
  return handler(req, ...args)
}

const wrappedPOST = async (req: NextRequest, ...args: any[]) => {
  console.log('[NextAuth POST]', req.method, req.url)
  const url = new URL(req.url)
  console.log('[NextAuth POST] Path:', url.pathname)
  return handler(req, ...args)
}

export { wrappedGET as GET, wrappedPOST as POST }
