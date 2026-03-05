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

// Get current user's licence records
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const licenceType = searchParams.get('licenceType')

    const where: Record<string, unknown> = { userId: session.user.id }
    if (licenceType && VALID_LICENCE_TYPES.includes(licenceType)) {
      where.licenceType = licenceType
    }

    const licences = await prisma.contractorLicence.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ licences })
  } catch (error: unknown) {
    console.error('Error fetching licences:', error)
    return NextResponse.json(
      { error: 'Failed to fetch licence records' },
      { status: 500 }
    )
  }
}

// Create new licence record
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      licenceType,
      licenceNumber,
      issuingAuthority,
      expiryDate,
      documentUrl,
    } = body

    if (!licenceType) {
      return NextResponse.json(
        { error: 'Licence type is required' },
        { status: 400 }
      )
    }

    if (!VALID_LICENCE_TYPES.includes(licenceType)) {
      return NextResponse.json(
        { error: 'Invalid licence type' },
        { status: 400 }
      )
    }

    const licence = await prisma.contractorLicence.create({
      data: {
        userId: session.user.id,
        licenceType,
        licenceNumber: licenceNumber || null,
        issuingAuthority: issuingAuthority || null,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        documentUrl: documentUrl || null,
      },
    })

    return NextResponse.json({ licence }, { status: 201 })
  } catch (error: unknown) {
    console.error('Error creating licence:', error)
    return NextResponse.json(
      { error: 'Failed to create licence record' },
      { status: 500 }
    )
  }
}
