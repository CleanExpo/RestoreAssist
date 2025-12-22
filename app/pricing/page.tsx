"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import Header from "@/components/landing/Header"
import Footer from "@/components/landing/Footer"
import { PRICING_CONFIG } from "@/lib/pricing"

export default function PricingPage() {
  const [darkMode, setDarkMode] = useState(true)

  useEffect(() => {
    if (!document.getElementById('google-fonts-preconnect')) {
      const link1 = document.createElement('link')
      link1.id = 'google-fonts-preconnect'
      link1.rel = 'preconnect'
      link1.href = 'https://fonts.googleapis.com'
      document.head.appendChild(link1)

      const link2 = document.createElement('link')
      link2.rel = 'preconnect'
      link2.href = 'https://fonts.gstatic.com'
      link2.crossOrigin = 'anonymous'
      document.head.appendChild(link2)

      const link3 = document.createElement('link')
      link3.href = 'https://fonts.googleapis.com/css2?family=Open+Sauce+Sans:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap'
      link3.rel = 'stylesheet'
      document.head.appendChild(link3)
    }
  }, [])

  // Map pricing config to display format
  const plans = Object.values(PRICING_CONFIG.pricing).map((plan) => {
    const price = plan.amount % 1 === 0 
      ? `$${plan.amount}` 
      : `$${plan.amount.toFixed(2)}`
    
    const period = 'interval' in plan && plan.interval
      ? `/${plan.interval}` 
      : ""
    
    const description = plan.name === 'Monthly Plan'
      ? "Perfect for growing restoration businesses with 50 reports per month."
      : "Best value with 70 reports per month for long-term commitment."
    
    return {
      name: plan.displayName,
      price,
      period,
      description,
      features: plan.features,
      popular: plan.popular,
      badge: 'badge' in plan ? plan.badge : null,
      monthlyEquivalent: 'monthlyEquivalent' in plan ? plan.monthlyEquivalent : null,
      reportLimit: plan.reportLimit,
      signupBonus: 'signupBonus' in plan ? plan.signupBonus : null
    }
  })

  // Map addons config to display format
  const addons = Object.values(PRICING_CONFIG.addons).map((addon) => ({
    name: addon.displayName,
    price: addon.amount % 1 === 0 ? `$${addon.amount}` : `$${addon.amount.toFixed(2)}`,
    reportLimit: addon.reportLimit,
    description: addon.description,
    popular: 'popular' in addon ? addon.popular : false,
    badge: 'badge' in addon ? addon.badge : null
  }))

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-[#1C2E47]' : 'bg-[#F4F5F6]'}`}>
      <Header darkMode={darkMode} setDarkMode={setDarkMode} />
      
      {/* Hero Section */}
      <section className="pt-48 pb-20 px-6 relative z-10 min-h-[60vh] flex items-center bg-[#C4C8CA]/30 overflow-hidden">
        {/* Golden Decorative Shapes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-20 right-10 w-72 h-72 bg-[#8A6B4E]/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 left-10 w-96 h-96 bg-[#8A6B4E]/8 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-7xl mx-auto w-full relative z-10 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className={`text-5xl md:text-6xl font-bold mb-6 leading-tight ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`}
            style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
          >
            Pricing
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className={`text-xl md:text-2xl ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`}
            style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
          >
            Choose the plan that fits your needs. All plans include first month signup bonus of 10 additional reports.
          </motion.p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-20 px-6 relative bg-[#C4C8CA]/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-10 left-1/4 w-80 h-80 bg-[#8A6B4E]/12 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-1/4 w-64 h-64 bg-[#8A6B4E]/10 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid md:grid-cols-3 gap-8">
            {plans.map((plan, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className={`p-8 rounded-lg relative ${plan.popular ? 'border-2 border-[#8A6B4E]' : ''} ${darkMode ? 'bg-[#1C2E47]/50 border-[#5A6A7B]/30' : 'bg-[#F4F5F6]/50 border-[#5A6A7B]/20'} backdrop-blur-sm border`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-[#8A6B4E] text-[#F4F5F6] rounded-full text-sm font-medium" style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    Most Popular
                  </div>
                )}
                {plan.badge && !plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-[#8A6B4E] text-[#F4F5F6] rounded-full text-sm font-medium" style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    {plan.badge}
                  </div>
                )}
                <h3 className={`text-2xl font-bold mb-2 ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`} style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  {plan.name}
                </h3>
                <p className={`text-sm mb-6 ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  {plan.description}
                </p>
                <div className="mb-6">
                  <span className={`text-4xl font-bold ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`} style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className={`text-lg ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                      {plan.period}
                    </span>
                  )}
                  {plan.monthlyEquivalent && (
                    <p className={`text-sm mt-1 ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                      ${plan.monthlyEquivalent}/month equivalent
                    </p>
                  )}
                  {plan.reportLimit && typeof plan.reportLimit === 'number' && (
                    <div className={`mt-2 p-3 rounded-lg ${darkMode ? 'bg-[#8A6B4E]/20' : 'bg-[#8A6B4E]/10'}`}>
                      <p className={`text-sm font-semibold ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`}>
                        {plan.reportLimit} Inspection Reports{plan.period === '/month' ? ' per month' : ''}
                      </p>
                      {plan.signupBonus && (
                        <p className={`text-xs mt-1 ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`}>
                          +{plan.signupBonus} bonus reports on first month
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className={`flex items-start gap-2 ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                      <span className="text-[#8A6B4E] mt-1">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`block w-full px-6 py-3 rounded-lg text-center font-medium transition-colors ${plan.popular ? 'bg-[#8A6B4E] text-[#F4F5F6] hover:bg-[#8A6B4E]/90' : 'bg-[#5A6A7B] text-[#F4F5F6] hover:bg-[#5A6A7B]/90'}`}
                  style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
                >
                  Start Free Trial
                </Link>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Add-ons Section */}
        <div className="mt-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className={`text-3xl md:text-4xl font-bold mb-4 ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`} style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
              Add More Reports
            </h2>
            <p className={`text-lg ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
              Need more reports? Add additional report packs to your subscription
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {addons.map((addon, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className={`p-6 rounded-lg relative ${addon.popular ? 'border-2 border-[#8A6B4E]' : ''} ${darkMode ? 'bg-[#1C2E47]/50 border-[#5A6A7B]/30' : 'bg-[#F4F5F6]/50 border-[#5A6A7B]/20'} backdrop-blur-sm border`}
              >
                {addon.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-[#8A6B4E] text-[#F4F5F6] rounded-full text-sm font-medium" style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    Most Popular
                  </div>
                )}
                {addon.badge && !addon.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-[#8A6B4E] text-[#F4F5F6] rounded-full text-sm font-medium" style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    {addon.badge}
                  </div>
                )}
                <h3 className={`text-xl font-bold mb-2 ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`} style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  {addon.name}
                </h3>
                <p className={`text-sm mb-4 ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`} style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  {addon.description}
                </p>
                <div className="mb-6">
                  <span className={`text-3xl font-bold ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`} style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    {addon.price}
                  </span>
                  <div className={`mt-2 p-3 rounded-lg ${darkMode ? 'bg-[#8A6B4E]/20' : 'bg-[#8A6B4E]/10'}`}>
                    <p className={`text-sm font-semibold ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`}>
                      {addon.reportLimit} Additional Reports
                    </p>
                  </div>
                </div>
                <Link
                  href="/signup"
                  className={`block w-full px-6 py-3 rounded-lg text-center font-medium transition-colors ${addon.popular ? 'bg-[#8A6B4E] text-[#F4F5F6] hover:bg-[#8A6B4E]/90' : 'bg-[#5A6A7B] text-[#F4F5F6] hover:bg-[#5A6A7B]/90'}`}
                  style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
                >
                  Add to Plan
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <Footer darkMode={darkMode} />
    </div>
  )
}

