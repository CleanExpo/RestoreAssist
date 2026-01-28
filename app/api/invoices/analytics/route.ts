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
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    // Fetch all required data in parallel
    const [
      allInvoices,
      paidThisMonth,
      overdueInvoices
    ] = await Promise.all([
      // All invoices for total revenue and outstanding
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
      // Overdue invoices
      prisma.invoice.findMany({
        where: {
          ...where,
          status: 'OVERDUE',
          amountDue: {
            gt: 0
          }
        },
        select: {
          amountDue: true
        }
      })
    ])

    // Calculate metrics
    let totalRevenue = 0
    let outstanding = 0

    for (const invoice of allInvoices) {
      // Total revenue includes all invoices except DRAFT and CANCELLED
      if (invoice.status !== 'DRAFT' && invoice.status !== 'CANCELLED') {
        totalRevenue += invoice.totalIncGST
      }

      // Outstanding includes SENT, VIEWED, PARTIALLY_PAID, OVERDUE
      if (['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status)) {
        outstanding += invoice.amountDue
      }
    }

    const overdue = overdueInvoices.reduce((sum, inv) => sum + inv.amountDue, 0)
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
        paidThisMonth: paidThisMonthTotal
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
