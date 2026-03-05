import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { PrismaClient } from "@prisma/client"
import { sanitizeString } from "@/lib/sanitize"

const prisma = new PrismaClient()

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

    const client = await prisma.client.findFirst({
      where: {
        id,
        userId: session.user.id
      },
      include: {
        reports: {
          select: {
            id: true,
            title: true,
            status: true,
            totalCost: true,
            createdAt: true,
            updatedAt: true,
            reportNumber: true,
            waterCategory: true,
            waterClass: true,
            affectedArea: true
          },
          orderBy: { createdAt: "desc" }
        },
        _count: {
          select: { reports: true }
        }
      }
    })

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 })
    }

    // Calculate client statistics
    const totalRevenue = client.reports.reduce((sum, report) => sum + (report.totalCost || 0), 0)
    const lastJob = client.reports.length > 0 ? client.reports[0].createdAt : null
    
    return NextResponse.json({
      ...client,
      totalRevenue,
      lastJob: lastJob ? new Date(lastJob).toLocaleDateString() : "Never",
      reportsCount: client._count.reports
    })
  } catch (error) {
    console.error("Error fetching client:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

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
    const name = sanitizeString(body.name, 200)
    const email = sanitizeString(body.email, 320).toLowerCase()
    const phone = sanitizeString(body.phone, 50)
    const address = sanitizeString(body.address, 500)
    const company = sanitizeString(body.company, 200)
    const contactPerson = sanitizeString(body.contactPerson, 200)
    const notes = sanitizeString(body.notes, 5000)
    const status = body.status

    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 })
    }

    // Check if client exists and belongs to user
    const existingClient = await prisma.client.findFirst({
      where: {
        id,
        userId: session.user.id
      }
    })

    if (!existingClient) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 })
    }

    // Check if email is being changed and if it conflicts with another client
    if (email !== existingClient.email) {
      const emailConflict = await prisma.client.findFirst({
        where: {
          email,
          userId: session.user.id,
          id: { not: id }
        }
      })

      if (emailConflict) {
        return NextResponse.json({ error: "Client with this email already exists" }, { status: 400 })
      }
    }

    const client = await prisma.client.update({
      where: { id },
      data: {
        name,
        email,
        phone,
        address,
        company,
        contactPerson,
        notes,
        status
      },
      include: {
        _count: {
          select: { reports: true }
        }
      }
    })

    return NextResponse.json({
      ...client,
      totalRevenue: 0,
      lastJob: "Never",
      reportsCount: client._count.reports
    })
  } catch (error) {
    console.error("Error updating client:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

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

    // Check if client exists and belongs to user
    const existingClient = await prisma.client.findFirst({
      where: {
        id,
        userId: session.user.id
      }
    })

    if (!existingClient) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 })
    }

    // Check if client has reports
    const reportCount = await prisma.report.count({
      where: { clientId: id }
    })

    if (reportCount > 0) {
      return NextResponse.json({ 
        error: "Cannot delete client with existing reports. Please archive instead." 
      }, { status: 400 })
    }

    await prisma.client.delete({
      where: { id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting client:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
