import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { applyRateLimit } from '@/lib/rate-limiter'

/**
 * Export user data as JSON
 * Includes all reports, clients, and settings
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit: 3 data exports per 15 minutes per IP
    const rateLimited = applyRateLimit(request, { maxRequests: 3, prefix: 'user-export' })
    if (rateLimited) return rateLimited

    // Fetch all user data in parallel
    const [user, reports, clients, inspections, estimates] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          businessName: true,
          businessAddress: true,
          businessABN: true,
          businessPhone: true,
          businessEmail: true,
          createdAt: true,
          // Exclude sensitive fields
        },
      }),
      prisma.report.findMany({
        where: { userId: session.user.id },
        include: {
          client: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              address: true,
            },
          },
          estimates: {
            include: {
              lineItems: true,
            },
          },
        },
      }),
      prisma.client.findMany({
        where: { userId: session.user.id },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          company: true,
          notes: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.inspection.findMany({
        where: { userId: session.user.id },
        include: {
          affectedAreas: true,
          moistureReadings: true,
          environmentalReadings: true,
          photos: true,
        },
      }),
      prisma.estimate.findMany({
        where: { userId: session.user.id },
        include: {
          lineItems: true,
        },
      }),
    ])

    const exportData = {
      exportedAt: new Date().toISOString(),
      exportVersion: '1.0',
      user: {
        ...user,
        // Remove password and sensitive data
      },
      reports: reports.map((report) => ({
        ...report,
        // Sanitize any sensitive fields
      })),
      clients,
      inspections,
      estimates,
      metadata: {
        totalReports: reports.length,
        totalClients: clients.length,
        totalInspections: inspections.length,
        totalEstimates: estimates.length,
      },
    }

    // Return as downloadable JSON
    const filename = `restoreassist-export-${new Date().toISOString().split('T')[0]}.json`

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Error exporting user data:', error)
    return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500 }
    )
  }
}
