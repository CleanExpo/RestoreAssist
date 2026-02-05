import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canCreateReport } from "@/lib/report-limits"
import { getAnthropicApiKey } from "@/lib/ai-provider"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let hasApiKey = false
    try {
      await getAnthropicApiKey(session.user.id)
      hasApiKey = true
    } catch {
      // No API key configured
    }

    const result = await canCreateReport(session.user.id)

    return NextResponse.json({
      canCreate: result.allowed,
      reason: result.reason,
      hasApiKey,
    })
  } catch (error) {
    console.error("Error checking credits:", error)
    return NextResponse.json(
      { error: "Failed to check credits", canCreate: false, hasApiKey: false },
      { status: 500 }
    )
  }
}
