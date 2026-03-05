"use client"

import { useState, useCallback } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  CheckCircle,
  Circle,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
} from "lucide-react"
import Header from "@/components/landing/Header"
import Footer from "@/components/landing/Footer"

const headingFont = '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
const bodyFont = '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

interface ChecklistItem {
  id: string
  title: string
  description: string
  category: string
}

const checklistItems: ChecklistItem[] = [
  // Business Registration
  {
    id: "abn",
    title: "Register your ABN (Australian Business Number)",
    description: "Apply through the Australian Business Register (abr.gov.au). Free if you apply directly. Required before you can invoice or open a business bank account.",
    category: "Business Registration",
  },
  {
    id: "business-name",
    title: "Register your business name with ASIC",
    description: "If trading under a name other than your own, register through ASIC. Costs approximately $39 for 1 year or $92 for 3 years.",
    category: "Business Registration",
  },
  {
    id: "business-structure",
    title: "Choose your business structure",
    description: "Sole trader, partnership, company, or trust. Speak to an accountant — most restoration contractors operate as a Pty Ltd company for liability protection.",
    category: "Business Registration",
  },
  {
    id: "gst",
    title: "Register for GST (if turnover exceeds $75,000)",
    description: "Mandatory once your annual turnover exceeds $75,000. Most restoration businesses hit this threshold quickly. Register through the ATO.",
    category: "Business Registration",
  },
  {
    id: "bank-account",
    title: "Open a business bank account",
    description: "Keep business and personal finances separate. You will need your ABN and business registration documents.",
    category: "Business Registration",
  },

  // Certifications
  {
    id: "wrt",
    title: "Complete IICRC WRT certification",
    description: "Water Restoration Technician — the foundation certification. 3-day course available through Australian IICRC-approved training providers. Budget $1,500 - $2,500.",
    category: "Certifications & Training",
  },
  {
    id: "asd",
    title: "Plan for IICRC ASD certification (after field experience)",
    description: "Applied Structural Drying — take this after 6-12 months of field work. Deepens your drying science knowledge and opens more complex jobs.",
    category: "Certifications & Training",
  },
  {
    id: "specialist-cert",
    title: "Consider specialist certifications (FSRT, AMRT)",
    description: "Fire & Smoke Restoration (FSRT) and Applied Microbial Remediation (AMRT) expand your service offering. Prioritise based on your target market.",
    category: "Certifications & Training",
  },
  {
    id: "first-aid",
    title: "Complete first aid and CPR training",
    description: "Required for workplace compliance. Renew CPR annually and first aid every 3 years. Consider adding Working at Heights if needed.",
    category: "Certifications & Training",
  },
  {
    id: "white-card",
    title: "Obtain a White Card (construction induction)",
    description: "Required for any work on construction sites. One-day course, nationally recognised. Approximately $100 - $150.",
    category: "Certifications & Training",
  },

  // Industry Memberships
  {
    id: "nrpg",
    title: "Apply for NRPG membership",
    description: "The National Restoration & Procurement Group provides access to insurer work panels, standardised rate cards, and industry networking. Critical for insurance work.",
    category: "Industry Memberships",
  },
  {
    id: "iicrc-firm",
    title: "Register as an IICRC-certified firm",
    description: "Firm-level certification demonstrates your business meets IICRC standards. Required by many insurers for panel membership. Renew annually.",
    category: "Industry Memberships",
  },

  // Equipment
  {
    id: "moisture-meters",
    title: "Purchase moisture meters (pin and pinless)",
    description: "You need both types. Pin meters for accurate material MC readings, pinless for non-destructive scanning. Budget $500 - $2,000 for a quality set.",
    category: "Equipment Acquisition",
  },
  {
    id: "thermal-camera",
    title: "Purchase a thermal imaging camera",
    description: "Essential for finding hidden moisture and documenting affected areas. FLIR C-series or Seek Thermal are popular entry-level options. Budget $2,000 - $5,000.",
    category: "Equipment Acquisition",
  },
  {
    id: "drying-equipment",
    title: "Acquire air movers and dehumidifiers",
    description: "Start with 10-20 air movers and 2-4 LGR dehumidifiers. Consider leasing initially to reduce upfront costs. Budget $10,000 - $30,000.",
    category: "Equipment Acquisition",
  },
  {
    id: "extraction",
    title: "Acquire extraction equipment",
    description: "Portable carpet extractor and submersible pump minimum. Truck-mount systems come later as you scale. Budget $1,000 - $5,000 to start.",
    category: "Equipment Acquisition",
  },
  {
    id: "ppe",
    title: "Purchase PPE (personal protective equipment)",
    description: "P2/N95 respirators, nitrile gloves, disposable coveralls, safety boots, and eye protection. Budget $300 - $600 for initial stock.",
    category: "Equipment Acquisition",
  },
  {
    id: "vehicle",
    title: "Set up a work vehicle",
    description: "Van or ute large enough to carry your equipment. Install shelving, tie-downs, and signage. Consider wrapping the vehicle with your branding.",
    category: "Equipment Acquisition",
  },

  // Insurance
  {
    id: "public-liability",
    title: "Obtain public liability insurance ($10M minimum)",
    description: "Non-negotiable. Most insurers and property managers require $10M-$20M cover. Speak to a broker experienced in trade insurance.",
    category: "Insurance Coverage",
  },
  {
    id: "professional-indemnity",
    title: "Obtain professional indemnity insurance",
    description: "Covers claims arising from your professional advice or services. Typically $1M - $5M cover. Essential for scope writing and consulting work.",
    category: "Insurance Coverage",
  },
  {
    id: "workers-comp",
    title: "Set up workers compensation (if employing staff)",
    description: "Mandatory for employees. Requirements and providers vary by state. Contact your state WorkCover authority for details.",
    category: "Insurance Coverage",
  },

  // Business Operations
  {
    id: "accounting",
    title: "Set up Xero or accounting software",
    description: "Xero is the most common choice for Australian trade businesses. Connect your bank account, set up GST tracking, and configure invoice templates.",
    category: "Business Operations",
  },
  {
    id: "restoreassist",
    title: "Set up RestoreAssist",
    description: "Get your digital documentation, compliance reporting, and invoicing platform ready. RestoreAssist generates IICRC-compliant reports and integrates with NRPG rate cards.",
    category: "Business Operations",
  },

  // Marketing
  {
    id: "google-business",
    title: "Create your Google Business Profile",
    description: "Set up and verify your Google Business listing with restoration-specific categories. Add photos, services, and request reviews from early clients.",
    category: "Marketing & First Jobs",
  },
  {
    id: "trade-relationships",
    title: "Build relationships with local plumbers and trades",
    description: "Visit local plumbing businesses, introduce yourself, and leave business cards. Plumbers are the number-one referral source for water damage work.",
    category: "Marketing & First Jobs",
  },
  {
    id: "property-managers",
    title: "Introduce yourself to property management companies",
    description: "Send a professional introduction with your certifications, insurance certificates, and a summary of services. Follow up to get on their preferred contractor lists.",
    category: "Marketing & First Jobs",
  },
]

export default function ChecklistClient() {
  const [darkMode, setDarkMode] = useState(true)
  const [checked, setChecked] = useState<Set<string>>(new Set())

  const toggleItem = useCallback((id: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const resetAll = useCallback(() => {
    setChecked(new Set())
  }, [])

  const categories = Array.from(new Set(checklistItems.map((item) => item.category)))
  const completedCount = checked.size
  const totalCount = checklistItems.length
  const progressPercent = Math.round((completedCount / totalCount) * 100)

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? "bg-[#1C2E47]" : "bg-[#F4F5F6]"}`}>
      <Header darkMode={darkMode} setDarkMode={setDarkMode} />

      {/* Hero Section */}
      <section className="pt-48 pb-12 px-6 relative z-10 bg-[#C4C8CA]/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-20 right-10 w-72 h-72 bg-[#8A6B4E]/10 rounded-full blur-3xl" />
          <div className="absolute bottom-20 left-10 w-96 h-96 bg-[#8A6B4E]/8 rounded-full blur-3xl" />
        </div>
        <div className="max-w-4xl mx-auto w-full relative z-10">
          <Link
            href="/resources/new-to-industry"
            className={`inline-flex items-center gap-2 text-sm mb-6 transition-colors ${darkMode ? "text-[#C4C8CA] hover:text-[#F4F5F6]" : "text-[#5A6A7B] hover:text-[#1C2E47]"}`}
            style={{ fontFamily: bodyFont }}
          >
            <ArrowLeft size={16} />
            Back to New to the Industry
          </Link>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className={`text-4xl md:text-5xl font-bold mb-6 leading-tight ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
            style={{ fontFamily: headingFont }}
          >
            Getting Started Checklist
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className={`text-lg md:text-xl max-w-3xl ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
            style={{ fontFamily: bodyFont }}
          >
            Tick off each step as you work through launching your restoration business in Australia. This checklist
            covers everything from ABN registration to winning your first jobs.
          </motion.p>
        </div>
      </section>

      {/* Progress Bar */}
      <section className="px-6 py-8 bg-[#C4C8CA]/30">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <span
              className={`text-sm font-medium ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
              style={{ fontFamily: bodyFont }}
            >
              {completedCount} of {totalCount} completed ({progressPercent}%)
            </span>
            <button
              onClick={resetAll}
              className={`inline-flex items-center gap-1.5 text-sm transition-colors ${darkMode ? "text-[#C4C8CA] hover:text-[#F4F5F6]" : "text-[#5A6A7B] hover:text-[#1C2E47]"}`}
              style={{ fontFamily: bodyFont }}
            >
              <RotateCcw size={14} />
              Reset
            </button>
          </div>
          <div className={`w-full h-3 rounded-full ${darkMode ? "bg-[#1C2E47]/60" : "bg-[#5A6A7B]/20"}`}>
            <motion.div
              className="h-3 rounded-full bg-[#8A6B4E]"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        </div>
      </section>

      {/* Checklist */}
      <section className="py-12 px-6 relative bg-[#C4C8CA]/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-10 left-1/4 w-80 h-80 bg-[#8A6B4E]/12 rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-1/4 w-64 h-64 bg-[#8A6B4E]/10 rounded-full blur-3xl" />
        </div>
        <div className="max-w-4xl mx-auto relative z-10 space-y-12">
          {categories.map((category, catIdx) => {
            const items = checklistItems.filter((item) => item.category === category)
            const catCompleted = items.filter((item) => checked.has(item.id)).length
            return (
              <motion.div
                key={category}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: catIdx * 0.05 }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h2
                    className={`text-2xl font-bold ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                    style={{ fontFamily: headingFont }}
                  >
                    {category}
                  </h2>
                  <span
                    className={`text-sm ${darkMode ? "text-[#C4C8CA]/70" : "text-[#5A6A7B]/70"}`}
                    style={{ fontFamily: bodyFont }}
                  >
                    {catCompleted}/{items.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {items.map((item) => {
                    const isChecked = checked.has(item.id)
                    return (
                      <button
                        key={item.id}
                        onClick={() => toggleItem(item.id)}
                        className={`w-full text-left p-5 rounded-lg border transition-all duration-200 ${
                          isChecked
                            ? darkMode
                              ? "bg-[#8A6B4E]/10 border-[#8A6B4E]/40"
                              : "bg-[#8A6B4E]/5 border-[#8A6B4E]/30"
                            : darkMode
                              ? "bg-[#1C2E47]/50 border-[#5A6A7B]/30 hover:border-[#8A6B4E]/40"
                              : "bg-[#F4F5F6]/50 border-[#5A6A7B]/20 hover:border-[#8A6B4E]/30"
                        } backdrop-blur-sm`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="mt-0.5 flex-shrink-0">
                            {isChecked ? (
                              <CheckCircle size={22} className="text-[#8A6B4E]" />
                            ) : (
                              <Circle
                                size={22}
                                className={darkMode ? "text-[#5A6A7B]/50" : "text-[#5A6A7B]/40"}
                              />
                            )}
                          </div>
                          <div>
                            <h3
                              className={`text-base font-semibold mb-1 ${
                                isChecked
                                  ? "text-[#8A6B4E]"
                                  : darkMode
                                    ? "text-[#F4F5F6]"
                                    : "text-[#1C2E47]"
                              }`}
                              style={{ fontFamily: headingFont }}
                            >
                              {item.title}
                            </h3>
                            <p
                              className={`text-sm leading-relaxed ${darkMode ? "text-[#C4C8CA]/80" : "text-[#5A6A7B]/80"}`}
                              style={{ fontFamily: bodyFont }}
                            >
                              {item.description}
                            </p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* CTA */}
      <section className={`py-20 px-6 relative overflow-hidden ${darkMode ? "bg-[#1C2E47]" : "bg-white"}`}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#8A6B4E]/10 rounded-full blur-3xl" />
        </div>
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <h2
              className={`text-3xl font-bold mb-6 ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
              style={{ fontFamily: headingFont }}
            >
              Ready to Get Started?
            </h2>
            <p
              className={`text-lg mb-8 ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
              style={{ fontFamily: bodyFont }}
            >
              RestoreAssist helps new contractors hit the ground running with IICRC-compliant documentation, NRPG rate
              integration, and AI-powered scoping tools.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#8A6B4E] text-white rounded-lg font-semibold text-lg hover:bg-[#8A6B4E]/80 transition-colors"
              style={{ fontFamily: bodyFont }}
            >
              Start Your Free Trial
              <ArrowRight size={20} />
            </Link>
          </motion.div>
        </div>
      </section>

      <Footer darkMode={darkMode} />
    </div>
  )
}
