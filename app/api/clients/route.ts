import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { PrismaClient } from "@prisma/client"
import { sanitizeString } from "@/lib/sanitize"

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

    // Also get clients from reports that don't have a Client record yet
    // Fetch all reports without clientId and filter for non-null clientName in JavaScript
    const allReportsWithoutClientId = await prisma.report.findMany({
      where: {
        userId: session.user.id,
        clientId: null
      },
      select: {
        clientName: true,
        clientContactDetails: true,
        propertyAddress: true,
        createdAt: true,
        id: true,
        totalCost: true,
        equipmentCostTotal: true,
        costEstimationData: true,
        estimates: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            totalIncGST: true
          }
        }
      }
    })
    
    // Filter for reports with non-null clientName
    const reportsWithoutClients = allReportsWithoutClientId.filter(r => r.clientName !== null && r.clientName.trim() !== '')

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
              equipmentCostTotal: true,
              costEstimationData: true,
              createdAt: true,
              estimates: {
                take: 1,
                orderBy: { createdAt: "desc" },
                select: {
                  totalIncGST: true
                }
              }
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

    // Helper to calculate cost with fallbacks
    const getReportCost = (report: any) => {
      // Priority: estimates[0].totalIncGST > equipmentCostTotal > totalCost > costEstimationData
      if (report.estimates?.[0]?.totalIncGST) {
        return report.estimates[0].totalIncGST
      }
      if (report.equipmentCostTotal) {
        return report.equipmentCostTotal
      }
      if (report.totalCost) {
        return report.totalCost
      }
      if (report.costEstimationData) {
        try {
          const parsed = typeof report.costEstimationData === 'string'
            ? JSON.parse(report.costEstimationData)
            : report.costEstimationData
          if (parsed?.totals?.totalIncGST) return parsed.totals.totalIncGST
        } catch (e) {
          // ignore
        }
      }
      return 0
    }

    // Calculate client statistics
    const clientsWithStats = clients.map(client => {
      const totalRevenue = client.reports.reduce((sum, report) => sum + getReportCost(report), 0)
      const lastJob = client.reports.length > 0 ? client.reports[0].createdAt : null
      
      return {
        ...client,
        totalRevenue,
        lastJob: lastJob ? new Date(lastJob).toLocaleDateString() : "Never",
        reportsCount: client._count.reports
      }
    })

    // Get all reports for clients that don't have Client records (for accurate counting)
    // Fetch all reports without clientId and filter for non-null clientName in JavaScript
    const allReportsForReportClientsRaw = await prisma.report.findMany({
      where: {
        userId: session.user.id,
        clientId: null
      },
      select: {
        clientName: true,
        clientContactDetails: true,
        propertyAddress: true,
        createdAt: true,
        id: true,
        totalCost: true,
        equipmentCostTotal: true,
        costEstimationData: true,
        estimates: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            totalIncGST: true
          }
        }
      }
    })
    
    // Filter for reports with non-null clientName
    const allReportsForReportClients = allReportsForReportClientsRaw.filter(
      r => r.clientName !== null && r.clientName.trim() !== ''
    )

    // Group reports by client name
    const reportsByClientName = new Map<string, typeof allReportsForReportClients>()
    allReportsForReportClients.forEach(report => {
      if (report.clientName) {
        if (!reportsByClientName.has(report.clientName)) {
          reportsByClientName.set(report.clientName, [])
        }
        reportsByClientName.get(report.clientName)!.push(report)
      }
    })

    // Convert reports without clients to client-like objects
    const reportClients = Array.from(reportsByClientName.entries()).map(([clientName, reports]) => {
      // Use the most recent report for contact details
      const latestReport = reports.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0]

      // Extract email and phone from clientContactDetails
      let email = `${clientName.toLowerCase().replace(/\s+/g, '.')}@client.local`
      let phone = ''
      if (latestReport.clientContactDetails) {
        const emailMatch = latestReport.clientContactDetails.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i)
        if (emailMatch) email = emailMatch[1]
        const phoneMatch = latestReport.clientContactDetails.match(/(\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{1,4}[\s-]?\d{1,4}[\s-]?\d{1,9}/)
        if (phoneMatch) phone = phoneMatch[0].trim()
      }

      // Calculate stats for this client
      const reportCount = reports.length
      const totalRevenue = reports.reduce((sum, r) => sum + getReportCost(r), 0)
      const lastJob = reports[0]?.createdAt || latestReport.createdAt

      return {
        id: `report-${latestReport.id}`, // Temporary ID
        name: clientName,
        email,
        phone: phone || null,
        address: latestReport.propertyAddress || null,
        company: null,
        contactPerson: null,
        notes: null,
        status: 'ACTIVE',
        createdAt: latestReport.createdAt,
        updatedAt: latestReport.createdAt,
        userId: session.user.id,
        totalRevenue,
        lastJob: new Date(lastJob).toLocaleDateString(),
        reportsCount: reportCount,
        _isFromReport: true // Flag to indicate this came from a report
      }
    })

    // Combine and deduplicate (prefer actual Client records over report-based ones)
    const allClients = [...clientsWithStats]
    reportClients.forEach(reportClient => {
      // Only add if no client with same name or email exists
      const exists = allClients.some(c => 
        c.name === reportClient.name || c.email === reportClient.email
      )
      if (!exists) {
        allClients.push(reportClient)
      }
    })

    // Apply search filter to combined list if needed
    let filteredClients = allClients
    if (search) {
      const searchLower = search.toLowerCase()
      filteredClients = allClients.filter(client =>
        client.name.toLowerCase().includes(searchLower) ||
        client.email.toLowerCase().includes(searchLower) ||
        (client.phone && client.phone.includes(search)) ||
        (client.company && client.company.toLowerCase().includes(searchLower))
      )
    }

    if (status) {
      filteredClients = filteredClients.filter(client => client.status === status)
    }

    // Sort by creation date (newest first)
    filteredClients.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    // Apply pagination
    const paginatedClients = filteredClients.slice(skip, skip + limit)

    return NextResponse.json({
      clients: paginatedClients,
      pagination: {
        page,
        limit,
        total: filteredClients.length,
        pages: Math.ceil(filteredClients.length / limit)
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
    const name = sanitizeString(body.name, 200)
    const email = sanitizeString(body.email, 320)
    const phone = sanitizeString(body.phone, 30)
    const address = sanitizeString(body.address, 500)
    const company = sanitizeString(body.company, 200)
    const contactPerson = sanitizeString(body.contactPerson, 200)
    const notes = sanitizeString(body.notes, 2000)
    const { status } = body

    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 })
    }

    // Check if client with same email or name already exists for this user
    const existingClient = await prisma.client.findFirst({
      where: {
        userId: session.user.id,
        OR: [
          { email },
          { name }
        ]
      }
    })

    if (existingClient) {
      return NextResponse.json({ error: "Client with this email or name already exists" }, { status: 400 })
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

    // Link any existing reports with matching client name to this new client
    try {
      await prisma.report.updateMany({
        where: {
          userId: session.user.id,
          clientId: null,
          clientName: name
        },
        data: {
          clientId: client.id
        }
      })
    } catch (error) {
      console.error('Error linking reports to client:', error)
      // Don't fail client creation if linking fails
    }

    // Get updated client with linked reports
    const updatedClient = await prisma.client.findUnique({
      where: { id: client.id },
      include: {
        reports: {
            select: {
              id: true,
              title: true,
              status: true,
              totalCost: true,
              equipmentCostTotal: true,
              costEstimationData: true,
              createdAt: true,
              estimates: {
                take: 1,
                orderBy: { createdAt: "desc" },
                select: {
                  totalIncGST: true
                }
              }
            },
            orderBy: { createdAt: "desc" }
          },
        _count: {
          select: { reports: true }
        }
      }
    })

    if (!updatedClient) {
    return NextResponse.json({
      ...client,
      totalRevenue: 0,
      lastJob: "Never",
      reportsCount: 0
      })
    }

    const totalRevenue = updatedClient.reports.reduce((sum, report) => {
      // Priority: estimates[0].totalIncGST > equipmentCostTotal > totalCost > costEstimationData
      let cost = 0
      if (report.estimates?.[0]?.totalIncGST) {
        cost = report.estimates[0].totalIncGST
      } else if (report.equipmentCostTotal) {
        cost = report.equipmentCostTotal
      } else if (report.totalCost) {
        cost = report.totalCost
      } else if (report.costEstimationData) {
        try {
          const costData = typeof report.costEstimationData === 'string' 
            ? JSON.parse(report.costEstimationData) 
            : report.costEstimationData
          if (costData?.totals?.totalIncGST) cost = costData.totals.totalIncGST
        } catch (e) {
          // Ignore parse errors
        }
      }
      return sum + cost
    }, 0)
    const lastJob = updatedClient.reports.length > 0 ? updatedClient.reports[0].createdAt : null

    return NextResponse.json({
      ...updatedClient,
      totalRevenue,
      lastJob: lastJob ? new Date(lastJob).toLocaleDateString() : "Never",
      reportsCount: updatedClient._count.reports
    })
  } catch (error) {
    console.error("Error creating client:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
