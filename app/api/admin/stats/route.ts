import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get current date for this month's reports
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    // Get 30 days ago for active users
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // Fetch stats in parallel
    const [
      totalUsers,
      activeUsers,
      totalOrganizations,
      activeSubscriptions,
      totalReports,
      reportsThisMonth,
      dbHealth,
    ] = await Promise.all([
      // Total users
      prisma.user.count(),

      // Active users (updated in last 30 days)
      prisma.user.count({
        where: {
          updatedAt: { gte: thirtyDaysAgo },
        },
      }),

      // Total organizations
      prisma.organization.count(),

      // Active subscriptions
      prisma.user.count({
        where: {
          subscriptionStatus: 'ACTIVE',
        },
      }),

      // Total reports
      prisma.report.count(),

      // Reports this month
      prisma.report.count({
        where: {
          createdAt: { gte: startOfMonth },
        },
      }),

      // Database health check
      prisma.$queryRaw`SELECT 1 as health`.then(() => 'healthy' as const).catch(() => 'down' as const),
    ])

    return NextResponse.json({
      totalUsers,
      activeUsers,
      totalOrganizations,
      activeSubscriptions,
      totalReports,
      reportsThisMonth,
      systemHealth: {
        database: dbHealth,
        api: 'healthy' as const,
        integrations: 'healthy' as const,
      },
    })
  } catch (error) {
    console.error('Error fetching admin stats:', error)
    return NextResponse.json(
      { error: 'Failed to fetch admin stats' },
      { status: 500 }
    )
  }
}
