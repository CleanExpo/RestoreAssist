import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { generateDetailedReport } from "@/lib/anthropic"

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const reportData = await request.json()

    if (!reportData) {
      return NextResponse.json({ error: "Report data is required" }, { status: 400 })
    }

    // Generate detailed report using Anthropic API
    const detailedReport = await generateDetailedReport(reportData)

    return NextResponse.json({ 
      success: true,
      detailedReport: detailedReport
    })

  } catch (error) {
    console.error("Error generating detailed report:", error)
    return NextResponse.json({ 
      error: "Failed to generate detailed report",
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
