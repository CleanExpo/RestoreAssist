import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }


    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")
    const status = searchParams.get("status")
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "10")
    const skip = (page - 1) * limit

    const where: any = {
      userId: session.user.id
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { company: { contains: search, mode: "insensitive" } }
      ]
    }

    if (status) {
      where.status = status
    }

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        include: {
          reports: {
            select: {
              id: true,
              title: true,
              status: true,
              totalCost: true,
              createdAt: true
            },
            orderBy: { createdAt: "desc" }
          },
          _count: {
            select: { reports: true }
          }
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit
      }),
      prisma.client.count({ where })
    ])

    // Calculate client statistics
    const clientsWithStats = clients.map(client => {
      const totalRevenue = client.reports.reduce((sum, report) => sum + (report.totalCost || 0), 0)
      const lastJob = client.reports.length > 0 ? client.reports[0].createdAt : null
      
      return {
        ...client,
        totalRevenue,
        lastJob: lastJob ? new Date(lastJob).toLocaleDateString() : "Never",
        reportsCount: client._count.reports
      }
    })

    return NextResponse.json({
      clients: clientsWithStats,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error("Error fetching clients:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if user has active subscription
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { subscriptionStatus: true }
    })

    if (!user || user.subscriptionStatus !== 'ACTIVE') {
      return NextResponse.json(
        { 
          error: "Upgrade required", 
          upgradeRequired: true,
          message: "You need an active subscription (Monthly or Yearly plan) to create clients."
        },
        { status: 402 }
      )
    }

    const body = await request.json()
    const { name, email, phone, address, company, contactPerson, notes, status } = body

    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 })
    }

    // Check if client with same email already exists for this user
    const existingClient = await prisma.client.findFirst({
      where: {
        email,
        userId: session.user.id
      }
    })

    if (existingClient) {
      return NextResponse.json({ error: "Client with this email already exists" }, { status: 400 })
    }

    const client = await prisma.client.create({
      data: {
        name,
        email,
        phone,
        address,
        company,
        contactPerson,
        notes,
        status: status || "ACTIVE",
        userId: session.user.id
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
      reportsCount: 0
    })
  } catch (error) {
    console.error("Error creating client:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
