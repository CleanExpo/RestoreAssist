import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { FormTemplateStatus } from '@prisma/client'

/**
 * GET /api/forms/builder/[id]
 * Retrieve a specific form template with full schema
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const template = await prisma.formTemplate.findUnique({
      where: { id: params.id },
    })

    if (!template) {
      return NextResponse.json({ error: 'Form template not found' }, { status: 404 })
    }

    // Verify ownership
    if (template.userId !== session.user.id && !template.isSystemTemplate) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Parse JSON schema
    const formSchema = typeof template.formSchema === 'string' ? JSON.parse(template.formSchema) : template.formSchema

    return NextResponse.json({
      ...template,
      formSchema,
    })
  } catch (error) {
    console.error('Error fetching form template:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PUT /api/forms/builder/[id]
 * Update a form template
 */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const template = await prisma.formTemplate.findUnique({
      where: { id: params.id },
    })

    if (!template) {
      return NextResponse.json({ error: 'Form template not found' }, { status: 404 })
    }

    if (template.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { name, description, formSchema, status, isActive, requiresSignatures, signatureConfig } = body

    const updated = await prisma.formTemplate.update({
      where: { id: params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(formSchema && { formSchema: JSON.stringify(formSchema) }),
        ...(status && { status: status as FormTemplateStatus }),
        ...(isActive !== undefined && { isActive }),
        ...(requiresSignatures !== undefined && { requiresSignatures }),
        ...(signatureConfig && { signatureConfig: JSON.stringify(signatureConfig) }),
        updatedAt: new Date(),
      },
    })

    const formSchemaObj = typeof updated.formSchema === 'string' ? JSON.parse(updated.formSchema) : updated.formSchema

    return NextResponse.json({
      ...updated,
      formSchema: formSchemaObj,
    })
  } catch (error) {
    console.error('Error updating form template:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/forms/builder/[id]
 * Delete a form template
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const template = await prisma.formTemplate.findUnique({
      where: { id: params.id },
      include: { submissions: { take: 1 } },
    })

    if (!template) {
      return NextResponse.json({ error: 'Form template not found' }, { status: 404 })
    }

    if (template.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Prevent deletion if form has submissions
    if (template.submissions.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete form template with existing submissions' },
        { status: 409 },
      )
    }

    await prisma.formTemplate.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true, message: 'Form template deleted' })
  } catch (error) {
    console.error('Error deleting form template:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
