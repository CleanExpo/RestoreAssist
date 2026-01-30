import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const where = { userId: session.user.id }

    // Calculate date ranges
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    // Fetch all required data in parallel
    const [
      allInvoices,
      paidThisMonth,
      overdueByDate
    ] = await Promise.all([
      // All invoices for total revenue, outstanding, and draft total
      prisma.invoice.findMany({
        where,
        select: {
          status: true,
          totalIncGST: true,
          amountDue: true,
          amountPaid: true,
          dueDate: true
        }
      }),
      // Invoices paid this month
      prisma.invoice.findMany({
        where: {
          ...where,
          status: 'PAID',
          paidDate: {
            gte: firstDayOfMonth,
            lte: lastDayOfMonth
          }
        },
        select: {
          totalIncGST: true
        }
      }),
      // Overdue: due date in the past, amount due > 0, not PAID/CANCELLED/DRAFT
      prisma.invoice.findMany({
        where: {
          ...where,
          dueDate: { lt: startOfToday },
          amountDue: { gt: 0 },
          status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'] }
        },
        select: {
          amountDue: true
        }
      })
    ])

    // Calculate metrics from all invoices
    let totalRevenue = 0
    let outstanding = 0
    let draftTotal = 0

    for (const invoice of allInvoices) {
      // Total revenue: all issued/sent invoices (exclude DRAFT and CANCELLED)
      if (invoice.status !== 'DRAFT' && invoice.status !== 'CANCELLED') {
        totalRevenue += invoice.totalIncGST
      }

      // Outstanding: sent/active invoices with amount due
      if (['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status)) {
        outstanding += invoice.amountDue
      }

      // Draft total: sum of draft invoice amounts (so stats reflect real data)
      if (invoice.status === 'DRAFT') {
        draftTotal += invoice.totalIncGST
      }
    }

    const overdue = overdueByDate.reduce((sum, inv) => sum + inv.amountDue, 0)
    const paidThisMonthTotal = paidThisMonth.reduce((sum, inv) => sum + inv.totalIncGST, 0)

    // Count invoices by status
    const statusCounts = allInvoices.reduce((acc, inv) => {
      acc[inv.status] = (acc[inv.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Calculate monthly revenue for the last 12 months
    const monthlyRevenue = await prisma.$queryRaw<Array<{ month: string; revenue: bigint; count: bigint }>>`
      SELECT
        TO_CHAR(DATE_TRUNC('month', "invoiceDate"), 'YYYY-MM') as month,
        SUM("totalIncGST") as revenue,
        COUNT(*) as count
      FROM "Invoice"
      WHERE "userId" = ${session.user.id}
        AND "status" != 'DRAFT'
        AND "status" != 'CANCELLED'
        AND "invoiceDate" >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', "invoiceDate")
      ORDER BY month DESC
    `

    // Convert BigInt to Number for JSON serialization
    const monthlyRevenueFormatted = monthlyRevenue.map(row => ({
      month: row.month,
      revenue: Number(row.revenue),
      count: Number(row.count)
    }))

    return NextResponse.json({
      stats: {
        totalRevenue,
        outstanding,
        overdue,
        paidThisMonth: paidThisMonthTotal,
        draftTotal
      },
      statusCounts,
      monthlyRevenue: monthlyRevenueFormatted
    })
  } catch (error: any) {
    console.error('Error fetching invoice analytics:', error)
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}
