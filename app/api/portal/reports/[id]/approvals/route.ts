import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/portal/reports/[id]/approvals - Create or update approval
export async function POST(
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
    const body = await request.json()
    const { approvalType, status, clientComments, amount } = body

    // Validate approvalType and status
    if (!approvalType || !['SCOPE_OF_WORK', 'COST_ESTIMATE'].includes(approvalType)) {
      return NextResponse.json({ error: 'Invalid approval type' }, { status: 400 })
    }

    if (!status || !['APPROVED', 'REJECTED', 'CHANGES_REQUESTED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    // Verify report belongs to this client
    const report = await prisma.report.findFirst({
      where: {
        id: reportId,
        clientId,
      }
    })

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    // Check if there's already a pending approval for this type
    const existingApproval = await prisma.reportApproval.findFirst({
      where: {
        reportId,
        approvalType,
        status: 'PENDING'
      }
    })

    let approval

    if (existingApproval) {
      // Update existing approval
      approval = await prisma.reportApproval.update({
        where: { id: existingApproval.id },
        data: {
          status,
          respondedAt: new Date(),
          clientComments: clientComments || null,
          amount: amount || null,
        }
      })
    } else {
      // Create new approval
      approval = await prisma.reportApproval.create({
        data: {
          reportId,
          approvalType,
          status,
          respondedAt: new Date(),
          clientComments: clientComments || null,
          amount: amount || null,
        }
      })
    }

    return NextResponse.json({ approval }, { status: 201 })
  } catch (error) {
    console.error('Error creating/updating approval:', error)
    return NextResponse.json(
      { error: 'Failed to process approval' },
      { status: 500 }
    )
  }
}

// GET /api/portal/reports/[id]/approvals - Get approvals for a report
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

    // Verify report belongs to this client
    const report = await prisma.report.findFirst({
      where: {
        id: reportId,
        clientId,
      }
    })

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const approvals = await prisma.reportApproval.findMany({
      where: { reportId },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ approvals })
  } catch (error) {
    console.error('Error fetching approvals:', error)
    return NextResponse.json(
      { error: 'Failed to fetch approvals' },
      { status: 500 }
    )
  }
}
