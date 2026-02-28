import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
/**
 * GET: Return profile (business) + optional report data for auto-filling
 * the Restoration Tax Invoice. Query: ?reportId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const reportId = searchParams.get("reportId")

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        businessName: true,
        businessAddress: true,
        businessABN: true,
        businessPhone: true,
        businessEmail: true,
      },
    })

    const profile = {
      companyName: user?.businessName || "[Your Company Name Pty Ltd]",
      businessAddress: user?.businessAddress || "[Business Address, QLD]",
      abn: user?.businessABN || "XX XXX XXX XXX",
      phone: user?.businessPhone || "[Phone Number]",
      email: user?.businessEmail || "[Email Address]",
    }

    let report: {
      clientName: string
      propertyAddress: string
      clientContact?: string
      insurerName?: string
      claimReferenceNumber?: string
      incidentDate?: string
      waterCategory?: string
      waterClass?: string
      sourceOfWater?: string
      affectedArea?: string
      costEstimationData?: unknown
    } | null = null

    if (reportId) {
      const r = await prisma.report.findFirst({
        where: { id: reportId, userId: session.user.id },
        include: { client: true },
      })
      if (r) {
        report = {
          clientName: r.client?.name ?? r.clientName,
          propertyAddress: r.propertyAddress,
          clientContact: r.clientContact ?? undefined,
          insurerName: r.insurerName ?? undefined,
          claimReferenceNumber: r.claimReferenceNumber ?? undefined,
          incidentDate: r.incidentDate
            ? new Date(r.incidentDate).toISOString().slice(0, 10)
            : undefined,
          waterCategory: r.waterCategory ?? undefined,
          waterClass: r.waterClass ?? undefined,
          sourceOfWater: r.sourceOfWater ?? undefined,
          affectedArea: r.affectedArea != null ? String(r.affectedArea) : undefined,
          costEstimationData: r.costEstimationData
            ? (JSON.parse(r.costEstimationData) as unknown)
            : undefined,
        }
      }
    }

    const nextInvNum =
      (await prisma.restorationDocument
        .count({
          where: {
            userId: session.user.id,
            documentType: "RESTORATION_INVOICE",
          },
        })
        .then((c) => c + 1)) || 1
    const year = new Date().getFullYear()
    const suggestedInvoiceNumber = `INV-${year}-${String(nextInvNum).padStart(4, "0")}`

    const today = new Date().toISOString().slice(0, 10)
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 7)
    const dueDateStr = dueDate.toISOString().slice(0, 10)

    return NextResponse.json({
      profile,
      report,
      suggestedInvoiceNumber,
      defaultInvDate: today,
      defaultDueDate: dueDateStr,
    })
  } catch (error) {
    console.error("Error fetching restoration seed data:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
