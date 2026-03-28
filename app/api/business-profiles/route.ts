import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sanitizeString } from '@/lib/sanitize'
import { getOrganizationOwner } from '@/lib/organization-credits'
import { getEffectiveSubscription } from '@/lib/organization-credits'

// GET /api/business-profiles — list user's (or org admin's) business profiles
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // For team members, get the admin's profiles
  let profileOwnerId = session.user.id
  if (session.user.role !== 'ADMIN' && session.user.organizationId) {
    const ownerId = await getOrganizationOwner(session.user.id)
    if (ownerId) profileOwnerId = ownerId
  }

  const profiles = await prisma.businessProfile.findMany({
    where: { userId: profileOwnerId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })

  // Include the user's active profile ID for the UI
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { activeBusinessProfileId: true },
  })

  return NextResponse.json({
    profiles,
    activeBusinessProfileId: user?.activeBusinessProfileId || null,
  })
}

// POST /api/business-profiles — create a new business profile
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Only ADMINs (or standalone users) can create profiles
  if (session.user.role !== 'ADMIN' && session.user.role !== 'USER') {
    return NextResponse.json(
      { error: 'Only account owners can create business profiles' },
      { status: 403 }
    )
  }

  const body = await request.json()
  const name = sanitizeString(body.name, 200)
  if (!name) {
    return NextResponse.json({ error: 'Business name is required' }, { status: 400 })
  }

  // Check existing profile count for subscription gating
  const existingCount = await prisma.businessProfile.count({
    where: { userId: session.user.id },
  })

  if (existingCount >= 1) {
    // Additional profiles require Premium+ subscription
    const subscription = await getEffectiveSubscription(session.user.id)
    const plan = subscription?.subscriptionPlan?.toLowerCase() || ''
    const isPremiumPlus =
      plan.includes('yearly') ||
      plan.includes('enterprise') ||
      plan === 'lifetime'

    if (!isPremiumPlus) {
      return NextResponse.json(
        {
          error: 'Additional business profiles require a Yearly or Enterprise plan',
          upgradeRequired: true,
        },
        { status: 403 }
      )
    }
  }

  const isFirst = existingCount === 0

  const profile = await prisma.businessProfile.create({
    data: {
      userId: session.user.id,
      name,
      abn: sanitizeString(body.abn, 50) || null,
      logoUrl: body.logoUrl || null,
      address: sanitizeString(body.address, 500) || null,
      phone: sanitizeString(body.phone, 30) || null,
      email: sanitizeString(body.email, 200) || null,
      insuranceCertificateNumber: sanitizeString(body.insuranceCertificateNumber, 100) || null,
      insuranceExpiry: body.insuranceExpiry ? new Date(body.insuranceExpiry) : null,
      licenceNumber: sanitizeString(body.licenceNumber, 100) || null,
      licenceClass: sanitizeString(body.licenceClass, 100) || null,
      licenceExpiry: body.licenceExpiry ? new Date(body.licenceExpiry) : null,
      isDefault: isFirst,
    },
  })

  // If first profile, set as active
  if (isFirst) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { activeBusinessProfileId: profile.id },
    })
  }

  return NextResponse.json(profile, { status: 201 })
}
