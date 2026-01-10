import { NextResponse } from "next/server"

export async function GET() {
  const dbUrl = process.env.DATABASE_URL || "NOT SET"
  const directUrl = process.env.DIRECT_URL || "NOT SET"

  // Mask the password for security
  const maskUrl = (url: string) => {
    if (url === "NOT SET") return url
    return url.replace(/:[^@]+@/, ":***@")
  }

  return NextResponse.json({
    database_url: maskUrl(dbUrl),
    direct_url: maskUrl(directUrl),
    node_env: process.env.NODE_ENV,
    vercel_env: process.env.VERCEL_ENV,
  })
}
