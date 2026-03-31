import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; readingId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { id, readingId } = await params
    // Verify inspection belongs to user
    const inspection = await prisma.inspection.findFirst({
      where: { id, userId: session.user.id }
    })
    if (!inspection) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    await prisma.moistureReading.delete({ where: { id: readingId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE moisture reading]', error)
    return NextResponse.json({ error: "Failed to delete reading" }, { status: 500 })
  }
}
