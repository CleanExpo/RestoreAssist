import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Query parameters
    const search = searchParams.get('search')
    const postcode = searchParams.get('postcode')
    const state = searchParams.get('state')
    const certification = searchParams.get('certification')
    const minRating = searchParams.get('minRating')
    const specialization = searchParams.get('specialization')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)

    // Build where clause
    const where: any = {
      isPubliclyVisible: true
    }

    // Search filter
    if (search) {
      where.OR = [
        { user: { businessName: { contains: search, mode: 'insensitive' } } },
        { publicDescription: { contains: search, mode: 'insensitive' } },
        { specializations: { hasSome: [search] } }
      ]
    }

    // Postcode filter
    if (postcode) {
      where.serviceAreas = {
        some: {
          postcode,
          isActive: true
        }
      }
    }

    // State filter
    if (state) {
      where.serviceAreas = {
        some: {
          state,
          isActive: true
        }
      }
    }

    // Certification filter
    if (certification) {
      where.certifications = {
        some: {
          certificationType: certification,
          verificationStatus: 'VERIFIED'
        }
      }
    }

    // Minimum rating filter
    if (minRating) {
      const rating = parseFloat(minRating)
      if (!isNaN(rating)) {
        where.averageRating = { gte: rating }
      }
    }

    // Specialization filter
    if (specialization) {
      where.specializations = {
        has: specialization
      }
    }

    // Fetch contractors
    const [contractors, total] = await Promise.all([
      prisma.contractorProfile.findMany({
        where,
        include: {
          user: {
            select: {
              businessName: true,
              businessLogo: true,
              businessAddress: true
            }
          },
          certifications: {
            where: { verificationStatus: 'VERIFIED' },
            select: {
              certificationType: true,
              certificationName: true
            }
          },
          serviceAreas: {
            where: { isActive: true },
            select: {
              postcode: true,
              suburb: true,
              state: true
            },
            take: 5
          }
        },
        orderBy: [
          { isVerified: 'desc' },
          { averageRating: 'desc' },
          { totalReviews: 'desc' }
        ],
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.contractorProfile.count({ where })
    ])

    return NextResponse.json({
      contractors: contractors.map(c => ({
        id: c.id,
        slug: c.slug,
        businessName: c.user.businessName,
        businessLogo: c.user.businessLogo,
        businessAddress: c.user.businessAddress,
        publicDescription: c.publicDescription,
        yearsInBusiness: c.yearsInBusiness,
        teamSize: c.teamSize,
        isVerified: c.isVerified,
        averageRating: c.averageRating,
        totalReviews: c.totalReviews,
        completedJobs: c.completedJobs,
        specializations: c.specializations,
        certifications: c.certifications,
        serviceAreas: c.serviceAreas
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error: any) {
    console.error('Error fetching contractors:', error)
    return NextResponse.json(
      { error: 'Failed to fetch contractors' },
      { status: 500 }
    )
  }
}
