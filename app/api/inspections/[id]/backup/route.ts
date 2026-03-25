import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { backupInspectionToDrive, getDriveBackupToken } from "@/lib/google-drive-backup"

type RouteContext = { params: Promise<{ id: string }> }

// GET — check backup status for an inspection
export async function GET(_req: NextRequest, context: RouteContext) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params

  const inspection = await prisma.inspection.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, inspectionNumber: true },
  })
  if (!inspection) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const token = await getDriveBackupToken(session.user.id)
  return NextResponse.json({
    driveConnected: !!token,
    inspectionId: id,
  })
}

// POST — trigger backup for an inspection
export async function POST(_req: NextRequest, context: RouteContext) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params

  const inspection = await prisma.inspection.findFirst({
    where: { id, userId: session.user.id },
    include: {
      environmentalData: true,
      moistureReadings: true,
      affectedAreas: true,
      scopeItems: true,
      classifications: true,
    },
  })
  if (!inspection) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const token = await getDriveBackupToken(session.user.id)
  if (!token) {
    return NextResponse.json(
      { error: "Google Drive not connected. Add it in Settings → Integrations." },
      { status: 400 }
    )
  }

  const result = await backupInspectionToDrive(token, inspection as Record<string, unknown> & { id: string; inspectionNumber: string })

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    folderId: result.folderId,
    fileId: result.fileId,
  })
}
