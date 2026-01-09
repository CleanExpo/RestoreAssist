'use client'

import React, { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle2, AlertCircle, Zap, FileText, Users } from 'lucide-react'

/**
 * Premium Inspection Reports Subscription Page
 * Route: /dashboard/subscriptions/inspection-reports
 *
 * Allows users to:
 * - View current subscription status
 * - Upgrade to premium tier
 * - Cancel subscription
 * - See feature comparison
 */
export default function InspectionReportsSubscriptionPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [subscriptionStatus, setSubscriptionStatus] = useState<{
    hasAccess: boolean
    subscriptionStatus: string | null
    subscriptionEndsAt: string | null
    isActive: boolean
  } | null>(null)

  // Fetch subscription status on mount
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
      return
    }

    if (status === 'authenticated' && session?.user?.id) {
      fetchSubscriptionStatus()
    }
  }, [status, session, router])

  /**
   * Fetch current subscription status
   */
  const fetchSubscriptionStatus = async () => {
    try {
      const response = await fetch('/api/subscriptions/inspection-reports/status')
      if (response.ok) {
        const data = await response.json()
        setSubscriptionStatus(data)
      }
    } catch (err) {
      console.error('Error fetching subscription status:', err)
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Handle upgrade to premium
   */
  const handleUpgrade = async () => {
    try {
      setIsProcessing(true)
      setError(null)

      const response = await fetch('/api/subscriptions/inspection-reports/checkout', {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error('Failed to start checkout')
      }

      const { checkoutUrl } = await response.json()
      window.location.href = checkoutUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process upgrade')
      setIsProcessing(false)
    }
  }

  /**
   * Handle cancel subscription
   */
  const handleCancel = async () => {
    if (!confirm('Are you sure? Your premium access will end at the end of the billing period.')) {
      return
    }

    try {
      setIsProcessing(true)
      setError(null)

      const response = await fetch('/api/subscriptions/inspection-reports/cancel', {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error('Failed to cancel subscription')
      }

      // Refresh subscription status
      await fetchSubscriptionStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel subscription')
    } finally {
      setIsProcessing(false)
    }
  }

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 rounded-full border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading subscription details...</p>
        </div>
      </div>
    )
  }

  const hasAccess = subscriptionStatus?.hasAccess ?? false
  const isActive = subscriptionStatus?.isActive ?? false

  return (
    <div className="space-y-8 py-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Premium Inspection Reports</h1>
        <p className="mt-2 text-gray-600">
          Generate 3-stakeholder PDF reports optimized for Insurance, Client, and Internal use
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Current Status Card */}
      {hasAccess && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-green-900">
                  <CheckCircle2 className="h-5 w-5" />
                  Premium Active
                </CardTitle>
                <CardDescription className="text-green-800">
                  {isActive
                    ? 'Your subscription is active'
                    : 'Your subscription will expire on ' +
                      new Date(subscriptionStatus?.subscriptionEndsAt || '').toLocaleDateString()}
                </CardDescription>
              </div>
              <Badge className="bg-green-600">Active</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Subscription Status</p>
                <p className="text-lg font-semibold text-gray-900">{subscriptionStatus?.subscriptionStatus}</p>
              </div>
              {subscriptionStatus?.subscriptionEndsAt && (
                <div>
                  <p className="text-sm text-gray-600">Renews</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {new Date(subscriptionStatus.subscriptionEndsAt).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>

            <Button onClick={handleCancel} variant="outline" disabled={isProcessing}>
              {isProcessing ? 'Processing...' : 'Cancel Subscription'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* No Access Card */}
      {!hasAccess && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-blue-900">
                  <Zap className="h-5 w-5" />
                  Upgrade to Premium
                </CardTitle>
                <CardDescription className="text-blue-800">
                  Unlock 3-stakeholder PDF generation for your inspection reports
                </CardDescription>
              </div>
              <Badge variant="outline" className="bg-blue-100 text-blue-700">
                Not Active
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Button onClick={handleUpgrade} disabled={isProcessing} className="w-full gap-2">
              <Zap className="h-4 w-4" />
              {isProcessing ? 'Processing...' : 'Upgrade Now - $49/month'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Features Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>What's Included</CardTitle>
          <CardDescription>Premium feature comparison</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Feature 1 */}
            <div className="flex items-start gap-3 pb-4 border-b">
              <FileText className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">3 Stakeholder PDF Variants</p>
                <p className="text-sm text-gray-600">
                  Insurance (technical), Client (simplified), Internal (operational)
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="flex items-start gap-3 pb-4 border-b">
              <FileText className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">IICRC S500 Classification</p>
                <p className="text-sm text-gray-600">
                  Water damage assessment with equipment recommendations
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="flex items-start gap-3 pb-4 border-b">
              <FileText className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">Australian GST Breakdown</p>
                <p className="text-sm text-gray-600">
                  Automatic 10% GST calculation for all cost estimates
                </p>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="flex items-start gap-3 pb-4 border-b">
              <FileText className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">State-Specific Compliance</p>
                <p className="text-sm text-gray-600">
                  Building codes, electrical standards, regulatory requirements
                </p>
              </div>
            </div>

            {/* Feature 5 */}
            <div className="flex items-start gap-3 pb-4 border-b">
              <FileText className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">Professional Branding</p>
                <p className="text-sm text-gray-600">
                  Custom business logo, contact details, and formatting
                </p>
              </div>
            </div>

            {/* Feature 6 */}
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">Unlimited PDF Generation</p>
                <p className="text-sm text-gray-600">
                  Generate as many reports as you need each month
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pricing Card */}
      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
          <CardDescription>Simple, transparent pricing</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-blue-50 rounded-lg p-6">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-gray-900">$49</span>
              <span className="text-gray-600">/month AUD</span>
            </div>
            <p className="mt-4 text-gray-600">
              Billed monthly. Cancel anytime. Access ends at the end of your billing period.
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
            <p className="font-medium text-gray-900 mb-2">What happens when I cancel?</p>
            <p>
              You'll retain access to Premium features until the end of your current billing period.
              After that, you'll be able to generate single-stakeholder PDFs (basic reports).
            </p>
          </div>

          {!hasAccess && (
            <Button onClick={handleUpgrade} disabled={isProcessing} className="w-full gap-2" size="lg">
              <Zap className="h-5 w-5" />
              {isProcessing ? 'Processing...' : 'Get Premium - $49/month'}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* FAQ Section */}
      <Card>
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="font-medium text-gray-900">Can I try it free first?</p>
            <p className="text-sm text-gray-600 mt-1">
              Contact our sales team for a 14-day trial of the Premium Inspection Reports feature.
            </p>
          </div>

          <div>
            <p className="font-medium text-gray-900">What payment methods do you accept?</p>
            <p className="text-sm text-gray-600 mt-1">
              We accept all major credit cards (Visa, Mastercard, American Express) via Stripe.
            </p>
          </div>

          <div>
            <p className="font-medium text-gray-900">Can I change my subscription?</p>
            <p className="text-sm text-gray-600 mt-1">
              You can upgrade, downgrade, or cancel your subscription anytime from this page.
              Changes take effect at the start of your next billing cycle.
            </p>
          </div>

          <div>
            <p className="font-medium text-gray-900">Is there a contract?</p>
            <p className="text-sm text-gray-600 mt-1">
              No contracts. You can cancel anytime. Your access continues until the end of your
              billing period.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Support Card */}
      <Card className="bg-gray-50">
        <CardContent className="pt-6">
          <p className="text-sm text-gray-600">
            Questions about Premium Inspection Reports?{' '}
            <a href="mailto:support@restoreassist.app" className="text-blue-600 hover:underline">
              Contact our support team
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
