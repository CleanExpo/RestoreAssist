'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Star,
  Shield,
  Clock,
  CheckCircle,
  AlertTriangle,
  Briefcase,
  Award,
  ArrowLeft,
  TrendingUp,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface ScorecardData {
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

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-400'
  if (score >= 60) return 'text-amber-400'
  return 'text-red-400'
}

function getScoreBgColor(score: number): string {
  if (score >= 80) return 'bg-green-500/10 border-green-500/30'
  if (score >= 60) return 'bg-amber-500/10 border-amber-500/30'
  return 'bg-red-500/10 border-red-500/30'
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Good'
  return 'Needs Improvement'
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'COMPLETED':
      return 'bg-green-500/10 text-green-400 border-green-500/30'
    case 'APPROVED':
      return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
    case 'PENDING':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/30'
    case 'DRAFT':
      return 'bg-slate-500/10 text-slate-400 border-slate-500/30'
    case 'ARCHIVED':
      return 'bg-slate-500/10 text-slate-500 border-slate-600/30'
    default:
      return 'bg-slate-500/10 text-slate-400 border-slate-500/30'
  }
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[...Array(5)].map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${
            i < Math.floor(rating)
              ? 'text-amber-400 fill-amber-400'
              : i < rating
                ? 'text-amber-400 fill-amber-400 opacity-50'
                : 'text-slate-600'
          }`}
        />
      ))}
    </div>
  )
}

export function ScorecardClient() {
  const params = useParams()
  const [data, setData] = useState<ScorecardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchScorecard() {
      try {
        const res = await fetch(`/api/contractors/${params.id}/scorecard`)
        if (!res.ok) {
          const body = await res.json()
          throw new Error(body.error || 'Failed to load scorecard')
        }
        const scorecard: ScorecardData = await res.json()
        setData(scorecard)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load scorecard')
      } finally {
        setLoading(false)
      }
    }

    if (params.id) {
      fetchScorecard()
    }
  }, [params.id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-400 text-lg">Loading scorecard...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-4">{error || 'Scorecard not found'}</p>
          <Link href="/dashboard/contractors/profile">
            <Button variant="outline">Back to Profile</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/contractors/profile"
            className="text-cyan-400 hover:text-cyan-300 text-sm flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            View Full Profile
          </Link>
          <h1 className="text-3xl font-bold text-white">Performance Scorecard</h1>
          <p className="text-slate-400 mt-1">
            {data.contractorName}
            {data.isVerified && (
              <span className="inline-flex items-center gap-1 ml-2 text-cyan-400">
                <Shield className="h-4 w-4" /> Verified
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Overall Score Badge */}
      <Card className={`border ${getScoreBgColor(data.overallScore)}`}>
        <CardContent className="flex items-center justify-between py-6">
          <div>
            <p className="text-sm text-slate-400 mb-1">Overall Performance Score</p>
            <p className="text-lg font-medium text-slate-300">{getScoreLabel(data.overallScore)}</p>
          </div>
          <div className="text-center">
            <div className={`text-5xl font-bold ${getScoreColor(data.overallScore)}`}>
              {data.overallScore}
            </div>
            <div className="text-sm text-slate-400 mt-1">/ 100</div>
          </div>
        </CardContent>
      </Card>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Job Completion Rate */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-400" />
              Job Completion Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{data.jobCompletionRate}%</div>
            <p className="text-xs text-slate-500 mt-1">
              {data.totalCompletedJobs} of {data.totalJobs} jobs completed
            </p>
          </CardContent>
        </Card>

        {/* Avg Response Time */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <Clock className="h-4 w-4 text-cyan-400" />
              Avg Response Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">
              {data.avgResponseTimeHours !== null
                ? `${data.avgResponseTimeHours.toFixed(1)}h`
                : 'N/A'}
            </div>
            <p className="text-xs text-slate-500 mt-1">Average response to new jobs</p>
          </CardContent>
        </Card>

        {/* Client Rating */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-400" />
              Client Rating
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold text-white">
                {data.avgClientRating.toFixed(1)}
              </span>
              <span className="text-slate-400 text-lg">/ 5</span>
            </div>
            <div className="mt-1">
              <StarRating rating={data.avgClientRating} />
            </div>
          </CardContent>
        </Card>

        {/* Jobs This Month */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-purple-400" />
              Jobs This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white">{data.jobsThisMonth}</div>
            <p className="text-xs text-slate-500 mt-1">Reports created this month</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Certification Status Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Award className="h-5 w-5 text-cyan-400" />
              Certification Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.certifications.length === 0 ? (
              <p className="text-slate-400 text-sm">No certifications on file.</p>
            ) : (
              <div className="space-y-3">
                {data.certifications.map((cert) => {
                  const isExpired = cert.expiryDate
                    ? new Date(cert.expiryDate) < new Date()
                    : false

                  return (
                    <div
                      key={cert.id}
                      className="flex items-start justify-between p-3 bg-slate-800/40 rounded-lg border border-slate-700/50"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white text-sm truncate">
                          {cert.certificationName}
                        </p>
                        <p className="text-xs text-slate-400">{cert.issuingBody}</p>
                        {cert.expiryDate && (
                          <p className={`text-xs mt-1 ${
                            isExpired
                              ? 'text-red-400'
                              : cert.isExpiringSoon
                                ? 'text-amber-400'
                                : 'text-slate-500'
                          }`}>
                            {isExpired ? 'Expired: ' : 'Expires: '}
                            {new Date(cert.expiryDate).toLocaleDateString()}
                            {cert.isExpiringSoon && !isExpired && (
                              <span className="ml-1 inline-flex items-center gap-0.5">
                                <AlertTriangle className="h-3 w-3" /> Expiring soon
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant={cert.verificationStatus === 'VERIFIED' ? 'default' : 'outline'}
                        className={
                          cert.verificationStatus === 'VERIFIED'
                            ? 'bg-green-500/10 text-green-400 border-green-500/30'
                            : cert.verificationStatus === 'PENDING'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              : 'bg-red-500/10 text-red-400 border-red-500/30'
                        }
                      >
                        {cert.verificationStatus}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="mt-4 pt-3 border-t border-slate-700/50">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Compliance Score</span>
                <span className={`font-semibold ${getScoreColor(data.complianceScore)}`}>
                  {data.complianceScore}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Jobs Mini-Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Briefcase className="h-5 w-5 text-cyan-400" />
              Recent Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentJobs.length === 0 ? (
              <p className="text-slate-400 text-sm">No jobs found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/50">
                    <TableHead className="text-slate-400">Job</TableHead>
                    <TableHead className="text-slate-400">Client</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentJobs.map((job) => (
                    <TableRow key={job.id} className="border-slate-700/50">
                      <TableCell className="font-medium text-white text-sm max-w-[150px] truncate">
                        {job.title}
                      </TableCell>
                      <TableCell className="text-slate-300 text-sm">
                        {job.clientName}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex px-2 py-0.5 text-xs rounded border ${getStatusBadgeClass(job.status)}`}>
                          {job.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-400 text-xs">
                        {new Date(job.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Client Feedback Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Star className="h-5 w-5 text-amber-400" />
            Recent Client Feedback
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentReviews.length === 0 ? (
            <p className="text-slate-400 text-sm">No reviews yet.</p>
          ) : (
            <div className="space-y-4">
              {data.recentReviews.map((review) => (
                <div
                  key={review.id}
                  className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-white text-sm">{review.clientName}</span>
                      <StarRating rating={review.overallRating} />
                    </div>
                    <span className="text-xs text-slate-500">
                      {new Date(review.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {review.reviewTitle && (
                    <p className="font-medium text-slate-200 text-sm mb-1">{review.reviewTitle}</p>
                  )}
                  <p className="text-slate-400 text-sm line-clamp-3">{review.reviewText}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Back Link */}
      <div className="flex justify-center pt-4">
        <Link href="/dashboard/contractors/profile">
          <Button variant="outline" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            View Full Profile
          </Button>
        </Link>
      </div>
    </div>
  )
}
