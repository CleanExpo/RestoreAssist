/**
 * GET  /api/videos     — list all videos in the user's library
 * POST /api/videos     — create a new video from a template category
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SCRIPT_TEMPLATES } from '@/lib/video-generation/script-templates'
import type { VideoCategory } from '@prisma/client'

// ── GET — list videos ─────────────────────────────────────────────────────────

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const library = await prisma.videoLibrary.findUnique({
    where: { userId: session.user.id },
  })

  if (!library) {
    return NextResponse.json({ videos: [], library: null })
  }

  const videos = await prisma.video.findMany({
    where: { libraryId: library.id },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      title: true,
      category: true,
      status: true,
      thumbnailUrl: true,
      videoUrl: true,
      durationSeconds: true,
      isShareable: true,
      shareToken: true,
      updatedAt: true,
    },
  })

  return NextResponse.json({ videos, library: { id: library.id, companyName: library.companyName, isAnalyticsEnabled: library.isAnalyticsEnabled } })
}

// ── POST — create video from template ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: { category?: string; companyName?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { category, companyName } = body

  if (!category) {
    return NextResponse.json({ error: 'category is required' }, { status: 400 })
  }

  const template = SCRIPT_TEMPLATES[category]
  if (!template) {
    return NextResponse.json(
      { error: `Invalid category. Valid values: ${Object.keys(SCRIPT_TEMPLATES).join(', ')}` },
      { status: 400 }
    )
  }

  // Find or create the user's video library
  let library = await prisma.videoLibrary.findUnique({
    where: { userId: session.user.id },
  })

  if (!library) {
    // Auto-create on first use, using business name from User profile
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { name: true, businessName: true },
    })
    library = await prisma.videoLibrary.create({
      data: {
        userId: session.user.id,
        companyName: companyName ?? user.businessName ?? user.name ?? 'My Company',
      },
    })
  }

  // Check if a video for this category already exists
  const existing = await prisma.video.findFirst({
    where: { libraryId: library.id, category: category as VideoCategory },
    select: { id: true },
  })
  if (existing) {
    return NextResponse.json(
      { error: `A video for category ${category} already exists. Delete it first or render the existing one.` },
      { status: 409 }
    )
  }

  // Generate a short share token for the preferred supplier video (QR-shareable)
  const isShareable = category === 'PREFERRED_SUPPLIER_RIGHTS'
  let shareToken: string | null = null
  if (isShareable) {
    // Simple token: 12 random alphanumeric chars
    shareToken = Array.from(
      { length: 12 },
      () => 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 54)]
    ).join('')
  }

  const video = await prisma.video.create({
    data: {
      libraryId: library.id,
      title: template.title,
      slug: category.toLowerCase().replace(/_/g, '-'),
      category: category as VideoCategory,
      scriptText: template.script,
      contentSources: JSON.stringify(template.sources),
      isShareable,
      shareToken,
      sortOrder: Object.keys(SCRIPT_TEMPLATES).indexOf(category),
    },
  })

  return NextResponse.json({ video }, { status: 201 })
}
