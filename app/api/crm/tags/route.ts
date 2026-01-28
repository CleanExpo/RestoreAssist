import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')

    const where: any = { userId: session.user.id }

    if (category) where.category = category

    const tags = await prisma.tag.findMany({
      where,
      include: {
        _count: {
          select: {
            contactTags: true,
            companyTags: true
          }
        }
      },
      orderBy: { name: 'asc' }
    })

    return NextResponse.json({ tags })
  } catch (error: any) {
    console.error('Error fetching tags:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tags' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      name,
      color,
      category,
      description
    } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Check if tag with same name already exists for this user
    const existing = await prisma.tag.findFirst({
      where: {
        userId: session.user.id,
        name: name.trim()
      }
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Tag with this name already exists' },
        { status: 400 }
      )
    }

    const tag = await prisma.tag.create({
      data: {
        name: name.trim(),
        color: color || '#3B82F6',
        category,
        description,
        userId: session.user.id
      },
      include: {
        _count: {
          select: {
            contactTags: true,
            companyTags: true
          }
        }
      }
    })

    return NextResponse.json({ tag }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating tag:', error)
    return NextResponse.json(
      { error: 'Failed to create tag' },
      { status: 500 }
    )
  }
}
