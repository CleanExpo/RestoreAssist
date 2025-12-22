"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Check, Star, Zap, Shield, Download, Users, Clock, Award } from "lucide-react"
import { PRICING_CONFIG, type PricingPlan, type AddonPack } from "@/lib/pricing"
import toast from "react-hot-toast"
import OnboardingGuide from "@/components/OnboardingGuide"

export default function PricingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isOnboarding = searchParams.get('onboarding') === 'true'
  const requireSubscription = searchParams.get('require_subscription') === 'true'
  const [loading, setLoading] = useState<string | null>(null)
  
  // Check if user already has subscription
  useEffect(() => {
    if (isOnboarding || requireSubscription) {
      const checkSubscription = async () => {
        try {
          const response = await fetch('/api/subscription')
          if (response.ok) {
            const data = await response.json()
            if (data.subscription?.status === 'active') {
              // User has active subscription, redirect to next onboarding step
              toast.success('Subscription active! Redirecting to next step...')
              setTimeout(() => {
                router.push('/dashboard/settings?onboarding=true')
              }, 1500)
            }
          }
        } catch (error) {
          console.error('Error checking subscription:', error)
        }
      }
      checkSubscription()
    }
  }, [isOnboarding, requireSubscription, router])

  const handleSubscribe = async (plan: PricingPlan) => {
    setLoading(plan)
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
      
      if (url) {
        window.location.href = url
      } else {
        console.error('No checkout URL received')
        toast.error('Failed to get checkout URL')
      }
    } catch (error) {
      console.error('Error creating checkout session:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to start checkout process')
    } finally {
      setLoading(null)
    }
  }

  const formatPrice = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: currency,
    }).format(amount)
  }

  return (
    <OnboardingGuide
      step={0}
      totalSteps={5}
      title="Subscribe to a Plan"
      description="Choose a monthly or yearly plan to get started. Subscription is required before you can proceed with onboarding."
      value="Select the plan that best fits your needs. All plans include first month signup bonus of 10 additional reports."
    >
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            Choose Your Plan
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            Select the perfect plan for your water damage restoration business. 
            All plans include IICRC S500 compliance and professional reporting tools.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {Object.entries(PRICING_CONFIG.pricing).map(([key, plan]) => (
            <div
              key={key}
              className={`relative bg-slate-800/50 rounded-2xl border-2 p-8 transition-all duration-300 hover:scale-105 ${
                plan.popular
                  ? 'border-cyan-500 shadow-2xl shadow-cyan-500/20'
                  : 'border-slate-700 hover:border-slate-600'
              }`}
            >
              {/* Popular Badge */}
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <div className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white px-6 py-2 rounded-full text-sm font-semibold flex items-center gap-2">
                    <Star className="w-4 h-4" />
                    Most Popular
                  </div>
                </div>
              )}

              {/* Best Value Badge */}
              {plan.badge && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-6 py-2 rounded-full text-sm font-semibold flex items-center gap-2">
                    <Award className="w-4 h-4" />
                    {plan.badge}
                  </div>
                </div>
              )}

              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-white mb-2">
                  {plan.displayName}
                </h3>
                <div className="mb-4">
                  <span className="text-4xl font-bold text-cyan-400">
                    {formatPrice(plan.amount, plan.currency)}
                  </span>
                  {plan.interval && (
                    <span className="text-slate-400">/{plan.interval}</span>
                  )}
                </div>
                
                {/* Monthly Equivalent */}
                {plan.monthlyEquivalent && (
                  <div className="text-sm text-slate-400 mb-2">
                    ${plan.monthlyEquivalent}/month equivalent
                  </div>
                )}

                {/* Report Limit Display */}
                {plan.reportLimit && typeof plan.reportLimit === 'number' && (
                  <div className="mt-4 p-4 bg-slate-700/30 rounded-lg">
                    <div className="text-2xl font-bold text-cyan-400 mb-1">
                      {plan.reportLimit}
                    </div>
                    <div className="text-sm text-slate-400">
                      Inspection Reports{plan.interval === 'month' ? ' per month' : ' per month (yearly plan)'}
                    </div>
                    {'signupBonus' in plan && plan.signupBonus && (
                      <div className="text-xs text-green-400 mt-2">
                        +{plan.signupBonus} bonus reports on first month
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Features */}
              <div className="space-y-4 mb-8">
                {plan.features.map((feature, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="text-slate-300">{feature}</span>
                  </div>
                ))}
              </div>


              {/* CTA Button */}
              <button
                onClick={() => handleSubscribe(key as PricingPlan)}
                disabled={loading === key}
                className={`w-full py-4 px-6 rounded-lg font-semibold text-lg transition-all duration-300 ${
                  plan.popular
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:shadow-lg hover:shadow-cyan-500/50'
                    : 'bg-slate-700 text-white hover:bg-slate-600'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loading === key ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Processing...
                  </div>
                ) : (
                  `Subscribe to ${plan.displayName}`
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Add-ons Section */}
        <div className="mt-16 max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-8">
            Add More Reports
          </h2>
          <p className="text-xl text-slate-400 text-center mb-12 max-w-2xl mx-auto">
            Need more reports? Add additional report packs to your subscription
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {Object.entries(PRICING_CONFIG.addons).map(([key, addon]) => (
              <div
                key={key}
                className={`relative bg-slate-800/50 rounded-2xl border-2 p-8 transition-all duration-300 hover:scale-105 ${
                  addon.popular
                    ? 'border-cyan-500 shadow-2xl shadow-cyan-500/20'
                    : 'border-slate-700 hover:border-slate-600'
                }`}
              >
                {addon.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <div className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white px-6 py-2 rounded-full text-sm font-semibold flex items-center gap-2">
                      <Star className="w-4 h-4" />
                      Most Popular
                    </div>
                  </div>
                )}
                {addon.badge && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-6 py-2 rounded-full text-sm font-semibold flex items-center gap-2">
                      <Award className="w-4 h-4" />
                      {addon.badge}
                    </div>
                  </div>
                )}
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold text-white mb-2">
                    {addon.displayName}
                  </h3>
                  <div className="mb-4">
                    <span className="text-4xl font-bold text-cyan-400">
                      {formatPrice(addon.amount, addon.currency)}
                    </span>
                  </div>
                  <div className="p-4 bg-slate-700/30 rounded-lg">
                    <div className="text-2xl font-bold text-cyan-400 mb-1">
                      {addon.reportLimit}
                    </div>
                    <div className="text-sm text-slate-400">
                      Additional Reports
                    </div>
                  </div>
                </div>
                <p className="text-slate-300 text-center mb-6">
                  {addon.description}
                </p>
                <button
                  onClick={() => {
                    toast('Add-ons are coming soon! Stay tuned for updates.', {
                      icon: 'ℹ️',
                    })
                  }}
                  className={`w-full py-4 px-6 rounded-lg font-semibold text-lg transition-all duration-300 ${
                    addon.popular
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:shadow-lg hover:shadow-cyan-500/50'
                      : 'bg-slate-700 text-white hover:bg-slate-600'
                  }`}
                >
                  Coming Soon
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Features Comparison */}
        <div className="mt-16 max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-8">
            All Plans Include
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="text-center p-6 bg-slate-800/30 rounded-lg">
              <Shield className="w-8 h-8 text-cyan-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">IICRC S500 Compliant</h3>
              <p className="text-slate-400 text-sm">
                All reports follow IICRC S500 standards for professional water damage restoration
              </p>
            </div>
            <div className="text-center p-6 bg-slate-800/30 rounded-lg">
              <Download className="w-8 h-8 text-cyan-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">PDF Export</h3>
              <p className="text-slate-400 text-sm">
                Professional PDF reports ready for insurance and client submission
              </p>
            </div>
            <div className="text-center p-6 bg-slate-800/30 rounded-lg">
              <Users className="w-8 h-8 text-cyan-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Client Management</h3>
              <p className="text-slate-400 text-sm">
                Manage clients, track jobs, and maintain detailed records
              </p>
            </div>
            <div className="text-center p-6 bg-slate-800/30 rounded-lg">
              <Clock className="w-8 h-8 text-cyan-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">24/7 Access</h3>
              <p className="text-slate-400 text-sm">
                Access your reports and data anytime, anywhere with cloud storage
              </p>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mt-16 max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-8">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <div className="bg-slate-800/30 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                What is the signup bonus?
              </h3>
              <p className="text-slate-400">
                All new subscribers receive an additional 10 reports on their first month, on top of their regular monthly limit. 
                This bonus applies to both monthly and yearly plans.
              </p>
            </div>
            <div className="bg-slate-800/30 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                Can I add more reports to my plan?
              </h3>
              <p className="text-slate-400">
                Yes! You can purchase add-on packs to increase your monthly report limit. Choose from 8, 25, or 60 additional reports. 
                Add-ons are added to your subscription and renew monthly.
              </p>
            </div>
            <div className="bg-slate-800/30 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                Can I change my plan later?
              </h3>
              <p className="text-slate-400">
                Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately, 
                and you'll be charged or credited proportionally.
              </p>
            </div>
            <div className="bg-slate-800/30 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                Is my data secure?
              </h3>
              <p className="text-slate-400">
                Absolutely. We use enterprise-grade security with encrypted data storage and secure connections. 
                Your client data is protected and never shared with third parties.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
    </OnboardingGuide>
  )
}
