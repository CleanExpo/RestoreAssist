"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Check, Star, Zap, Shield, Download, Users, Clock, Award } from "lucide-react"
import { PRICING_CONFIG, type PricingPlan, type AddonPack } from "@/lib/pricing"
import toast from "react-hot-toast"
import { cn } from "@/lib/utils"

export default function PricingPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isOnboarding = searchParams.get('onboarding') === 'true'
  const requireSubscription = searchParams.get('require_subscription') === 'true'
  const [loading, setLoading] = useState<string | null>(null)
  
  // Note: Subscription is no longer required for onboarding - users get 3 free credits

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
    <div className={cn("min-h-screen", "bg-gradient-to-br from-neutral-50 via-white to-neutral-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950")}>
        <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className={cn("text-4xl font-bold mb-4", "text-neutral-900 dark:text-white")}>
            Choose Your Plan
          </h1>
          <p className={cn("text-xl max-w-2xl mx-auto mb-6", "text-neutral-600 dark:text-slate-400")}>
            Start with 3 free reports to try our service. Upgrade to a monthly or yearly plan when you're ready. 
            All plans include IICRC S500 compliance and professional reporting tools.
          </p>
          {/* Free Trial Banner */}
          <div className={cn("inline-block px-6 py-3 rounded-lg mb-4", "bg-green-100 dark:bg-green-900/30 border-2 border-green-500 dark:border-green-400")}>
            <p className={cn("text-lg font-semibold", "text-green-800 dark:text-green-300")}>
              🎉 New accounts get 3 free reports to get started!
            </p>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {Object.entries(PRICING_CONFIG.pricing).map(([key, plan]) => (
            <div
              key={key}
              className={cn(
                "relative rounded-2xl border-2 p-8 transition-all duration-300 hover:scale-105",
                "bg-white dark:bg-slate-800/50",
                plan.popular
                  ? 'border-cyan-500 shadow-2xl shadow-cyan-500/20'
                  : cn("border-neutral-300 dark:border-slate-700", "hover:border-neutral-400 dark:hover:border-slate-600")
              )}
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
                <h3 className={cn("text-2xl font-bold mb-2", "text-neutral-900 dark:text-white")}>
                  {plan.displayName}
                </h3>
                <div className="mb-4">
                  <span className={cn("text-4xl font-bold", "text-cyan-600 dark:text-cyan-400")}>
                    {formatPrice(plan.amount, plan.currency)}
                  </span>
                  {plan.interval && (
                    <span className={cn("text-neutral-600 dark:text-slate-400")}>/{plan.interval}</span>
                  )}
                </div>
                
                {/* Monthly Equivalent */}
                {plan.monthlyEquivalent && (
                  <div className={cn("text-sm mb-2", "text-neutral-600 dark:text-slate-400")}>
                    ${plan.monthlyEquivalent}/month equivalent
                  </div>
                )}

                {/* Report Limit Display */}
                {plan.reportLimit && typeof plan.reportLimit === 'number' && (
                  <div className={cn("mt-4 p-4 rounded-lg", "bg-neutral-100 dark:bg-slate-700/30")}>
                    <div className={cn("text-2xl font-bold mb-1", "text-cyan-600 dark:text-cyan-400")}>
                      {plan.reportLimit}
                    </div>
                    <div className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>
                      Inspection Reports{plan.interval === 'month' ? ' per month' : ' per month (yearly plan)'}
                    </div>
                    {'signupBonus' in plan && plan.signupBonus && (
                      <div className={cn("text-xs mt-2", "text-green-600 dark:text-green-400")}>
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
                    <Check className={cn("w-5 h-5 mt-0.5 flex-shrink-0", "text-green-600 dark:text-green-400")} />
                    <span className={cn("text-neutral-700 dark:text-slate-300")}>{feature}</span>
                  </div>
                ))}
              </div>


              {/* CTA Button */}
              <button
                onClick={() => handleSubscribe(key as PricingPlan)}
                disabled={loading === key}
                className={cn(
                  "w-full py-4 px-6 rounded-lg font-semibold text-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed",
                  plan.popular
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:shadow-lg hover:shadow-cyan-500/50'
                    : cn("bg-neutral-700 dark:bg-slate-700 text-white", "hover:bg-neutral-600 dark:hover:bg-slate-600")
                )}
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
          <h2 className={cn("text-3xl font-bold text-center mb-8", "text-neutral-900 dark:text-white")}>
            Add More Reports
          </h2>
          <p className={cn("text-xl text-center mb-12 max-w-2xl mx-auto", "text-neutral-600 dark:text-slate-400")}>
            Need more reports? Add additional report packs to your subscription
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {Object.entries(PRICING_CONFIG.addons).map(([key, addon]) => (
              <div
                key={key}
                className={cn(
                  "relative rounded-2xl border-2 p-8 transition-all duration-300 hover:scale-105",
                  "bg-white dark:bg-slate-800/50",
                  addon.popular
                    ? 'border-cyan-500 shadow-2xl shadow-cyan-500/20'
                    : cn("border-neutral-300 dark:border-slate-700", "hover:border-neutral-400 dark:hover:border-slate-600")
                )}
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
                  <h3 className={cn("text-2xl font-bold mb-2", "text-neutral-900 dark:text-white")}>
                    {addon.displayName}
                  </h3>
                  <div className="mb-4">
                    <span className={cn("text-4xl font-bold", "text-cyan-600 dark:text-cyan-400")}>
                      {formatPrice(addon.amount, addon.currency)}
                    </span>
                  </div>
                  <div className={cn("p-4 rounded-lg", "bg-neutral-100 dark:bg-slate-700/30")}>
                    <div className={cn("text-2xl font-bold mb-1", "text-cyan-600 dark:text-cyan-400")}>
                      {addon.reportLimit}
                    </div>
                    <div className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>
                      Additional Reports
                    </div>
                  </div>
                </div>
                <p className={cn("text-center mb-6", "text-neutral-700 dark:text-slate-300")}>
                  {addon.description}
                </p>
                <button
                  onClick={async () => {
                    setLoading(key)
                    try {
                      const response = await fetch('/api/addons/checkout', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ addonKey: key })
                      })

                      if (!response.ok) {
                        const errorData = await response.json()
                        throw new Error(errorData.error || 'Failed to create checkout session')
                      }

                      const { url } = await response.json()
                      
                      if (url) {
                        window.location.href = url
                      } else {
                        throw new Error('No checkout URL received')
                      }
                    } catch (error) {
                      console.error('Error purchasing add-on:', error)
                      toast.error(error instanceof Error ? error.message : 'Failed to start checkout process')
                      setLoading(null)
                    }
                  }}
                  disabled={loading === key}
                  className={cn(
                    "w-full py-4 px-6 rounded-lg font-semibold text-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed",
                    addon.popular
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:shadow-lg hover:shadow-cyan-500/50'
                      : cn("bg-neutral-700 dark:bg-slate-700 text-white", "hover:bg-neutral-600 dark:hover:bg-slate-600")
                  )}
                >
                  {loading === key ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Processing...
                    </div>
                  ) : (
                    'Purchase Now'
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Features Comparison */}
        <div className="mt-16 max-w-4xl mx-auto">
          <h2 className={cn("text-3xl font-bold text-center mb-8", "text-neutral-900 dark:text-white")}>
            All Plans Include
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className={cn("text-center p-6 rounded-lg", "bg-white dark:bg-slate-800/30")}>
              <Shield className={cn("w-8 h-8 mx-auto mb-4", "text-cyan-600 dark:text-cyan-400")} />
              <h3 className={cn("text-lg font-semibold mb-2", "text-neutral-900 dark:text-white")}>IICRC S500 Compliant</h3>
              <p className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>
                All reports follow IICRC S500 standards for professional water damage restoration
              </p>
            </div>
            <div className={cn("text-center p-6 rounded-lg", "bg-white dark:bg-slate-800/30")}>
              <Download className={cn("w-8 h-8 mx-auto mb-4", "text-cyan-600 dark:text-cyan-400")} />
              <h3 className={cn("text-lg font-semibold mb-2", "text-neutral-900 dark:text-white")}>PDF Export</h3>
              <p className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>
                Professional PDF reports ready for insurance and client submission
              </p>
            </div>
            <div className={cn("text-center p-6 rounded-lg", "bg-white dark:bg-slate-800/30")}>
              <Users className={cn("w-8 h-8 mx-auto mb-4", "text-cyan-600 dark:text-cyan-400")} />
              <h3 className={cn("text-lg font-semibold mb-2", "text-neutral-900 dark:text-white")}>Client Management</h3>
              <p className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>
                Manage clients, track jobs, and maintain detailed records
              </p>
            </div>
            <div className={cn("text-center p-6 rounded-lg", "bg-white dark:bg-slate-800/30")}>
              <Clock className={cn("w-8 h-8 mx-auto mb-4", "text-cyan-600 dark:text-cyan-400")} />
              <h3 className={cn("text-lg font-semibold mb-2", "text-neutral-900 dark:text-white")}>24/7 Access</h3>
              <p className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>
                Access your reports and data anytime, anywhere with cloud storage
              </p>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mt-16 max-w-3xl mx-auto">
          <h2 className={cn("text-3xl font-bold text-center mb-8", "text-neutral-900 dark:text-white")}>
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <div className={cn("rounded-lg p-6", "bg-white dark:bg-slate-800/30")}>
              <h3 className={cn("text-lg font-semibold mb-2", "text-neutral-900 dark:text-white")}>
                What is the signup bonus?
              </h3>
              <p className={cn("text-neutral-600 dark:text-slate-400")}>
                All new subscribers receive an additional 10 reports on their first month, on top of their regular monthly limit. 
                This bonus applies to both monthly and yearly plans.
              </p>
            </div>
            <div className={cn("rounded-lg p-6", "bg-white dark:bg-slate-800/30")}>
              <h3 className={cn("text-lg font-semibold mb-2", "text-neutral-900 dark:text-white")}>
                Can I add more reports to my plan?
              </h3>
              <p className={cn("text-neutral-600 dark:text-slate-400")}>
                Yes! You can purchase add-on packs to increase your monthly report limit. Choose from 8, 25, or 60 additional reports. 
                Add-ons are added to your subscription and renew monthly.
              </p>
            </div>
            <div className={cn("rounded-lg p-6", "bg-white dark:bg-slate-800/30")}>
              <h3 className={cn("text-lg font-semibold mb-2", "text-neutral-900 dark:text-white")}>
                Can I change my plan later?
              </h3>
              <p className={cn("text-neutral-600 dark:text-slate-400")}>
                Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately, 
                and you'll be charged or credited proportionally.
              </p>
            </div>
            <div className={cn("rounded-lg p-6", "bg-white dark:bg-slate-800/30")}>
              <h3 className={cn("text-lg font-semibold mb-2", "text-neutral-900 dark:text-white")}>
                Is my data secure?
              </h3>
              <p className={cn("text-neutral-600 dark:text-slate-400")}>
                Absolutely. We use enterprise-grade security with encrypted data storage and secure connections. 
                Your client data is protected and never shared with third parties.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
