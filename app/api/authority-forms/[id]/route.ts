import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/authority-forms/:id
 * Get a specific authority form instance
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

    const { id } = await params

    const form = await prisma.authorityFormInstance.findUnique({
      where: { id },
      include: {
        template: true,
        signatures: {
          orderBy: { createdAt: "asc" }
        },
        report: {
          select: {
            id: true,
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

    return NextResponse.json({ form })
  } catch (error) {
    console.error("Error fetching authority form:", error)
    return NextResponse.json(
      { error: "Failed to fetch authority form" },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/authority-forms/:id
 * Update an authority form instance
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()

    // Verify form exists and user has access
    const existingForm = await prisma.authorityFormInstance.findUnique({
      where: { id },
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

    if (!existingForm) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 })
    }

    // Check permissions
    if (
      existingForm.report.userId !== session.user.id &&
      existingForm.report.assignedManagerId !== session.user.id &&
      existingForm.report.assignedAdminId !== session.user.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Update form
    const updateData: any = {}
    if (body.authorityDescription !== undefined) {
      updateData.authorityDescription = body.authorityDescription
    }
    if (body.status !== undefined) {
      updateData.status = body.status
    }

    const updatedForm = await prisma.authorityFormInstance.update({
      where: { id },
      data: updateData,
      include: {
        template: true,
        signatures: true
      }
    })

    return NextResponse.json({ form: updatedForm })
  } catch (error) {
    console.error("Error updating authority form:", error)
    return NextResponse.json(
      { error: "Failed to update authority form" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/authority-forms/:id
 * Delete an authority form instance
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    // Verify form exists and user has access
    const existingForm = await prisma.authorityFormInstance.findUnique({
      where: { id },
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

    if (!existingForm) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 })
    }

    // Check permissions
    if (
      existingForm.report.userId !== session.user.id &&
      existingForm.report.assignedManagerId !== session.user.id &&
      existingForm.report.assignedAdminId !== session.user.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Delete form (signatures will be cascade deleted)
    await prisma.authorityFormInstance.delete({
      where: { id }
    })

    return NextResponse.json({ message: "Form deleted successfully" })
  } catch (error) {
    console.error("Error deleting authority form:", error)
    return NextResponse.json(
      { error: "Failed to delete authority form" },
      { status: 500 }
    )
  }
}
