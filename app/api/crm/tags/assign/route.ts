import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { entityType, entityId, tagIds } = body

    // Validate input
    if (!entityType || !entityId || !Array.isArray(tagIds)) {
      return NextResponse.json(
        { error: 'Invalid request: entityType, entityId, and tagIds (array) required' },
        { status: 400 }
      )
    }

    if (!['company', 'contact'].includes(entityType)) {
      return NextResponse.json(
        { error: 'Invalid entityType: must be "company" or "contact"' },
        { status: 400 }
      )
    }

    // Verify entity ownership
    if (entityType === 'company') {
      const company = await prisma.company.findUnique({
        where: { id: entityId, userId: session.user.id }
      })
      if (!company) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 })
      }

      // Remove existing tags
      await prisma.companyTag.deleteMany({
        where: { companyId: entityId }
      })

      // Add new tags
      if (tagIds.length > 0) {
        await prisma.companyTag.createMany({
          data: tagIds.map((tagId: string) => ({
            companyId: entityId,
            tagId
          })),
          skipDuplicates: true
        })
      }

      // Fetch updated company with tags
      const updatedCompany = await prisma.company.findUnique({
        where: { id: entityId },
        include: {
          companyTags: {
            include: { tag: true }
          }
        }
      })

      return NextResponse.json({ company: updatedCompany })
    } else if (entityType === 'contact') {
      const contact = await prisma.contact.findUnique({
        where: { id: entityId, userId: session.user.id }
      })
      if (!contact) {
        return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
      }

      // Remove existing tags
      await prisma.contactTag.deleteMany({
        where: { contactId: entityId }
      })

      // Add new tags
      if (tagIds.length > 0) {
        await prisma.contactTag.createMany({
          data: tagIds.map((tagId: string) => ({
            contactId: entityId,
            tagId
          })),
          skipDuplicates: true
        })
      }

      // Fetch updated contact with tags
      const updatedContact = await prisma.contact.findUnique({
        where: { id: entityId },
        include: {
          contactTags: {
            include: { tag: true }
          }
        }
      })

      return NextResponse.json({ contact: updatedContact })
    }
  } catch (error: any) {
    console.error('Error assigning tags:', error)
    return NextResponse.json(
      { error: 'Failed to assign tags' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { entityType, entityId, tagId } = body

    // Validate input
    if (!entityType || !entityId || !tagId) {
      return NextResponse.json(
        { error: 'Invalid request: entityType, entityId, and tagId required' },
        { status: 400 }
      )
    }

    if (!['company', 'contact'].includes(entityType)) {
      return NextResponse.json(
        { error: 'Invalid entityType: must be "company" or "contact"' },
        { status: 400 }
      )
    }

    // Verify entity ownership and remove tag
    if (entityType === 'company') {
      const company = await prisma.company.findUnique({
        where: { id: entityId, userId: session.user.id }
      })
      if (!company) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 })
      }

      await prisma.companyTag.deleteMany({
        where: {
          companyId: entityId,
          tagId
        }
      })

      return NextResponse.json({ success: true })
    } else if (entityType === 'contact') {
      const contact = await prisma.contact.findUnique({
        where: { id: entityId, userId: session.user.id }
      })
      if (!contact) {
        return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
      }

      await prisma.contactTag.deleteMany({
        where: {
          contactId: entityId,
          tagId
        }
      })

      return NextResponse.json({ success: true })
    }
  } catch (error: any) {
    console.error('Error removing tag:', error)
    return NextResponse.json(
      { error: 'Failed to remove tag' },
      { status: 500 }
    )
  }
}
