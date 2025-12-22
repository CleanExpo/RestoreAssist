"use client"

import { useState, useEffect } from "react"
import { Check, X, Calendar, CreditCard, Download, AlertCircle, CheckCircle, Star, Zap, Shield, Users, Clock, Award, RefreshCw,Crown } from "lucide-react"
import { PRICING_CONFIG, type PricingPlan } from "@/lib/pricing"
import toast from "react-hot-toast"
import { useSession } from "next-auth/react"
import { useSearchParams } from "next/navigation"

interface Subscription {
  id: string
  status: string
  currentPeriodStart: number
  currentPeriodEnd: number
  cancelAtPeriodEnd: boolean
  plan: {
    name: string
    amount: number
    currency: string
    interval: string
  }
}

export default function SubscriptionPage() {
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [canceling, setCanceling] = useState(false)
  const [reactivating, setReactivating] = useState(false)
  const [pricingLoading, setPricingLoading] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [checking, setChecking] = useState(false)
  const [reportLimits, setReportLimits] = useState<{
    baseLimit: number
    addonReports: number
    monthlyReportsUsed: number
    availableReports: number
    hasUnlimited: boolean
  } | null>(null)

  useEffect(() => {
    const isFromAddon = searchParams.get('addon')
    
    // ALWAYS fetch data immediately
    fetchSubscription()
    fetchReportLimits()
    
    // Only check for pending add-ons if coming from add-on purchase
    if (isFromAddon) {
      // Wait a moment for webhook to process, then check if anything was missed
      setTimeout(async () => {
        try {
          const response = await fetch('/api/addons/check-pending', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          })
          
          if (response.ok) {
            const data = await response.json()
            if (data.processed > 0) {
              console.log('✅ Processed pending add-ons:', data.processed)
            }
          }
        } catch (error) {
          console.error('Error checking pending add-ons:', error)
        }
        
        // Always refresh data after checking
        fetchReportLimits(true)
        fetchSubscription(true)
      }, 2000) // Wait 2 seconds for webhook
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refresh report limits when page becomes visible (e.g., after returning from add-on purchase)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchReportLimits()
      }
    }

    const handleFocus = () => {
      fetchReportLimits()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  const fetchReportLimits = async (forceRefresh = false) => {
    if (!session?.user) {
      console.log('⚠️ No session, skipping fetchReportLimits')
      return
    }
    
    try {
      console.log('🔵 FETCHING REPORT LIMITS:', { forceRefresh, userId: session?.user?.email || 'unknown' })
      // Add cache-busting parameter to force fresh data
      const url = forceRefresh ? `/api/user/profile?refresh=true&t=${Date.now()}` : `/api/user/profile?t=${Date.now()}`
      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        }
      })
      
      console.log('🔵 REPORT LIMITS RESPONSE STATUS:', response.status)
      
      if (response.ok) {
        const data = await response.json()
        console.log('🔵 REPORT LIMITS DATA RECEIVED:', {
          hasProfile: !!data.profile,
          hasReportLimits: !!data.profile?.reportLimits,
          reportLimits: data.profile?.reportLimits,
          subscriptionStatus: data.profile?.subscriptionStatus,
          addonReports: data.profile?.addonReports
        })
        
        if (data.profile?.reportLimits) {
          console.log('✅ SETTING REPORT LIMITS:', data.profile.reportLimits)
          setReportLimits(data.profile.reportLimits)
          console.log('✅ REPORT LIMITS SET - Add-ons:', data.profile.reportLimits.addonReports)
        } else if (data.profile?.subscriptionStatus === 'ACTIVE') {
          console.log('⚠️ Active subscription but no report limits, retrying in 2 seconds...')
          // If subscription is active but no report limits, fetch again after a short delay
          // This handles the case where webhook hasn't processed yet
          setTimeout(() => fetchReportLimits(true), 2000)
        } else {
          console.log('⚠️ No report limits and not active subscription')
        }
      } else {
        console.error('❌ FAILED TO FETCH REPORT LIMITS:', response.status, response.statusText)
      }
    } catch (error) {
      console.error('❌ ERROR FETCHING REPORT LIMITS:', error)
    }
  }

  const fetchSubscription = async (forceRefresh = false) => {
    if (forceRefresh) {
      setRefreshing(true)
    }
    
    try {
      const url = forceRefresh ? '/api/subscription?refresh=true' : '/api/subscription'
      const response = await fetch(url, {
        cache: 'no-store'
      })
      if (response.ok) {
        const data = await response.json()
        setSubscription(data.subscription)
        if (forceRefresh) {
          toast.success('Subscription data refreshed!')
          // Also refresh report limits when subscription is refreshed
          fetchReportLimits(true)
        }
      }
    } catch (error) {
      console.error('Error fetching subscription:', error)
      if (forceRefresh) {
        toast.error('Failed to refresh subscription data')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const checkSubscription = async () => {
    setChecking(true)
    try {
      const response = await fetch('/api/subscription/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          toast.success('Subscription found and updated!')
          // Refresh the subscription data
          await fetchSubscription(true)
        } else {
          toast.error(data.message || 'No active subscription found')
        }
      } else {
        const errorData = await response.json()
        toast.error(errorData.error || 'Failed to check subscription')
      }
    } catch (error) {
      console.error('Error checking subscription:', error)
      toast.error('Failed to check subscription status')
    } finally {
      setChecking(false)
    }
  }

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your current billing period.')) {
      return
    }

    setCanceling(true)
    try {
      const response = await fetch('/api/cancel-subscription', {
        method: 'POST'
      })

      if (response.ok) {
        toast.success('Subscription canceled successfully')
        fetchSubscription()
      } else {
        toast.error('Failed to cancel subscription')
      }
    } catch (error) {
      console.error('Error canceling subscription:', error)
      toast.error('Failed to cancel subscription')
    } finally {
      setCanceling(false)
    }
  }

  const handleReactivateSubscription = async () => {
    setReactivating(true)
    try {
      const response = await fetch('/api/reactivate-subscription', {
        method: 'POST'
      })

      if (response.ok) {
        toast.success('Subscription reactivated successfully')
        fetchSubscription()
      } else {
        toast.error('Failed to reactivate subscription')
      }
    } catch (error) {
      console.error('Error reactivating subscription:', error)
      toast.error('Failed to reactivate subscription')
    } finally {
      setReactivating(false)
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const formatPrice = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: currency,
    }).format(amount / 100)
  }

  const handleSubscribe = async (plan: PricingPlan) => {
    setPricingLoading(plan)
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ priceId: PRICING_CONFIG.prices[plan] }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create checkout session')
      }

      const { sessionId, url } = await response.json()
      console.log('Checkout session created:', sessionId)
      
      if (url) {
        console.log('Redirecting to Stripe checkout...')
        window.location.href = url
      } else {
        console.error('No checkout URL received')
        toast.error('Failed to get checkout URL')
      }
    } catch (error) {
      console.error('Error creating checkout session:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to start checkout process')
    } finally {
      setPricingLoading(null)
    }
  }

  const formatPricingAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: currency,
    }).format(amount)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold mb-2">Subscription</h1>
          <p className="text-slate-400">Manage your subscription and billing</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fetchSubscription(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={checkSubscription}
            disabled={checking}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Checking...' : 'Check Subscription'}
          </button>
        </div>
      </div>

      {subscription ? (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Current Plan */}
          <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Current Plan</h2>
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                subscription.status === 'active' 
                  ? 'bg-green-500/20 text-green-400' 
                  : subscription.status === 'canceled'
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-yellow-500/20 text-yellow-400'
              }`}>
                {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-2xl font-bold text-white">{subscription.plan.name}</h3>
                <p className="text-slate-400">
                  {formatPrice(subscription.plan.amount, subscription.plan.currency)}/{subscription.plan.interval}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-300">
                    Current period: {formatDate(subscription.currentPeriodStart)} - {formatDate(subscription.currentPeriodEnd)}
                  </span>
                </div>
                
                {subscription.cancelAtPeriodEnd && (
                  <div className="flex items-center gap-2 text-sm text-yellow-400">
                    <AlertCircle className="w-4 h-4" />
                    <span>Subscription will cancel at the end of the current period</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Report Usage */}
          {reportLimits && (
            <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Report Usage
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-400">Available This Month</label>
                  <div className="text-3xl font-bold text-cyan-400">
                    {reportLimits.availableReports} / {reportLimits.baseLimit + reportLimits.addonReports}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-400">Base Plan</label>
                    <div className="text-xl font-semibold text-white">{reportLimits.baseLimit}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-400">Add-ons</label>
                    <div className="text-xl font-semibold text-yellow-400">{reportLimits.addonReports}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-slate-400">Used</label>
                    <div className="text-xl font-semibold text-slate-300">{reportLimits.monthlyReportsUsed}</div>
                  </div>
                </div>

                <div className="w-full bg-slate-700 rounded-full h-3">
                  <div 
                    className="bg-gradient-to-r from-cyan-500 to-blue-500 h-3 rounded-full transition-all duration-300"
                    style={{ 
                      width: `${Math.min(100, (reportLimits.monthlyReportsUsed / (reportLimits.baseLimit + reportLimits.addonReports || 1)) * 100)}%` 
                    }}
                  ></div>
                </div>

                <button
                  onClick={() => {
                    toast('Add-ons are coming soon! Stay tuned for updates.', {
                      icon: 'ℹ️',
                    })
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg font-medium hover:shadow-lg hover:shadow-yellow-500/50 transition-all"
                >
                  <Crown className="w-4 h-4" />
                  Purchase Add-ons
                </button>
              </div>
            </div>
          )}

          {/* Plan Features */}
          <div className={`p-6 rounded-lg border border-slate-700/50 bg-slate-800/30 ${reportLimits ? '' : 'lg:col-span-2'}`}>
            <h2 className="text-xl font-semibold mb-4">Plan Features</h2>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <Check className="w-5 h-5 text-green-400" />
                <span className="text-slate-300">
                  {subscription?.plan.name === 'Yearly Plan' ? '70' : '50'} reports per month
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Check className="w-5 h-5 text-green-400" />
                <span className="text-slate-300">PDF & Excel export</span>
              </div>
              <div className="flex items-center gap-3">
                <Check className="w-5 h-5 text-green-400" />
                <span className="text-slate-300">Email support</span>
              </div>
              <div className="flex items-center gap-3">
                <Check className="w-5 h-5 text-green-400" />
                <span className="text-slate-300">All integrations</span>
              </div>
              <div className="flex items-center gap-3">
                <Check className="w-5 h-5 text-green-400" />
                <span className="text-slate-300">IICRC S500 compliant</span>
              </div>
              <div className="flex items-center gap-3">
                <Check className="w-5 h-5 text-green-400" />
                <span className="text-slate-300">Priority processing</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* No Subscription Header */}
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <CreditCard className="w-8 h-8 text-slate-400" />
            </div>
            <h2 className="text-2xl font-semibold text-white mb-2">No Active Subscription</h2>
            <p className="text-slate-400">
              You're currently on the free trial. Choose a plan below to unlock all features.
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {Object.entries(PRICING_CONFIG.pricing).map(([key, plan]) => (
              <div
                key={key}
                className={`relative bg-slate-800/50 rounded-2xl border-2 p-6 transition-all duration-300 hover:scale-105 ${
                  plan.popular
                    ? 'border-cyan-500 shadow-2xl shadow-cyan-500/20'
                    : 'border-slate-700 hover:border-slate-600'
                }`}
              >
                {/* Popular Badge */}
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <div className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white px-4 py-1 rounded-full text-sm font-semibold flex items-center gap-2">
                      <Star className="w-4 h-4" />
                      Most Popular
                    </div>
                  </div>
                )}

                {/* Best Value Badge */}
                {plan.badge && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-4 py-1 rounded-full text-sm font-semibold flex items-center gap-2">
                      <Award className="w-4 h-4" />
                      {plan.badge}
                    </div>
                  </div>
                )}

                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold text-white mb-2">
                    {plan.displayName}
                  </h3>
                  <div className="mb-4">
                    <span className="text-3xl font-bold text-cyan-400">
                      {plan.amount === 0 ? 'Free' : formatPricingAmount(plan.amount, plan.currency)}
                    </span>
                    {plan.interval && (
                      <span className="text-slate-400">/{plan.interval}</span>
                    )}
                  </div>
                  
                  {/* Discount Display */}
                  {plan.discount && (
                    <div className="text-sm text-green-400 mb-2">
                      {plan.discount} discount - Save ${plan.savings}/year
                    </div>
                  )}
                  
                  {/* Monthly Equivalent */}
                  {plan.monthlyEquivalent && (
                    <div className="text-sm text-slate-400">
                      ${plan.monthlyEquivalent}/month equivalent
                    </div>
                  )}
                </div>

                {/* Features */}
                <div className="space-y-3 mb-6">
                  {plan.features.map((feature, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      <span className="text-slate-300 text-sm">{feature}</span>
                    </div>
                  ))}
                </div>

                {/* Report Limit */}
                <div className="mb-6 p-3 bg-slate-700/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    <span className="font-semibold text-white text-sm">Report Limit</span>
                  </div>
                  <div className="text-lg font-bold text-cyan-400">
                    {plan.reportLimit === 'unlimited' ? 'Unlimited' : plan.reportLimit}
                  </div>
                </div>

                {/* CTA Button */}
                <button
                  onClick={() => handleSubscribe(key as PricingPlan)}
                  disabled={pricingLoading === key}
                  className={`w-full py-3 px-4 rounded-lg font-semibold transition-all duration-300 ${
                    plan.popular
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:shadow-lg hover:shadow-cyan-500/50'
                      : 'bg-slate-700 text-white hover:bg-slate-600'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {pricingLoading === key ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Processing...
                    </div>
                  ) : (
                    plan.amount === 0 ? 'Start Free Trial' : `Subscribe to ${plan.displayName}`
                  )}
                </button>
              </div>
            ))}
          </div>

          {/* Features Comparison */}
          <div className="mt-12 max-w-4xl mx-auto">
            <h3 className="text-2xl font-bold text-white text-center mb-6">
              All Plans Include
            </h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center p-4 bg-slate-800/30 rounded-lg">
                <Shield className="w-6 h-6 text-cyan-400 mx-auto mb-3" />
                <h4 className="text-lg font-semibold text-white mb-2">IICRC S500 Compliant</h4>
                <p className="text-slate-400 text-sm">
                  All reports follow IICRC S500 standards
                </p>
              </div>
              <div className="text-center p-4 bg-slate-800/30 rounded-lg">
                <Download className="w-6 h-6 text-cyan-400 mx-auto mb-3" />
                <h4 className="text-lg font-semibold text-white mb-2">PDF Export</h4>
                <p className="text-slate-400 text-sm">
                  Professional PDF reports ready for submission
                </p>
              </div>
              <div className="text-center p-4 bg-slate-800/30 rounded-lg">
                <Users className="w-6 h-6 text-cyan-400 mx-auto mb-3" />
                <h4 className="text-lg font-semibold text-white mb-2">Client Management</h4>
                <p className="text-slate-400 text-sm">
                  Manage clients and track jobs
                </p>
              </div>
              <div className="text-center p-4 bg-slate-800/30 rounded-lg">
                <Clock className="w-6 h-6 text-cyan-400 mx-auto mb-3" />
                <h4 className="text-lg font-semibold text-white mb-2">24/7 Access</h4>
                <p className="text-slate-400 text-sm">
                  Access your data anytime, anywhere
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
