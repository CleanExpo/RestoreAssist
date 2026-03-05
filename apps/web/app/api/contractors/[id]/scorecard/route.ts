import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

interface ScorecardMetrics {
  overallScore: number
  jobCompletionRate: number
  avgResponseTimeHours: number | null
  avgClientRating: number
  jobsThisMonth: number
  totalCompletedJobs: number
  totalJobs: number
  complianceScore: number
  certifications: {
    id: string
    certificationName: string
    certificationType: string
    issuingBody: string
    expiryDate: string | null
    verificationStatus: string
    isExpiringSoon: boolean
  }[]
  recentJobs: {
    id: string
    title: string
    status: string
    clientName: string
    createdAt: string
    completedAt: string | null
  }[]
  recentReviews: {
    id: string
    overallRating: number
    reviewTitle: string | null
    reviewText: string
    clientName: string
    createdAt: string
  }[]
  contractorName: string
  isVerified: boolean
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = params

    const profile = await prisma.contractorProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            businessName: true,
          }
        },
        certifications: {
          orderBy: { expiryDate: 'asc' },
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
                    lastName: true,
                  }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      }
    })

    if (!profile) {
      return NextResponse.json(
        { error: 'Contractor not found' },
        { status: 404 }
      )
    }

    // Get reports created by this contractor (jobs)
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    const [allReports, completedReports, monthlyReports, recentReports] = await Promise.all([
      prisma.report.count({
        where: { userId: profile.user.id }
      }),
      prisma.report.count({
        where: {
          userId: profile.user.id,
          status: 'COMPLETED',
        }
      }),
      prisma.report.count({
        where: {
          userId: profile.user.id,
          createdAt: { gte: startOfMonth },
        }
      }),
      prisma.report.findMany({
        where: { userId: profile.user.id },
        select: {
          id: true,
          title: true,
          status: true,
          clientName: true,
          createdAt: true,
          completionDate: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ])

    // Calculate metrics
    const jobCompletionRate = allReports > 0
      ? Math.round((completedReports / allReports) * 100)
      : 0

    const avgClientRating = profile.averageRating ?? 0
    const avgResponseTimeHours = profile.averageResponseHours ?? null

    // Certification compliance: verified certs count, check for expiring
    const certs = profile.certifications
    type Cert = typeof certs[number]
    const verifiedCerts = certs.filter(
      (c: Cert) => c.verificationStatus === 'VERIFIED'
    )
    const totalCerts = certs.length
    const certComplianceScore = totalCerts > 0
      ? Math.round((verifiedCerts.length / totalCerts) * 100)
      : 0

    // Check for expiring certifications
    const certData = certs.map((c: typeof certs[number]) => ({
      id: c.id,
      certificationName: c.certificationName,
      certificationType: c.certificationType,
      issuingBody: c.issuingBody,
      expiryDate: c.expiryDate?.toISOString() ?? null,
      verificationStatus: c.verificationStatus,
      isExpiringSoon: c.expiryDate
        ? c.expiryDate <= thirtyDaysFromNow && c.expiryDate > now
        : false,
    }))

    // Overall score: weighted combination
    // 30% job completion, 30% client rating (normalized to 100), 20% response time, 20% compliance
    const ratingScore = (avgClientRating / 5) * 100
    const responseScore = avgResponseTimeHours !== null
      ? Math.max(0, 100 - (avgResponseTimeHours * 2)) // Penalize slow response (50hrs = 0)
      : 50 // Neutral if no data
    const overallScore = Math.round(
      jobCompletionRate * 0.3 +
      ratingScore * 0.3 +
      responseScore * 0.2 +
      certComplianceScore * 0.2
    )

    const metrics: ScorecardMetrics = {
      overallScore: Math.min(100, Math.max(0, overallScore)),
      jobCompletionRate,
      avgResponseTimeHours,
      avgClientRating,
      jobsThisMonth: monthlyReports,
      totalCompletedJobs: completedReports,
      totalJobs: allReports,
      complianceScore: certComplianceScore,
      certifications: certData,
      recentJobs: recentReports.map((r: typeof recentReports[number]) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        clientName: r.clientName,
        createdAt: r.createdAt.toISOString(),
        completedAt: r.completionDate?.toISOString() ?? null,
      })),
      recentReviews: profile.reviews.map((r: typeof profile.reviews[number]) => ({
        id: r.id,
        overallRating: r.overallRating,
        reviewTitle: r.reviewTitle,
        reviewText: r.reviewText,
        clientName: `${r.clientUser.user.firstName} ${r.clientUser.user.lastName.charAt(0)}.`,
        createdAt: r.createdAt.toISOString(),
      })),
      contractorName: profile.user.businessName ?? 'Contractor',
      isVerified: profile.isVerified,
    }

    return NextResponse.json(metrics)
  } catch (error) {
    console.error('Error fetching contractor scorecard:', error)
    return NextResponse.json(
      { error: 'Failed to fetch scorecard data' },
      { status: 500 }
    )
  }
}
