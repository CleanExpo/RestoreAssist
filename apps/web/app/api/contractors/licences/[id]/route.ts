import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const VALID_LICENCE_TYPES = [
  'BUILDERS_LICENCE',
  'WHS_WHITE_CARD',
  'ELECTRICAL',
  'PLUMBING',
  'IICRC_MEMBERSHIP',
  'NRPG_MEMBERSHIP',
  'ABN_REGISTRATION',
  'OTHER',
]

// Update licence record
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const existing = await prisma.contractorLicence.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Licence record not found' },
        { status: 404 }
      )
    }

    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const {
      licenceType,
      licenceNumber,
      issuingAuthority,
      expiryDate,
      documentUrl,
      isActive,
    } = body

    if (licenceType && !VALID_LICENCE_TYPES.includes(licenceType)) {
      return NextResponse.json(
        { error: 'Invalid licence type' },
        { status: 400 }
      )
    }

    const licence = await prisma.contractorLicence.update({
      where: { id },
      data: {
        ...(licenceType !== undefined && { licenceType }),
        ...(licenceNumber !== undefined && { licenceNumber: licenceNumber || null }),
        ...(issuingAuthority !== undefined && { issuingAuthority: issuingAuthority || null }),
        ...(expiryDate !== undefined && {
          expiryDate: expiryDate ? new Date(expiryDate) : null,
        }),
        ...(documentUrl !== undefined && { documentUrl: documentUrl || null }),
        ...(isActive !== undefined && { isActive }),
      },
    })

    return NextResponse.json({ licence })
  } catch (error: unknown) {
    console.error('Error updating licence:', error)
    return NextResponse.json(
      { error: 'Failed to update licence record' },
      { status: 500 }
    )
  }
}

// Delete licence record
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const existing = await prisma.contractorLicence.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Licence record not found' },
        { status: 404 }
      )
    }

    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.contractorLicence.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Error deleting licence:', error)
    return NextResponse.json(
      { error: 'Failed to delete licence record' },
      { status: 500 }
    )
  }
}
