import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { FormTemplateStatus, FormType, FormCategory } from '@prisma/client'

/**
 * GET /api/forms/builder
 * Retrieve form templates for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const templates = await prisma.formTemplate.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        name: true,
        description: true,
        formType: true,
        category: true,
        status: true,
        version: true,
        isActive: true,
        isSystemTemplate: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    })

    return NextResponse.json(templates)
  } catch (error) {
    console.error('Error fetching form templates:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/forms/builder
 * Create a new form template
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, formType, category, formSchema } = body

    // Validate required fields
    if (!name || !formType || !category) {
      return NextResponse.json(
        { error: 'Missing required fields: name, formType, category' },
        { status: 400 },
      )
    }

    const template = await prisma.formTemplate.create({
      data: {
        userId: session.user.id,
        name,
        description,
        formType: formType as FormType,
        category: category as FormCategory,
        status: FormTemplateStatus.DRAFT,
        version: 1,
        isSystemTemplate: false,
        isActive: false,
        formSchema: formSchema
          ? JSON.stringify(formSchema)
          : JSON.stringify({
              id: `form-${Date.now()}`,
              version: 1,
              formType,
              sections: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }),
        requiresSignatures: false,
        createdBy: session.user.id,
      },
    })

    return NextResponse.json(template, { status: 201 })
  } catch (error) {
    console.error('Error creating form template:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
