import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * POST /api/authority-forms/:id/signatures
 * Add a signature to an authority form
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: formId } = await params
    const body = await request.json()
    const { signatureId, signatureData, signatoryName } = body

    if (!signatureId || !signatureData) {
      return NextResponse.json(
        { error: "Signature ID and signature data are required" },
        { status: 400 }
      )
    }

    // Verify form exists and user has access
    const form = await prisma.authorityFormInstance.findUnique({
      where: { id: formId },
      include: {
        report: {
          select: {
            userId: true,
            assignedManagerId: true,
            assignedAdminId: true
          }
        }
      }
    })

    if (!form) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 })
    }

    // Check permissions
    if (
      form.report.userId !== session.user.id &&
      form.report.assignedManagerId !== session.user.id &&
      form.report.assignedAdminId !== session.user.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Get client IP and user agent for verification
    const ipAddress = request.headers.get("x-forwarded-for") || 
                     request.headers.get("x-real-ip") || 
                     "unknown"
    const userAgent = request.headers.get("user-agent") || "unknown"

    // Update signature
    const signature = await prisma.authorityFormSignature.update({
      where: { id: signatureId },
      data: {
        signatureData,
        signatoryName: signatoryName || undefined,
        signedAt: new Date(),
        ipAddress,
        userAgent
      }
    })

    // Check if all signatures are complete
    const allSignatures = await prisma.authorityFormSignature.findMany({
      where: { instanceId: formId }
    })

    const allSigned = allSignatures.every(sig => sig.signedAt !== null)

    // Update form status if all signatures are complete
    if (allSigned) {
      await prisma.authorityFormInstance.update({
        where: { id: formId },
        data: {
          status: "COMPLETED",
          completedAt: new Date()
        }
      })
    } else {
      // Update to partially signed if at least one signature exists
      const hasAnySignature = allSignatures.some(sig => sig.signedAt !== null)
      if (hasAnySignature && form.status === "DRAFT") {
        await prisma.authorityFormInstance.update({
          where: { id: formId },
          data: { status: "PARTIALLY_SIGNED" }
        })
      }
    }

    return NextResponse.json({ signature, allSigned })
  } catch (error) {
    console.error("Error adding signature:", error)
    return NextResponse.json(
      { error: "Failed to add signature" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/authority-forms/:id/signatures
 * Get all signatures for an authority form
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: formId } = await params

    // Verify form exists and user has access
    const form = await prisma.authorityFormInstance.findUnique({
      where: { id: formId },
      include: {
        report: {
          select: {
            userId: true,
            assignedManagerId: true,
            assignedAdminId: true
          }
        }
      }
    })

    if (!form) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 })
    }

    // Check permissions
    if (
      form.report.userId !== session.user.id &&
      form.report.assignedManagerId !== session.user.id &&
      form.report.assignedAdminId !== session.user.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const signatures = await prisma.authorityFormSignature.findMany({
      where: { instanceId: formId },
      orderBy: { createdAt: "asc" }
    })

    return NextResponse.json({ signatures })
  } catch (error) {
    console.error("Error fetching signatures:", error)
    return NextResponse.json(
      { error: "Failed to fetch signatures" },
      { status: 500 }
    )
  }
}
