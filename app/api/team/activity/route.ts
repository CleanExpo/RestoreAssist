import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface ActivityItem {
  id: string
  type: 'report_created' | 'report_completed' | 'member_joined' | 'invite_sent' | 'invite_accepted' | 'inspection_started' | 'inspection_submitted'
  actorName: string
  actorEmail: string
  actorRole: string
  description: string
  timestamp: string
  metadata?: Record<string, any>
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only ADMIN and MANAGER can view team activity
    if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
    const page = Math.max(parseInt(searchParams.get('page') || '1'), 1)

    // Get the user's organization
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { organizationId: true, role: true },
    })

    if (!user?.organizationId) {
      return NextResponse.json({ activities: [], total: 0 })
    }

    // Get all team member IDs in the organization
    const teamMembers = await prisma.user.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, name: true, email: true, role: true },
    })

    const memberIds = teamMembers.map(m => m.id)
    const memberMap = new Map(teamMembers.map(m => [m.id, m]))

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    // Fetch activities from multiple sources in parallel
    const [recentReports, recentInvites, recentMembers, recentInspections] = await Promise.all([
      // Reports created/completed by team members
      prisma.report.findMany({
        where: {
          userId: { in: memberIds },
          createdAt: { gte: thirtyDaysAgo },
        },
        orderBy: { createdAt: 'desc' },
        take: limit * 2,
        select: {
          id: true,
          jobNumber: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          userId: true,
          hazardType: true,
        },
      }),

      // Invites sent/accepted in this org
      prisma.userInvite.findMany({
        where: {
          organizationId: user.organizationId,
          createdAt: { gte: thirtyDaysAgo },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          email: true,
          role: true,
          usedAt: true,
          createdAt: true,
          createdById: true,
        },
      }),

      // New team members who joined recently
      prisma.user.findMany({
        where: {
          organizationId: user.organizationId,
          createdAt: { gte: thirtyDaysAgo },
          role: { not: 'ADMIN' }, // Admin is the org owner, not a "joiner"
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
      }),

      // Inspections started/submitted by team members
      prisma.inspection.findMany({
        where: {
          userId: { in: memberIds },
          createdAt: { gte: thirtyDaysAgo },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          userId: true,
        },
      }).catch(() => []), // Gracefully handle if Inspection model not available
    ])

    // Build unified activity list
    const activities: ActivityItem[] = []

    // Report activities
    for (const report of recentReports) {
      const member = memberMap.get(report.userId)
      if (!member) continue

      activities.push({
        id: `report-created-${report.id}`,
        type: 'report_created',
        actorName: member.name || member.email,
        actorEmail: member.email,
        actorRole: member.role,
        description: `created report ${report.jobNumber || report.id.slice(0, 8)}${report.hazardType ? ` (${report.hazardType})` : ''}`,
        timestamp: report.createdAt.toISOString(),
        metadata: { reportId: report.id, jobNumber: report.jobNumber, hazardType: report.hazardType },
      })

      if (report.status === 'COMPLETED' && report.updatedAt > report.createdAt) {
        activities.push({
          id: `report-completed-${report.id}`,
          type: 'report_completed',
          actorName: member.name || member.email,
          actorEmail: member.email,
          actorRole: member.role,
          description: `completed report ${report.jobNumber || report.id.slice(0, 8)}`,
          timestamp: report.updatedAt.toISOString(),
          metadata: { reportId: report.id, jobNumber: report.jobNumber },
        })
      }
    }

    // Invite activities
    for (const invite of recentInvites) {
      const sender = memberMap.get(invite.createdById)
      if (!sender) continue

      activities.push({
        id: `invite-sent-${invite.id}`,
        type: 'invite_sent',
        actorName: sender.name || sender.email,
        actorEmail: sender.email,
        actorRole: sender.role,
        description: `invited ${invite.email} as ${invite.role === 'USER' ? 'Technician' : invite.role === 'MANAGER' ? 'Manager' : invite.role}`,
        timestamp: invite.createdAt.toISOString(),
        metadata: { inviteEmail: invite.email, inviteRole: invite.role },
      })

      if (invite.usedAt) {
        activities.push({
          id: `invite-accepted-${invite.id}`,
          type: 'invite_accepted',
          actorName: invite.email,
          actorEmail: invite.email,
          actorRole: invite.role,
          description: `accepted invitation and joined as ${invite.role === 'USER' ? 'Technician' : invite.role === 'MANAGER' ? 'Manager' : invite.role}`,
          timestamp: invite.usedAt.toISOString(),
          metadata: { inviteEmail: invite.email, inviteRole: invite.role },
        })
      }
    }

    // New member activities
    for (const newMember of recentMembers) {
      activities.push({
        id: `member-joined-${newMember.id}`,
        type: 'member_joined',
        actorName: newMember.name || newMember.email,
        actorEmail: newMember.email,
        actorRole: newMember.role,
        description: `joined the team as ${newMember.role === 'USER' ? 'Technician' : newMember.role === 'MANAGER' ? 'Manager' : newMember.role}`,
        timestamp: newMember.createdAt.toISOString(),
      })
    }

    // Inspection activities
    for (const inspection of recentInspections) {
      const member = memberMap.get(inspection.userId)
      if (!member) continue

      activities.push({
        id: `inspection-started-${inspection.id}`,
        type: 'inspection_started',
        actorName: member.name || member.email,
        actorEmail: member.email,
        actorRole: member.role,
        description: `started inspection "${inspection.title || inspection.id.slice(0, 8)}"`,
        timestamp: inspection.createdAt.toISOString(),
        metadata: { inspectionId: inspection.id, title: inspection.title },
      })

      if (inspection.status === 'SUBMITTED' && inspection.updatedAt > inspection.createdAt) {
        activities.push({
          id: `inspection-submitted-${inspection.id}`,
          type: 'inspection_submitted',
          actorName: member.name || member.email,
          actorEmail: member.email,
          actorRole: member.role,
          description: `submitted inspection "${inspection.title || inspection.id.slice(0, 8)}"`,
          timestamp: inspection.updatedAt.toISOString(),
          metadata: { inspectionId: inspection.id, title: inspection.title },
        })
      }
    }

    // Sort by timestamp (newest first) and paginate
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    const total = activities.length
    const offset = (page - 1) * limit
    const paginated = activities.slice(offset, offset + limit)

    return NextResponse.json({
      activities: paginated,
      total,
      page,
      limit,
      hasMore: offset + limit < total,
    })
  } catch (error) {
    console.error('Error fetching team activity:', error)
    return NextResponse.json(
      { error: 'Failed to fetch team activity' },
      { status: 500 }
    )
  }
}
