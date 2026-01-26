import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/authority-forms/sign/:token
 * Public endpoint — looks up signing token, returns form data + signatory info
 * No auth required (token-based access)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 })
    }

    const signature = await prisma.authorityFormSignature.findUnique({
      where: { signatureRequestToken: token },
      include: {
        instance: {
          include: {
            template: { select: { name: true, code: true } },
            signatures: {
              select: {
                id: true,
                signatoryName: true,
                signatoryRole: true,
                signedAt: true,
              },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    })

    if (!signature) {
      return NextResponse.json(
        { error: "Invalid or expired signing link" },
        { status: 404 }
      )
    }

    if (signature.signedAt) {
      return NextResponse.json(
        { error: "already_signed", message: "This form has already been signed" },
        { status: 400 }
      )
    }

    const form = signature.instance

    return NextResponse.json({
      signatory: {
        id: signature.id,
        name: signature.signatoryName,
        role: signature.signatoryRole,
        email: signature.signatoryEmail,
      },
      form: {
        id: form.id,
        templateName: form.template.name,
        templateCode: form.template.code,
        companyName: form.companyName,
        companyLogo: form.companyLogo,
        companyPhone: form.companyPhone,
        companyEmail: form.companyEmail,
        clientName: form.clientName,
        clientAddress: form.clientAddress,
        incidentBrief: form.incidentBrief,
        incidentDate: form.incidentDate,
        authorityDescription: form.authorityDescription,
        status: form.status,
        signatures: form.signatures,
      },
    })
  } catch (error: any) {
    console.error("[Sign Token GET] Error:", error)
    return NextResponse.json(
      { error: "Failed to load signing page" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/authority-forms/sign/:token
 * Public endpoint — submit a signature via token
 * Saves signature data, IP, user agent, marks signedAt
 * Auto-updates form status if all signatures complete
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const body = await request.json()
    const { signatureData, signatoryName } = body

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 })
    }

    if (!signatureData) {
      return NextResponse.json(
        { error: "Signature data is required" },
        { status: 400 }
      )
    }

    // Look up the signature record
    const signature = await prisma.authorityFormSignature.findUnique({
      where: { signatureRequestToken: token },
    })

    if (!signature) {
      return NextResponse.json(
        { error: "Invalid or expired signing link" },
        { status: 404 }
      )
    }

    if (signature.signedAt) {
      return NextResponse.json(
        { error: "This form has already been signed" },
        { status: 400 }
      )
    }

    // Capture verification data
    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown"
    const userAgent = request.headers.get("user-agent") || "unknown"

    // Save the signature
    const updated = await prisma.authorityFormSignature.update({
      where: { id: signature.id },
      data: {
        signatureData,
        signatoryName: signatoryName || signature.signatoryName,
        signedAt: new Date(),
        ipAddress,
        userAgent,
      },
    })

    // Check if all signatures for this form are now complete
    const allSignatures = await prisma.authorityFormSignature.findMany({
      where: { instanceId: signature.instanceId },
    })

    const allSigned = allSignatures.every((sig) => sig.signedAt !== null)

    if (allSigned) {
      await prisma.authorityFormInstance.update({
        where: { id: signature.instanceId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
        },
      })
    } else {
      // Update to PARTIALLY_SIGNED if not already
      const form = await prisma.authorityFormInstance.findUnique({
        where: { id: signature.instanceId },
        select: { status: true },
      })

      if (form && form.status !== "PARTIALLY_SIGNED" && form.status !== "COMPLETED") {
        await prisma.authorityFormInstance.update({
          where: { id: signature.instanceId },
          data: { status: "PARTIALLY_SIGNED" },
        })
      }
    }

    return NextResponse.json({
      success: true,
      allSigned,
      formId: signature.instanceId,
    })
  } catch (error: any) {
    console.error("[Sign Token POST] Error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to submit signature" },
      { status: 500 }
    )
  }
}
