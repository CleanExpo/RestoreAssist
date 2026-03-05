import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export type ActivityType =
  | 'report_created'
  | 'report_updated'
  | 'report_completed'
  | 'member_joined'
  | 'invite_sent'
  | 'invite_accepted'
  | 'inspection_started'
  | 'inspection_submitted'
  | 'interview_completed'

export interface ActivityItem {
  id: string
  type: ActivityType
  actorId: string
  actorName: string
  actorEmail: string
  actorRole: string
  description: string
  timestamp: string
  metadata?: Record<string, unknown>
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100)
    const page = Math.max(parseInt(searchParams.get('page') || '1'), 1)
    const dateRange = searchParams.get('dateRange') || '30' // 7, 30, 90 days
    const roleFilter = searchParams.get('roleFilter') || 'ALL' // ALL, MANAGER, USER
    const userIdParam = searchParams.get('userId') || ''
    const activityTypeFilter = searchParams.get('activityType') || ''

    const days = Math.min(Math.max(parseInt(dateRange, 10) || 30, 7), 90)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { organizationId: true, role: true },
    })

    if (!currentUser?.organizationId) {
      return NextResponse.json({ activities: [], total: 0, page, limit, hasMore: false, members: [] })
    }

    // Team scope: Admin sees MANAGER + USER (not other ADMINs). Manager sees USER only.
    const roleCondition = currentUser.role === 'ADMIN'
      ? { role: { in: ['MANAGER', 'USER'] as const } }
      : { role: 'USER' as const }
    const teamMembers = await prisma.user.findMany({
      where: { organizationId: currentUser.organizationId, ...roleCondition },
      select: { id: true, name: true, email: true, role: true },
    })

    let memberIds = teamMembers.map(m => m.id)
    if (roleFilter === 'MANAGER') memberIds = teamMembers.filter(m => m.role === 'MANAGER').map(m => m.id)
    else if (roleFilter === 'USER') memberIds = teamMembers.filter(m => m.role === 'USER').map(m => m.id)
    if (userIdParam && memberIds.includes(userIdParam)) memberIds = [userIdParam]

    const memberMap = new Map(teamMembers.map(m => [m.id, m]))
    const fetchLimit = Math.max(limit * 3, 100)

    const [recentReports, recentInvites, recentMembers, recentInspections, recentInterviews] = await Promise.all([
      prisma.report.findMany({
        where: {
          userId: { in: memberIds },
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take: fetchLimit,
        select: {
          id: true,
          jobNumber: true,
          title: true,
          clientName: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          completionDate: true,
          userId: true,
          hazardType: true,
        },
      }),

      prisma.userInvite.findMany({
        where: {
          organizationId: currentUser.organizationId,
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take: fetchLimit,
        select: {
          id: true,
          email: true,
          role: true,
          usedAt: true,
          createdAt: true,
          createdById: true,
        },
      }),

      prisma.user.findMany({
        where: {
          organizationId: currentUser.organizationId,
          createdAt: { gte: since },
          role: { not: 'ADMIN' },
        },
        orderBy: { createdAt: 'desc' },
        take: fetchLimit,
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      }),

      prisma.inspection.findMany({
        where: {
          userId: { in: memberIds },
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take: fetchLimit,
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          userId: true,
        },
      }).catch(() => []),

      prisma.interviewSession.findMany({
        where: {
          userId: { in: memberIds },
          status: 'COMPLETED',
          completedAt: { not: null, gte: since },
        },
        orderBy: { completedAt: 'desc' },
        take: fetchLimit,
        select: {
          id: true,
          userId: true,
          completedAt: true,
          formTemplateId: true,
        },
      }).catch(() => []),
    ])

    const activities: ActivityItem[] = []

    function addActivity(item: ActivityItem) {
      if (activityTypeFilter && item.type !== activityTypeFilter) return
      activities.push(item)
    }

    for (const report of recentReports) {
      const member = memberMap.get(report.userId)
      if (!member) continue

      addActivity({
        id: `report-created-${report.id}`,
        type: 'report_created',
        actorId: member.id,
        actorName: member.name || member.email,
        actorEmail: member.email,
        actorRole: member.role,
        description: `created report ${report.jobNumber || report.id.slice(0, 8)}${report.hazardType ? ` (${report.hazardType})` : ''}`,
        timestamp: report.createdAt.toISOString(),
        metadata: { reportId: report.id, jobNumber: report.jobNumber, hazardType: report.hazardType, title: report.title, clientName: report.clientName },
      })

      const updatedLater = report.updatedAt.getTime() - report.createdAt.getTime() > 60_000
      if (report.status === 'COMPLETED' && (report.completionDate || report.updatedAt > report.createdAt)) {
        addActivity({
          id: `report-completed-${report.id}`,
          type: 'report_completed',
          actorId: member.id,
          actorName: member.name || member.email,
          actorEmail: member.email,
          actorRole: member.role,
          description: `completed report ${report.jobNumber || report.id.slice(0, 8)}`,
          timestamp: (report.completionDate || report.updatedAt).toISOString(),
          metadata: { reportId: report.id, jobNumber: report.jobNumber, title: report.title, clientName: report.clientName },
        })
      } else if (updatedLater) {
        addActivity({
          id: `report-updated-${report.id}-${report.updatedAt.getTime()}`,
          type: 'report_updated',
          actorId: member.id,
          actorName: member.name || member.email,
          actorEmail: member.email,
          actorRole: member.role,
          description: `updated report ${report.jobNumber || report.id.slice(0, 8)} (${report.status})`,
          timestamp: report.updatedAt.toISOString(),
          metadata: { reportId: report.id, jobNumber: report.jobNumber, status: report.status, title: report.title, clientName: report.clientName },
        })
      }
    }

    for (const invite of recentInvites) {
      const sender = memberMap.get(invite.createdById)
      if (!sender && currentUser.role !== 'ADMIN') continue
      const actor = sender || { id: invite.createdById, name: 'Team', email: '', role: 'ADMIN' as const }
      if (sender) {
        addActivity({
          id: `invite-sent-${invite.id}`,
          type: 'invite_sent',
          actorId: actor.id,
          actorName: actor.name || actor.email || 'Team',
          actorEmail: actor.email || '',
          actorRole: actor.role,
          description: `invited ${invite.email} as ${invite.role === 'USER' ? 'Technician' : invite.role === 'MANAGER' ? 'Manager' : invite.role}`,
          timestamp: invite.createdAt.toISOString(),
          metadata: { inviteEmail: invite.email, inviteRole: invite.role },
        })
      }

      if (invite.usedAt) {
        addActivity({
          id: `invite-accepted-${invite.id}`,
          type: 'invite_accepted',
          actorId: invite.email,
          actorName: invite.email,
          actorEmail: invite.email,
          actorRole: invite.role,
          description: `accepted invitation and joined as ${invite.role === 'USER' ? 'Technician' : invite.role === 'MANAGER' ? 'Manager' : invite.role}`,
          timestamp: invite.usedAt.toISOString(),
          metadata: { inviteEmail: invite.email, inviteRole: invite.role },
        })
      }
    }

    for (const newMember of recentMembers) {
      addActivity({
        id: `member-joined-${newMember.id}`,
        type: 'member_joined',
        actorId: newMember.id,
        actorName: newMember.name || newMember.email,
        actorEmail: newMember.email,
        actorRole: newMember.role,
        description: `joined the team as ${newMember.role === 'USER' ? 'Technician' : newMember.role === 'MANAGER' ? 'Manager' : newMember.role}`,
        timestamp: newMember.createdAt.toISOString(),
      })
    }

    for (const inspection of recentInspections) {
      const member = memberMap.get(inspection.userId)
      if (!member) continue

      addActivity({
        id: `inspection-started-${inspection.id}`,
        type: 'inspection_started',
        actorId: member.id,
        actorName: member.name || member.email,
        actorEmail: member.email,
        actorRole: member.role,
        description: `started inspection "${inspection.title || inspection.id.slice(0, 8)}"`,
        timestamp: inspection.createdAt.toISOString(),
        metadata: { inspectionId: inspection.id, title: inspection.title },
      })

      if (inspection.status === 'SUBMITTED' && inspection.updatedAt > inspection.createdAt) {
        addActivity({
          id: `inspection-submitted-${inspection.id}`,
          type: 'inspection_submitted',
          actorId: member.id,
          actorName: member.name || member.email,
          actorEmail: member.email,
          actorRole: member.role,
          description: `submitted inspection "${inspection.title || inspection.id.slice(0, 8)}"`,
          timestamp: inspection.updatedAt.toISOString(),
          metadata: { inspectionId: inspection.id, title: inspection.title },
        })
      }
    }

    for (const interview of recentInterviews) {
      const member = memberMap.get(interview.userId)
      const completedAt = interview.completedAt
      if (!member || !completedAt) continue
      addActivity({
        id: `interview-completed-${interview.id}`,
        type: 'interview_completed',
        actorId: member.id,
        actorName: member.name || member.email,
        actorEmail: member.email,
        actorRole: member.role,
        description: 'completed guided interview',
        timestamp: completedAt.toISOString(),
        metadata: { interviewSessionId: interview.id, formTemplateId: interview.formTemplateId },
      })
    }

    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    const total = activities.length
    const offset = (page - 1) * limit
    const paginated = activities.slice(offset, offset + limit)

    const membersForFilter = teamMembers.map(m => ({
      id: m.id,
      name: m.name || m.email,
      email: m.email,
      role: m.role,
    }))

    return NextResponse.json({
      activities: paginated,
      total,
      page,
      limit,
      hasMore: offset + limit < total,
      dateRangeDays: days,
      members: membersForFilter,
    })
  } catch (error) {
    console.error('Error fetching team activity:', error)
    return NextResponse.json(
      { error: 'Failed to fetch team activity' },
      { status: 500 }
    )
  }
}
