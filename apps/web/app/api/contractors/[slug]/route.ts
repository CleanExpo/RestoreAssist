import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    const isAuthenticated = !!session?.user

    const contractor = await prisma.contractorProfile.findUnique({
      where: {
        slug: params.slug,
        isPubliclyVisible: true
      },
      include: {
        user: {
          select: {
            id: true,
            businessName: true,
            businessLogo: true,
            businessAddress: true,
            // Conditionally include contact info only for authenticated users
            ...(isAuthenticated && {
              phoneNumber: true,
              email: true,
              website: true
            })
          }
        },
        certifications: {
          where: { verificationStatus: 'VERIFIED' },
          select: {
            id: true,
            certificationType: true,
            certificationName: true,
            issuingBody: true,
            issueDate: true,
            expiryDate: true
          },
          orderBy: { issueDate: 'desc' }
        },
        serviceAreas: {
          where: { isActive: true },
          select: {
            postcode: true,
            suburb: true,
            state: true,
            radius: true
          },
          orderBy: [
            { priority: 'desc' },
            { postcode: 'asc' }
          ]
        },
        reviews: {
          where: {
            status: 'PUBLISHED',
            disputeStatus: { notIn: ['UNDER_INVESTIGATION', 'RESOLVED_REMOVED'] }
          },
          include: {
            clientUser: {
              select: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true
                  }
                }
              }
            },
            report: {
              select: {
                id: true,
                title: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 20
        }
      }
    })

    if (!contractor) {
      return NextResponse.json(
        { error: 'Contractor not found' },
        { status: 404 }
      )
    }

    // Calculate rating breakdown
    const ratingBreakdown = await prisma.contractorReview.groupBy({
      by: ['overallRating'],
      where: {
        profileId: contractor.id,
        status: 'PUBLISHED',
        disputeStatus: { notIn: ['UNDER_INVESTIGATION', 'RESOLVED_REMOVED'] }
      },
      _count: true
    })

    // Calculate average sub-ratings
    const subRatings = await prisma.contractorReview.aggregate({
      where: {
        profileId: contractor.id,
        status: 'PUBLISHED',
        disputeStatus: { notIn: ['UNDER_INVESTIGATION', 'RESOLVED_REMOVED'] }
      },
      _avg: {
        qualityRating: true,
        timelinessRating: true,
        communicationRating: true,
        valueRating: true
      }
    })

    return NextResponse.json({
      contractor: {
        id: contractor.id,
        slug: contractor.slug,
        businessName: contractor.user.businessName,
        businessLogo: contractor.user.businessLogo,
        businessAddress: contractor.user.businessAddress,
        publicDescription: contractor.publicDescription,
        yearsInBusiness: contractor.yearsInBusiness,
        teamSize: contractor.teamSize,
        isVerified: contractor.isVerified,
        verifiedAt: contractor.verifiedAt,
        averageRating: contractor.averageRating,
        totalReviews: contractor.totalReviews,
        completedJobs: contractor.completedJobs,
        responseRatePercent: contractor.responseRatePercent,
        averageResponseHours: contractor.averageResponseHours,
        specializations: contractor.specializations,
        servicesOffered: contractor.servicesOffered,
        insuranceCertificate: contractor.insuranceCertificate,
        // Contact info only for authenticated users
        ...(isAuthenticated && {
          phoneNumber: contractor.user.phoneNumber,
          email: contractor.user.email,
          website: contractor.user.website
        })
      },
      certifications: contractor.certifications,
      serviceAreas: contractor.serviceAreas,
      reviews: contractor.reviews.map(r => ({
        id: r.id,
        overallRating: r.overallRating,
        qualityRating: r.qualityRating,
        timelinessRating: r.timelinessRating,
        communicationRating: r.communicationRating,
        valueRating: r.valueRating,
        reviewTitle: r.reviewTitle,
        reviewText: r.reviewText,
        contractorResponse: r.contractorResponse,
        respondedAt: r.respondedAt,
        isVerifiedJob: r.isVerifiedJob,
        helpfulCount: r.helpfulCount,
        notHelpfulCount: r.notHelpfulCount,
        createdAt: r.createdAt,
        clientName: `${r.clientUser.user.firstName} ${r.clientUser.user.lastName.charAt(0)}.`,
        reportTitle: r.report?.title
      })),
      ratingBreakdown: ratingBreakdown.reduce((acc, item) => {
        acc[item.overallRating] = item._count
        return acc
      }, {} as Record<number, number>),
      subRatings: {
        quality: subRatings._avg.qualityRating,
        timeliness: subRatings._avg.timelinessRating,
        communication: subRatings._avg.communicationRating,
        value: subRatings._avg.valueRating
      },
      requiresAuthForContact: !isAuthenticated
    })
  } catch (error: any) {
    console.error('Error fetching contractor profile:', error)
    return NextResponse.json(
      { error: 'Failed to fetch contractor profile' },
      { status: 500 }
    )
  }
}
