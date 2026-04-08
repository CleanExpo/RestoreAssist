/**
 * POST /api/inspections/[id]/sign
 *
 * Captures e-signature sign-off for an inspection (RA-269).
 * Under the Australian Electronic Transactions Act 1999, a typed name + intent
 * constitutes a valid electronic signature.
 *
 * Body: {
 *   signatoryName: string   // Full name of person signing
 *   signatureUrl?: string   // Optional Supabase Storage URL for drawn SVG/PNG signature
 *   role?: string           // e.g. "Lead Technician", "Site Supervisor"
 * }
 *
 * Returns: { signedAt, signedByName, signatureUrl }
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: inspectionId } = await params

    // Validate body before attempting atomic write
    const body = await request.json()
    const { signatoryName, signatureUrl, role } = body as {
      signatoryName?: string
      signatureUrl?: string
      role?: string
    }

    if (!signatoryName?.trim()) {
      return NextResponse.json(
        { error: "signatoryName is required" },
        { status: 400 }
      )
    }

    const displayName = role
      ? `${signatoryName.trim()} (${role.trim()})`
      : signatoryName.trim()

    const signedAt = new Date()

    // Atomic CAS — updateMany with signedAt: null prevents double-signature TOCTOU race
    const result = await prisma.inspection.updateMany({
      where: { id: inspectionId, userId: session.user.id, ...(({ signedAt: null } as any)) },
      data: {
        ...(({ signedAt, signedByName: displayName, signatureUrl: signatureUrl?.trim() || null, status: "SUBMITTED", submittedAt: signedAt }) as any),
      },
    })

    if (result.count === 0) {
      // Distinguish "not found" from "already signed" for correct HTTP status
      const exists = await prisma.inspection.findFirst({
        where: { id: inspectionId, userId: session.user.id },
        select: { id: true },
      })
      if (!exists) {
        return NextResponse.json({ error: "Inspection not found" }, { status: 404 })
      }
      return NextResponse.json(
        { error: "Inspection has already been signed. Contact admin to reset." },
        { status: 409 }
      )
    }

    return NextResponse.json({
      success: true,
      signedAt,
      signedByName: displayName,
      signatureUrl: signatureUrl?.trim() || null,
      status: "SUBMITTED",
    })
  } catch (error) {
    console.error("[inspections/sign POST]", error)
    return NextResponse.json(
      { error: "Failed to save signature" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/inspections/[id]/sign
 *
 * Resets the e-signature (admin-only). Allows re-signing after error.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: Admin access required to reset a signature" },
        { status: 403 }
      )
    }

    const { id: inspectionId } = await params

    await prisma.inspection.updateMany({
      where: { id: inspectionId },
      data: ({ signedAt: null, signedByName: null, signatureUrl: null } as any),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[inspections/sign DELETE]", error)
    return NextResponse.json(
      { error: "Failed to reset signature" },
      { status: 500 }
    )
  }
}
