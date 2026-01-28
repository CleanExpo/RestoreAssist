import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// Get contractor's own profile
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profile = await prisma.contractorProfile.findUnique({
      where: { userId: session.user.id },
      include: {
        user: {
          select: {
            businessName: true,
            businessLogo: true,
            businessAddress: true,
            phoneNumber: true,
            email: true,
            website: true
          }
        },
        certifications: {
          orderBy: { createdAt: 'desc' }
        },
        serviceAreas: {
          orderBy: [
            { priority: 'desc' },
            { postcode: 'asc' }
          ]
        }
      }
    })

    if (!profile) {
      return NextResponse.json(
        { error: 'Contractor profile not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ profile })
  } catch (error: any) {
    console.error('Error fetching contractor profile:', error)
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
      { status: 500 }
    )
  }
}

// Create or update contractor profile
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      publicDescription,
      yearsInBusiness,
      teamSize,
      insuranceCertificate,
      isPubliclyVisible,
      specializations,
      servicesOffered,
      searchKeywords
    } = body

    // Check if user has contractor role
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, businessName: true }
    })

    if (user?.role !== 'CONTRACTOR') {
      return NextResponse.json(
        { error: 'User is not a contractor' },
        { status: 403 }
      )
    }

    // Generate slug from business name
    const slug = user.businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    // Upsert contractor profile
    const profile = await prisma.contractorProfile.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        slug,
        publicDescription,
        yearsInBusiness: yearsInBusiness ? parseInt(yearsInBusiness) : null,
        teamSize: teamSize ? parseInt(teamSize) : null,
        insuranceCertificate,
        isPubliclyVisible: isPubliclyVisible ?? true,
        specializations: specializations || [],
        servicesOffered,
        searchKeywords: searchKeywords || []
      },
      update: {
        publicDescription,
        yearsInBusiness: yearsInBusiness ? parseInt(yearsInBusiness) : null,
        teamSize: teamSize ? parseInt(teamSize) : null,
        insuranceCertificate,
        isPubliclyVisible: isPubliclyVisible ?? true,
        specializations: specializations || [],
        servicesOffered,
        searchKeywords: searchKeywords || []
      },
      include: {
        certifications: true,
        serviceAreas: true
      }
    })

    return NextResponse.json({ profile })
  } catch (error: any) {
    console.error('Error updating contractor profile:', error)

    // Handle unique constraint violation
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'A profile with this slug already exists' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    )
  }
}
