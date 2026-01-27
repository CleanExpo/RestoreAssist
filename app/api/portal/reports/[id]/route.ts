import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/portal/reports/[id] - Get single report for logged-in client
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id || session.user.userType !== 'client') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const clientId = session.user.clientId

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID not found' }, { status: 400 })
    }

    const reportId = params.id

    // Fetch report - verify it belongs to this client
    const report = await prisma.report.findFirst({
      where: {
        id: reportId,
        clientId,
      },
      include: {
        client: {
          select: {
            name: true,
            email: true,
            phone: true,
          }
        },
        user: {
          select: {
            name: true,
            businessName: true,
            businessPhone: true,
            businessEmail: true,
          }
        },
        approvals: {
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    })

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    return NextResponse.json({ report })
  } catch (error) {
    console.error('Error fetching report:', error)
    return NextResponse.json(
      { error: 'Failed to fetch report' },
      { status: 500 }
    )
  }
}
