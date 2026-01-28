import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// Update certification
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify ownership
    const certification = await prisma.contractorCertification.findUnique({
      where: { id: params.id },
      include: {
        profile: {
          select: { userId: true }
        }
      }
    })

    if (!certification) {
      return NextResponse.json(
        { error: 'Certification not found' },
        { status: 404 }
      )
    }

    if (certification.profile.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    // Contractors cannot update verified certifications
    if (certification.verificationStatus === 'VERIFIED') {
      return NextResponse.json(
        { error: 'Cannot update verified certification' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const {
      certificationType,
      certificationName,
      issuingBody,
      certificationNumber,
      issueDate,
      expiryDate,
      documentUrl
    } = body

    const updated = await prisma.contractorCertification.update({
      where: { id: params.id },
      data: {
        ...(certificationType && { certificationType }),
        ...(certificationName && { certificationName }),
        ...(issuingBody && { issuingBody }),
        ...(certificationNumber !== undefined && { certificationNumber }),
        ...(issueDate && { issueDate: new Date(issueDate) }),
        ...(expiryDate !== undefined && {
          expiryDate: expiryDate ? new Date(expiryDate) : null
        }),
        ...(documentUrl !== undefined && { documentUrl })
      }
    })

    return NextResponse.json({ certification: updated })
  } catch (error: any) {
    console.error('Error updating certification:', error)
    return NextResponse.json(
      { error: 'Failed to update certification' },
      { status: 500 }
    )
  }
}

// Delete certification
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify ownership
    const certification = await prisma.contractorCertification.findUnique({
      where: { id: params.id },
      include: {
        profile: {
          select: { userId: true }
        }
      }
    })

    if (!certification) {
      return NextResponse.json(
        { error: 'Certification not found' },
        { status: 404 }
      )
    }

    if (certification.profile.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    await prisma.contractorCertification.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting certification:', error)
    return NextResponse.json(
      { error: 'Failed to delete certification' },
      { status: 500 }
    )
  }
}
