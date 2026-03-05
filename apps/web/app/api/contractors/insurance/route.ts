import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const VALID_INSURANCE_TYPES = [
  'PUBLIC_LIABILITY',
  'PROFESSIONAL_INDEMNITY',
  'WORKERS_COMP',
  'OTHER',
]

// Get current user's insurance records
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const insuranceType = searchParams.get('insuranceType')

    const where: Record<string, unknown> = { userId: session.user.id }
    if (insuranceType && VALID_INSURANCE_TYPES.includes(insuranceType)) {
      where.insuranceType = insuranceType
    }

    const insurance = await prisma.contractorInsurance.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ insurance })
  } catch (error: unknown) {
    console.error('Error fetching insurance:', error)
    return NextResponse.json(
      { error: 'Failed to fetch insurance records' },
      { status: 500 }
    )
  }
}

// Create new insurance record
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      insuranceType,
      provider,
      policyNumber,
      coverageAmount,
      expiryDate,
      documentUrl,
    } = body

    if (!insuranceType || !expiryDate) {
      return NextResponse.json(
        { error: 'Insurance type and expiry date are required' },
        { status: 400 }
      )
    }

    if (!VALID_INSURANCE_TYPES.includes(insuranceType)) {
      return NextResponse.json(
        { error: 'Invalid insurance type' },
        { status: 400 }
      )
    }

    const insurance = await prisma.contractorInsurance.create({
      data: {
        userId: session.user.id,
        insuranceType,
        provider: provider || null,
        policyNumber: policyNumber || null,
        coverageAmount: coverageAmount ? parseFloat(coverageAmount) : null,
        expiryDate: new Date(expiryDate),
        documentUrl: documentUrl || null,
      },
    })

    return NextResponse.json({ insurance }, { status: 201 })
  } catch (error: unknown) {
    console.error('Error creating insurance:', error)
    return NextResponse.json(
      { error: 'Failed to create insurance record' },
      { status: 500 }
    )
  }
}
