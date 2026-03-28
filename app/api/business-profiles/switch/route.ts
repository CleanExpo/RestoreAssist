import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOrganizationOwner } from '@/lib/organization-credits'

// POST /api/business-profiles/switch — switch active business profile
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { profileId } = await request.json()
  if (!profileId) {
    return NextResponse.json({ error: 'profileId is required' }, { status: 400 })
  }

  // Verify the profile belongs to this user (or their org admin)
  const profile = await prisma.businessProfile.findUnique({
    where: { id: profileId },
  })

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  // Check ownership: profile must belong to user or their org admin
  let allowedOwnerIds = [session.user.id]
  if (session.user.organizationId) {
    const ownerId = await getOrganizationOwner(session.user.id)
    if (ownerId && ownerId !== session.user.id) {
      allowedOwnerIds.push(ownerId)
    }
  }

  if (!allowedOwnerIds.includes(profile.userId)) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { activeBusinessProfileId: profileId },
  })

  return NextResponse.json({
    success: true,
    activeBusinessProfileId: profileId,
    profile,
  })
}
