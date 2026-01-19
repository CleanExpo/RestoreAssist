import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { canCreateReport } from "@/lib/report-limits"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await canCreateReport(session.user.id)
    
    return NextResponse.json({ 
      canCreate: result.allowed,
      reason: result.reason 
    })
  } catch (error) {
    console.error("Error checking credits:", error)
    return NextResponse.json(
      { error: "Failed to check credits", canCreate: false },
      { status: 500 }
    )
  }
}
