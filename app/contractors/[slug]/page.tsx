'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import {
  Star,
  Shield,
  MapPin,
  Phone,
  Mail,
  Globe,
  Users,
  Award,
  Briefcase,
  Calendar,
  Lock,
  ThumbsUp,
  ThumbsDown
} from 'lucide-react'

interface ContractorProfile {
  id: string
  slug: string
  businessName: string
  businessLogo: string | null
  businessAddress: string | null
  publicDescription: string | null
  yearsInBusiness: number | null
  teamSize: number | null
  isVerified: boolean
  verifiedAt: string | null
  averageRating: number
  totalReviews: number
  completedJobs: number
  responseRatePercent: number | null
  averageResponseHours: number | null
  specializations: string[]
  servicesOffered: string | null
  insuranceCertificate: string | null
  phoneNumber?: string
  email?: string
  website?: string
}

interface Certification {
  id: string
  certificationType: string
  certificationName: string
  issuingBody: string
  issueDate: string
  expiryDate: string | null
}

interface ServiceArea {
  postcode: string
  suburb: string | null
  state: string
  radius: number | null
}

interface Review {
  id: string
  overallRating: number
  qualityRating: number | null
  timelinessRating: number | null
  communicationRating: number | null
  valueRating: number | null
  reviewTitle: string | null
  reviewText: string
  contractorResponse: string | null
  respondedAt: string | null
  isVerifiedJob: boolean
  helpfulCount: number
  notHelpfulCount: number
  createdAt: string
  clientName: string
  reportTitle: string | null
}

interface ProfileData {
  contractor: ContractorProfile
  certifications: Certification[]
  serviceAreas: ServiceArea[]
  reviews: Review[]
  ratingBreakdown: Record<number, number>
  subRatings: {
    quality: number | null
    timeliness: number | null
    communication: number | null
    value: number | null
  }
  requiresAuthForContact: boolean
}

export default function ContractorProfilePage() {
  const params = useParams()
  const { data: session } = useSession()
  const [data, setData] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProfile()
  }, [params.slug, session])

  const fetchProfile = async () => {
    try {
      const res = await fetch(`/api/contractors/${params.slug}`)
      if (!res.ok) {
        throw new Error('Contractor not found')
      }
      const profileData = await res.json()
      setData(profileData)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-slate-400 text-lg">Loading contractor profile...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-4">{error || 'Contractor not found'}</p>
          <Link href="/contractors" className="text-cyan-400 hover:text-cyan-300">
            Back to directory
          </Link>
        </div>
      </div>
    )
  }

  const { contractor, certifications, serviceAreas, reviews, ratingBreakdown, subRatings, requiresAuthForContact } = data

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700/50 bg-black/20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link href="/contractors" className="text-cyan-400 hover:text-cyan-300 mb-4 inline-block">
            ← Back to directory
          </Link>

          <div className="flex items-start gap-6">
            {/* Logo */}
            {contractor.businessLogo ? (
              <Image
                src={contractor.businessLogo}
                alt={contractor.businessName}
                width={120}
                height={120}
                className="rounded-lg border border-slate-700"
              />
            ) : (
              <div className="w-30 h-30 rounded-lg bg-slate-700/50 flex items-center justify-center">
                <Users className="h-12 w-12 text-slate-500" />
              </div>
            )}

            {/* Business Info */}
            <div className="flex-1">
              <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
                {contractor.businessName}
                {contractor.isVerified && (
                  <span className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded-full text-sm text-cyan-400">
                    <Shield className="h-4 w-4" />
                    Verified
                  </span>
                )}
              </h1>

              {/* Rating */}
              {contractor.totalReviews > 0 && (
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`h-6 w-6 ${
                          i < Math.floor(contractor.averageRating)
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-slate-600'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xl font-semibold text-white">
                    {contractor.averageRating.toFixed(1)}
                  </span>
                  <span className="text-slate-400">
                    ({contractor.totalReviews} reviews)
                  </span>
                </div>
              )}

              {/* Quick Stats */}
              <div className="flex flex-wrap items-center gap-6 text-slate-300">
                {contractor.yearsInBusiness && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-cyan-400" />
                    <span>{contractor.yearsInBusiness} years in business</span>
                  </div>
                )}
                {contractor.teamSize && (
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-cyan-400" />
                    <span>{contractor.teamSize} team members</span>
                  </div>
                )}
                {contractor.completedJobs > 0 && (
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-cyan-400" />
                    <span>{contractor.completedJobs} completed jobs</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* About */}
            {contractor.publicDescription && (
              <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-6">
                <h2 className="text-2xl font-semibold text-white mb-4">About</h2>
                <p className="text-slate-300 whitespace-pre-wrap">{contractor.publicDescription}</p>
              </div>
            )}

            {/* Specializations */}
            {contractor.specializations.length > 0 && (
              <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-6">
                <h2 className="text-2xl font-semibold text-white mb-4">Specializations</h2>
                <div className="flex flex-wrap gap-2">
                  {contractor.specializations.map((spec, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 bg-slate-700/50 border border-slate-600 rounded-full text-slate-300"
                    >
                      {spec}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Reviews */}
            {reviews.length > 0 && (
              <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-6">
                <h2 className="text-2xl font-semibold text-white mb-6">Reviews</h2>

                {/* Rating Breakdown */}
                {subRatings.quality && (
                  <div className="mb-6 grid grid-cols-2 gap-4">
                    {subRatings.quality && (
                      <div>
                        <div className="text-sm text-slate-400 mb-1">Quality</div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                          <span className="text-white font-medium">{subRatings.quality.toFixed(1)}</span>
                        </div>
                      </div>
                    )}
                    {subRatings.timeliness && (
                      <div>
                        <div className="text-sm text-slate-400 mb-1">Timeliness</div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                          <span className="text-white font-medium">{subRatings.timeliness.toFixed(1)}</span>
                        </div>
                      </div>
                    )}
                    {subRatings.communication && (
                      <div>
                        <div className="text-sm text-slate-400 mb-1">Communication</div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                          <span className="text-white font-medium">{subRatings.communication.toFixed(1)}</span>
                        </div>
                      </div>
                    )}
                    {subRatings.value && (
                      <div>
                        <div className="text-sm text-slate-400 mb-1">Value</div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                          <span className="text-white font-medium">{subRatings.value.toFixed(1)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Individual Reviews */}
                <div className="space-y-6">
                  {reviews.map((review) => (
                    <div key={review.id} className="border-t border-slate-700 pt-6 first:border-0 first:pt-0">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-medium text-white">{review.clientName}</span>
                            {review.isVerifiedJob && (
                              <span className="text-xs px-2 py-1 bg-green-500/10 border border-green-500/30 rounded text-green-400">
                                Verified Job
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={`h-4 w-4 ${
                                  i < review.overallRating
                                    ? 'text-amber-400 fill-amber-400'
                                    : 'text-slate-600'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                        <span className="text-sm text-slate-400">
                          {new Date(review.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      {review.reviewTitle && (
                        <h4 className="font-semibold text-white mb-2">{review.reviewTitle}</h4>
                      )}
                      <p className="text-slate-300 mb-3">{review.reviewText}</p>

                      {/* Contractor Response */}
                      {review.contractorResponse && (
                        <div className="mt-4 pl-4 border-l-2 border-cyan-500/30 bg-slate-700/20 p-4 rounded">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-medium text-cyan-400">Response from {contractor.businessName}</span>
                            {review.respondedAt && (
                              <span className="text-xs text-slate-400">
                                {new Date(review.respondedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <p className="text-slate-300 text-sm">{review.contractorResponse}</p>
                        </div>
                      )}

                      {/* Helpful Buttons */}
                      <div className="flex items-center gap-4 mt-4 text-sm text-slate-400">
                        <span>Was this review helpful?</span>
                        <button className="flex items-center gap-1 hover:text-cyan-400">
                          <ThumbsUp className="h-4 w-4" />
                          <span>{review.helpfulCount}</span>
                        </button>
                        <button className="flex items-center gap-1 hover:text-red-400">
                          <ThumbsDown className="h-4 w-4" />
                          <span>{review.notHelpfulCount}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Contact Info */}
            <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-white mb-4">Contact Information</h3>

              {requiresAuthForContact ? (
                <div className="text-center py-6">
                  <Lock className="h-12 w-12 text-slate-500 mx-auto mb-3" />
                  <p className="text-slate-400 mb-4">Sign in to view contact details</p>
                  <Link
                    href="/login"
                    className="inline-block px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
                  >
                    Sign In
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {contractor.phoneNumber && (
                    <div className="flex items-center gap-3 text-slate-300">
                      <Phone className="h-5 w-5 text-cyan-400" />
                      <a href={`tel:${contractor.phoneNumber}`} className="hover:text-cyan-400">
                        {contractor.phoneNumber}
                      </a>
                    </div>
                  )}
                  {contractor.email && (
                    <div className="flex items-center gap-3 text-slate-300">
                      <Mail className="h-5 w-5 text-cyan-400" />
                      <a href={`mailto:${contractor.email}`} className="hover:text-cyan-400">
                        {contractor.email}
                      </a>
                    </div>
                  )}
                  {contractor.website && (
                    <div className="flex items-center gap-3 text-slate-300">
                      <Globe className="h-5 w-5 text-cyan-400" />
                      <a
                        href={contractor.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-cyan-400"
                      >
                        Visit Website
                      </a>
                    </div>
                  )}
                  {contractor.businessAddress && (
                    <div className="flex items-start gap-3 text-slate-300">
                      <MapPin className="h-5 w-5 text-cyan-400 flex-shrink-0 mt-1" />
                      <span>{contractor.businessAddress}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Certifications */}
            {certifications.length > 0 && (
              <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-6">
                <h3 className="text-xl font-semibold text-white mb-4">Certifications</h3>
                <div className="space-y-3">
                  {certifications.map((cert) => (
                    <div key={cert.id} className="flex items-start gap-3">
                      <Award className="h-5 w-5 text-cyan-400 flex-shrink-0 mt-1" />
                      <div>
                        <div className="font-medium text-white">{cert.certificationName}</div>
                        <div className="text-sm text-slate-400">{cert.issuingBody}</div>
                        {cert.expiryDate && (
                          <div className="text-xs text-slate-500 mt-1">
                            Expires: {new Date(cert.expiryDate).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Service Areas */}
            {serviceAreas.length > 0 && (
              <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-6">
                <h3 className="text-xl font-semibold text-white mb-4">Service Areas</h3>
                <div className="space-y-2">
                  {serviceAreas.slice(0, 10).map((area, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-slate-300">
                      <MapPin className="h-4 w-4 text-cyan-400" />
                      <span>
                        {area.suburb ? `${area.suburb}, ` : ''}{area.postcode}, {area.state}
                      </span>
                    </div>
                  ))}
                  {serviceAreas.length > 10 && (
                    <div className="text-sm text-slate-400 pt-2">
                      +{serviceAreas.length - 10} more areas
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
