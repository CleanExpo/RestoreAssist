'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Star,
  MessageSquare,
  AlertTriangle,
  CheckCircle,
  ThumbsUp,
  ThumbsDown,
  Send
} from 'lucide-react'

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
  disputeStatus: string
  status: string
  isVerifiedJob: boolean
  helpfulCount: number
  notHelpfulCount: number
  createdAt: string
  clientName: string
  reportTitle: string | null
}

export default function ContractorReviewsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedReview, setSelectedReview] = useState<string | null>(null)
  const [responseText, setResponseText] = useState('')
  const [disputeReason, setDisputeReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated') {
      fetchReviews()
    }
  }, [status])

  const fetchReviews = async () => {
    try {
      // Get contractor's slug first
      const profileRes = await fetch('/api/contractors/profile')
      if (!profileRes.ok) return

      const profileData = await profileRes.json()
      const slug = profileData.profile?.slug

      if (!slug) return

      // Fetch reviews for this contractor
      const reviewsRes = await fetch(`/api/contractors/reviews?contractorSlug=${slug}`)
      if (reviewsRes.ok) {
        const reviewsData = await reviewsRes.json()
        setReviews(reviewsData.reviews || [])
      }
    } catch (error) {
      console.error('Failed to fetch reviews:', error)
    } finally {
      setLoading(false)
    }
  }

  const submitResponse = async (reviewId: string) => {
    if (!responseText.trim()) {
      setMessage({ type: 'error', text: 'Please enter a response' })
      return
    }

    setSubmitting(true)
    setMessage(null)

    try {
      const res = await fetch(`/api/contractors/reviews/${reviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractorResponse: responseText })
      })

      if (res.ok) {
        setMessage({ type: 'success', text: 'Response submitted successfully' })
        setSelectedReview(null)
        setResponseText('')
        await fetchReviews()
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || 'Failed to submit response' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to submit response' })
    } finally {
      setSubmitting(false)
    }
  }

  const submitDispute = async (reviewId: string) => {
    if (!disputeReason.trim()) {
      setMessage({ type: 'error', text: 'Please provide a reason for the dispute' })
      return
    }

    if (!confirm('Are you sure you want to dispute this review? This action cannot be undone.')) {
      return
    }

    setSubmitting(true)
    setMessage(null)

    try {
      const res = await fetch(`/api/contractors/reviews/${reviewId}/dispute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disputeReason })
      })

      if (res.ok) {
        setMessage({ type: 'success', text: 'Dispute submitted successfully' })
        setDisputeReason('')
        await fetchReviews()
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || 'Failed to submit dispute' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to submit dispute' })
    } finally {
      setSubmitting(false)
    }
  }

  const getDisputeStatusColor = (status: string) => {
    switch (status) {
      case 'NONE':
        return 'text-slate-400'
      case 'PENDING_REVIEW':
        return 'text-amber-400'
      case 'UNDER_INVESTIGATION':
        return 'text-cyan-400'
      case 'RESOLVED_KEPT':
        return 'text-green-400'
      case 'RESOLVED_AMENDED':
        return 'text-blue-400'
      case 'RESOLVED_REMOVED':
        return 'text-red-400'
      default:
        return 'text-slate-400'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-400">Loading reviews...</div>
      </div>
    )
  }

  // Calculate stats
  const totalReviews = reviews.length
  const averageRating = totalReviews > 0
    ? reviews.reduce((sum, r) => sum + r.overallRating, 0) / totalReviews
    : 0
  const pendingResponses = reviews.filter(r => !r.contractorResponse).length
  const disputedReviews = reviews.filter(r => r.disputeStatus !== 'NONE').length

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-white mb-8">Manage Reviews</h1>

      {/* Message */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
            message.type === 'success'
              ? 'bg-green-500/10 border border-green-500/30 text-green-400'
              : 'bg-red-500/10 border border-red-500/30 text-red-400'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="h-5 w-5" />
          ) : (
            <AlertTriangle className="h-5 w-5" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-6">
          <div className="text-slate-400 text-sm mb-2">Total Reviews</div>
          <div className="text-3xl font-bold text-white">{totalReviews}</div>
        </div>

        <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-6">
          <div className="text-slate-400 text-sm mb-2">Average Rating</div>
          <div className="flex items-center gap-2">
            <Star className="h-6 w-6 text-amber-400 fill-amber-400" />
            <div className="text-3xl font-bold text-white">{averageRating.toFixed(1)}</div>
          </div>
        </div>

        <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-6">
          <div className="text-slate-400 text-sm mb-2">Pending Responses</div>
          <div className="text-3xl font-bold text-amber-400">{pendingResponses}</div>
        </div>

        <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-6">
          <div className="text-slate-400 text-sm mb-2">Disputed Reviews</div>
          <div className="text-3xl font-bold text-red-400">{disputedReviews}</div>
        </div>
      </div>

      {/* Reviews List */}
      {reviews.length === 0 ? (
        <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-12 text-center">
          <p className="text-slate-400 text-lg">No reviews yet</p>
        </div>
      ) : (
        <div className="space-y-6">
          {reviews.map((review) => (
            <div
              key={review.id}
              className="bg-slate-800/30 border border-slate-700 rounded-lg p-6"
            >
              {/* Review Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-medium text-white">{review.clientName}</span>
                    {review.isVerifiedJob && (
                      <span className="text-xs px-2 py-1 bg-green-500/10 border border-green-500/30 rounded text-green-400">
                        Verified Job
                      </span>
                    )}
                    {review.disputeStatus !== 'NONE' && (
                      <span
                        className={`text-xs px-2 py-1 bg-red-500/10 border border-red-500/30 rounded ${getDisputeStatusColor(
                          review.disputeStatus
                        )}`}
                      >
                        {review.disputeStatus.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`h-5 w-5 ${
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

              {/* Review Content */}
              {review.reviewTitle && (
                <h4 className="font-semibold text-white mb-2">{review.reviewTitle}</h4>
              )}
              <p className="text-slate-300 mb-4">{review.reviewText}</p>

              {/* Sub-ratings */}
              {(review.qualityRating || review.timelinessRating || review.communicationRating || review.valueRating) && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 p-4 bg-slate-700/20 rounded-lg">
                  {review.qualityRating && (
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Quality</div>
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                        <span className="text-white font-medium">{review.qualityRating}</span>
                      </div>
                    </div>
                  )}
                  {review.timelinessRating && (
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Timeliness</div>
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                        <span className="text-white font-medium">{review.timelinessRating}</span>
                      </div>
                    </div>
                  )}
                  {review.communicationRating && (
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Communication</div>
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                        <span className="text-white font-medium">{review.communicationRating}</span>
                      </div>
                    </div>
                  )}
                  {review.valueRating && (
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Value</div>
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                        <span className="text-white font-medium">{review.valueRating}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Existing Response */}
              {review.contractorResponse && (
                <div className="mb-4 pl-4 border-l-2 border-cyan-500/30 bg-slate-700/20 p-4 rounded">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="h-4 w-4 text-cyan-400" />
                    <span className="text-sm font-medium text-cyan-400">Your Response</span>
                    {review.respondedAt && (
                      <span className="text-xs text-slate-400">
                        {new Date(review.respondedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-300 text-sm">{review.contractorResponse}</p>
                </div>
              )}

              {/* Response Form */}
              {!review.contractorResponse && selectedReview === review.id && (
                <div className="mb-4 space-y-3">
                  <textarea
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    placeholder="Write your response to this review..."
                    rows={4}
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => submitResponse(review.id)}
                      disabled={submitting}
                      className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors disabled:opacity-50"
                    >
                      <Send className="h-4 w-4" />
                      {submitting ? 'Submitting...' : 'Submit Response'}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedReview(null)
                        setResponseText('')
                      }}
                      className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-500 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Dispute Form */}
              {review.disputeStatus === 'NONE' && selectedReview === `dispute-${review.id}` && (
                <div className="mb-4 space-y-3">
                  <textarea
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    placeholder="Explain why you're disputing this review..."
                    rows={4}
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => submitDispute(review.id)}
                      disabled={submitting}
                      className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                    >
                      <AlertTriangle className="h-4 w-4" />
                      {submitting ? 'Submitting...' : 'Submit Dispute'}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedReview(null)
                        setDisputeReason('')
                      }}
                      className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-500 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-4">
                {!review.contractorResponse && selectedReview !== review.id && (
                  <button
                    onClick={() => setSelectedReview(review.id)}
                    className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Respond to Review
                  </button>
                )}

                {review.disputeStatus === 'NONE' && selectedReview !== `dispute-${review.id}` && (
                  <button
                    onClick={() => setSelectedReview(`dispute-${review.id}`)}
                    className="flex items-center gap-2 text-red-400 hover:text-red-300"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    Dispute Review
                  </button>
                )}

                <div className="ml-auto flex items-center gap-4 text-sm text-slate-400">
                  <span className="flex items-center gap-1">
                    <ThumbsUp className="h-4 w-4" />
                    {review.helpfulCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <ThumbsDown className="h-4 w-4" />
                    {review.notHelpfulCount}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
