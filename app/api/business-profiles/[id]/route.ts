import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sanitizeString } from '@/lib/sanitize'

// GET /api/business-profiles/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const profile = await prisma.businessProfile.findUnique({
    where: { id },
  })

  if (!profile || profile.userId !== session.user.id) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  return NextResponse.json(profile)
}

// PUT /api/business-profiles/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const profile = await prisma.businessProfile.findUnique({
    where: { id },
  })

  if (!profile || profile.userId !== session.user.id) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const body = await request.json()

  const updated = await prisma.businessProfile.update({
    where: { id },
    data: {
      name: body.name !== undefined ? sanitizeString(body.name, 200) : undefined,
      abn: body.abn !== undefined ? (sanitizeString(body.abn, 50) || null) : undefined,
      logoUrl: body.logoUrl !== undefined ? (body.logoUrl || null) : undefined,
      address: body.address !== undefined ? (sanitizeString(body.address, 500) || null) : undefined,
      phone: body.phone !== undefined ? (sanitizeString(body.phone, 30) || null) : undefined,
      email: body.email !== undefined ? (sanitizeString(body.email, 200) || null) : undefined,
      insuranceCertificateNumber:
        body.insuranceCertificateNumber !== undefined
          ? (sanitizeString(body.insuranceCertificateNumber, 100) || null)
          : undefined,
      insuranceExpiry:
        body.insuranceExpiry !== undefined
          ? (body.insuranceExpiry ? new Date(body.insuranceExpiry) : null)
          : undefined,
      licenceNumber:
        body.licenceNumber !== undefined
          ? (sanitizeString(body.licenceNumber, 100) || null)
          : undefined,
      licenceClass:
        body.licenceClass !== undefined
          ? (sanitizeString(body.licenceClass, 100) || null)
          : undefined,
      licenceExpiry:
        body.licenceExpiry !== undefined
          ? (body.licenceExpiry ? new Date(body.licenceExpiry) : null)
          : undefined,
    },
  })

  return NextResponse.json(updated)
}

// DELETE /api/business-profiles/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const profile = await prisma.businessProfile.findUnique({
    where: { id },
  })

  if (!profile || profile.userId !== session.user.id) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  // Cannot delete the only profile
  const count = await prisma.businessProfile.count({
    where: { userId: session.user.id },
  })

  if (count <= 1) {
    return NextResponse.json(
      { error: 'Cannot delete your only business profile' },
      { status: 400 }
    )
  }

  // Cannot delete the default profile — must set another as default first
  if (profile.isDefault) {
    return NextResponse.json(
      { error: 'Cannot delete the default profile. Set another profile as default first.' },
      { status: 400 }
    )
  }

  // If deleting the active profile, switch to the default
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { activeBusinessProfileId: true },
  })

  await prisma.businessProfile.delete({ where: { id } })

  if (user?.activeBusinessProfileId === id) {
    const defaultProfile = await prisma.businessProfile.findFirst({
      where: { userId: session.user.id, isDefault: true },
    })
    if (defaultProfile) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { activeBusinessProfileId: defaultProfile.id },
      })
    }
  }

  return NextResponse.json({ success: true })
}
