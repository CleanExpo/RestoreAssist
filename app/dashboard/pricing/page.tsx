"use client"

import { useState } from "react"
import { Check, Star, Zap, Shield, Download, Users, Clock, Award } from "lucide-react"
import { PRICING_CONFIG, type PricingPlan } from "@/lib/pricing"
import toast from "react-hot-toast"

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null)

  const handleSubscribe = async (plan: PricingPlan) => {
    if (plan === 'freeTrial') {
      toast.success("Free trial activated! You can now create up to 3 reports.")
      return
    }

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
                    {plan.amount === 0 ? 'Free' : formatPrice(plan.amount, plan.currency)}
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
              <div className="space-y-4 mb-8">
                {plan.features.map((feature, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="text-slate-300">{feature}</span>
                  </div>
                ))}
              </div>

              {/* Report Limit */}
              <div className="mb-6 p-4 bg-slate-700/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-5 h-5 text-yellow-400" />
                  <span className="font-semibold text-white">Report Limit</span>
                </div>
                <div className="text-2xl font-bold text-cyan-400">
                  {plan.reportLimit === 'unlimited' ? 'Unlimited' : plan.reportLimit}
                </div>
                <div className="text-sm text-slate-400">
                  {plan.reportLimit === 'unlimited' ? 'Create as many reports as you need' : 'Reports per month'}
                </div>
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
                  plan.amount === 0 ? 'Start Free Trial' : `Subscribe to ${plan.displayName}`
                )}
              </button>
            </div>
          ))}
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
                What happens after my free trial ends?
              </h3>
              <p className="text-slate-400">
                After your 3 free reports, you'll need to subscribe to a paid plan to continue creating reports. 
                Your existing reports will remain accessible.
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
  )
}
