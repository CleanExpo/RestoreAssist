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

// Update insurance record
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

    const existing = await prisma.contractorInsurance.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Insurance record not found' },
        { status: 404 }
      )
    }

    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const {
      insuranceType,
      provider,
      policyNumber,
      coverageAmount,
      expiryDate,
      documentUrl,
      isActive,
    } = body

    if (insuranceType && !VALID_INSURANCE_TYPES.includes(insuranceType)) {
      return NextResponse.json(
        { error: 'Invalid insurance type' },
        { status: 400 }
      )
    }

    const insurance = await prisma.contractorInsurance.update({
      where: { id },
      data: {
        ...(insuranceType !== undefined && { insuranceType }),
        ...(provider !== undefined && { provider: provider || null }),
        ...(policyNumber !== undefined && { policyNumber: policyNumber || null }),
        ...(coverageAmount !== undefined && {
          coverageAmount: coverageAmount ? parseFloat(coverageAmount) : null,
        }),
        ...(expiryDate !== undefined && { expiryDate: new Date(expiryDate) }),
        ...(documentUrl !== undefined && { documentUrl: documentUrl || null }),
        ...(isActive !== undefined && { isActive }),
      },
    })

    return NextResponse.json({ insurance })
  } catch (error: unknown) {
    console.error('Error updating insurance:', error)
    return NextResponse.json(
      { error: 'Failed to update insurance record' },
      { status: 500 }
    )
  }
}

// Delete insurance record
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

    const existing = await prisma.contractorInsurance.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Insurance record not found' },
        { status: 404 }
      )
    }

    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.contractorInsurance.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Error deleting insurance:', error)
    return NextResponse.json(
      { error: 'Failed to delete insurance record' },
      { status: 500 }
    )
  }
}
