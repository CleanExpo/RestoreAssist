import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationOwner } from "@/lib/organization-credits"

/**
 * GET /api/reports/:id/authority-forms
 * Get all authority forms for a report
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

    const { id: reportId } = await params

    // Verify report access
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      select: {
        userId: true,
        assignedManagerId: true,
        assignedAdminId: true
      }
    })

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    // Check permissions
    if (
      report.userId !== session.user.id &&
      report.assignedManagerId !== session.user.id &&
      report.assignedAdminId !== session.user.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Fetch all authority forms for this report
    const forms = await prisma.authorityFormInstance.findMany({
      where: { reportId },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            code: true,
            description: true
          }
        },
        signatures: {
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { createdAt: "desc" }
    })

    return NextResponse.json({ forms })
  } catch (error) {
    console.error("Error fetching authority forms:", error)
    return NextResponse.json(
      { error: "Failed to fetch authority forms" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/reports/:id/authority-forms
 * Create a new authority form instance for a report
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

    const { id: reportId } = await params
    const body = await request.json()
    const { templateId, authorityDescription, signatoryRoles } = body

    if (!templateId) {
      return NextResponse.json(
        { error: "Template ID is required" },
        { status: 400 }
      )
    }

    // Verify report access
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      include: {
        user: {
          select: {
            businessName: true,
            businessLogo: true,
            businessABN: true,
            businessPhone: true,
            businessEmail: true,
            businessAddress: true
          }
        }
      }
    })

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 })
    }

    // Check permissions
    if (
      report.userId !== session.user.id &&
      report.assignedManagerId !== session.user.id &&
      report.assignedAdminId !== session.user.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Get Admin's business info (for team members, use Admin's info)
    let businessInfo = {
      businessName: report.user.businessName || "",
      businessLogo: report.user.businessLogo || null,
      businessABN: report.user.businessABN || null,
      businessPhone: report.user.businessPhone || null,
      businessEmail: report.user.businessEmail || null,
      businessAddress: report.user.businessAddress || null
    }

    // For team members, get Admin's business info
    if (session.user.role === "MANAGER" || session.user.role === "USER") {
      const ownerId = await getOrganizationOwner(session.user.id)
      if (ownerId) {
        const owner = await prisma.user.findUnique({
          where: { id: ownerId },
          select: {
            businessName: true,
            businessLogo: true,
            businessABN: true,
            businessPhone: true,
            businessEmail: true,
            businessAddress: true
          }
        })
        if (owner) {
          businessInfo = {
            businessName: owner.businessName || "",
            businessLogo: owner.businessLogo || null,
            businessABN: owner.businessABN || null,
            businessPhone: owner.businessPhone || null,
            businessEmail: owner.businessEmail || null,
            businessAddress: owner.businessAddress || null
          }
        }
      }
    }

    // Extract incident brief from technician field report (first 300 chars)
    const incidentBrief = report.technicianFieldReport
      ? report.technicianFieldReport.substring(0, 300) + (report.technicianFieldReport.length > 300 ? "..." : "")
      : null

    // Create authority form instance
    const formInstance = await prisma.authorityFormInstance.create({
      data: {
        templateId,
        reportId,
        companyName: businessInfo.businessName,
        companyLogo: businessInfo.businessLogo,
        companyABN: businessInfo.businessABN,
        companyPhone: businessInfo.businessPhone,
        companyEmail: businessInfo.businessEmail,
        companyAddress: businessInfo.businessAddress,
        companyWebsite: businessInfo.businessEmail 
          ? `www.${businessInfo.businessEmail.split('@')[1]}` 
          : null,
        clientName: report.clientName,
        clientAddress: report.propertyAddress,
        incidentBrief,
        incidentDate: report.incidentDate,
        authorityDescription: authorityDescription || "As per inspection report and scope of works",
        status: "DRAFT"
      },
      include: {
        template: true
      }
    })

    // Create signature placeholders for required signatories
    if (signatoryRoles && Array.isArray(signatoryRoles)) {
      const signatureData = signatoryRoles.map((role: string, index: number) => ({
        instanceId: formInstance.id,
        signatoryName: role === "CLIENT" ? report.clientName : "",
        signatoryRole: role as any,
        signatoryEmail: role === "CLIENT" ? report.clientContactDetails?.match(/[\w\.-]+@[\w\.-]+\.\w+/)?.[0] || null : null
      }))

      await prisma.authorityFormSignature.createMany({
        data: signatureData
      })
    } else {
      // Default: Create signature for client
      await prisma.authorityFormSignature.create({
        data: {
          instanceId: formInstance.id,
          signatoryName: report.clientName,
          signatoryRole: "CLIENT",
          signatoryEmail: report.clientContactDetails?.match(/[\w\.-]+@[\w\.-]+\.\w+/)?.[0] || null
        }
      })
    }

    // Fetch the complete form with signatures
    const completeForm = await prisma.authorityFormInstance.findUnique({
      where: { id: formInstance.id },
      include: {
        template: true,
        signatures: true
      }
    })

    return NextResponse.json({ form: completeForm })
  } catch (error) {
    console.error("Error creating authority form:", error)
    return NextResponse.json(
      { error: "Failed to create authority form" },
      { status: 500 }
    )
  }
}
