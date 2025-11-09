import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET - Get version history for a report
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { id } = await params

    const report = await prisma.report.findUnique({
      where: { id, userId: user.id }
    })

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const versionHistory = report.versionHistory 
      ? JSON.parse(report.versionHistory) 
      : [
          {
            version: report.reportVersion || 1,
            date: report.createdAt,
            action: 'Initial creation',
            changedBy: user.name || user.email
          }
        ]

    return NextResponse.json({ versionHistory })
  } catch (error) {
    console.error('Error fetching version history:', error)
    return NextResponse.json(
      { error: 'Failed to fetch version history' },
      { status: 500 }
    )
  }
}

// POST - Add version history entry
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { id } = await params
    const { action, changes } = await request.json()

    const report = await prisma.report.findUnique({
      where: { id, userId: user.id }
    })

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const currentVersion = report.reportVersion || 1
    const newVersion = currentVersion + 1

    const existingHistory = report.versionHistory 
      ? JSON.parse(report.versionHistory) 
      : []

    const newEntry = {
      version: newVersion,
      date: new Date().toISOString(),
      action: action || 'Report regenerated',
      changes: changes || [],
      changedBy: user.name || user.email
    }

    const updatedHistory = [...existingHistory, newEntry]

    await prisma.report.update({
      where: { id },
      data: {
        versionHistory: JSON.stringify(updatedHistory),
        reportVersion: newVersion,
        lastEditedBy: user.id,
        lastEditedAt: new Date()
      }
    })

    return NextResponse.json({ 
      versionHistory: updatedHistory,
      newVersion
    })
  } catch (error) {
    console.error('Error adding version history:', error)
    return NextResponse.json(
      { error: 'Failed to add version history' },
      { status: 500 }
    )
  }
}

