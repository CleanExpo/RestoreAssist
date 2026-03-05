"use client"

import { useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  Droplets,
  Flame,
  Bug,
  Award,
  Users,
  Wrench,
  Shield,
  Briefcase,
  Rocket,
  CheckCircle,
  ArrowRight,
} from "lucide-react"
import Header from "@/components/landing/Header"
import Footer from "@/components/landing/Footer"

const headingFont = '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
const bodyFont = '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

export default function NewToIndustryClient() {
  const [darkMode, setDarkMode] = useState(true)

  const disciplines = [
    {
      icon: Droplets,
      title: "Water Damage Restoration",
      description:
        "From burst pipes and storm damage to rising damp — water damage is the most common restoration category. You will learn to extract standing water, set up drying equipment, monitor moisture levels, and document the drying process to IICRC S500 standards.",
    },
    {
      icon: Flame,
      title: "Fire & Smoke Restoration",
      description:
        "Fire jobs involve soot removal, deodourisation, structural cleaning, and contents restoration. IICRC FSRT certification covers the science of smoke behaviour and the correct cleaning chemistry for different residue types.",
    },
    {
      icon: Bug,
      title: "Mould Remediation",
      description:
        "Mould work requires containment, air scrubbing, removal of affected materials, and clearance testing. IICRC AMRT certification is essential — insurers and property managers increasingly demand it before approving remediation scopes.",
    },
    {
      icon: Wrench,
      title: "Contents Restoration",
      description:
        "Restoring personal property — furniture, electronics, documents, soft goods — is a growing specialty. Contents processing, pack-out/pack-back procedures, and ultrasonic cleaning are core skills.",
    },
  ]

  const certifications = [
    {
      code: "WRT",
      name: "Water Restoration Technician",
      description:
        "The foundation certification. Covers water damage principles, psychrometry, equipment operation, and documentation. Required by most insurers before you can work on claims.",
      priority: "Start here",
    },
    {
      code: "ASD",
      name: "Applied Structural Drying",
      description:
        "Advanced drying science — chamber drying, specialised drying techniques, and complex structural assemblies. Typically taken after 6-12 months of field experience post-WRT.",
      priority: "Second step",
    },
    {
      code: "FSRT",
      name: "Fire & Smoke Restoration Technician",
      description:
        "Covers fire damage assessment, soot and smoke residue behaviour, deodourisation methods, and structural cleaning. Required for fire-related insurance work.",
      priority: "Specialisation",
    },
    {
      code: "AMRT",
      name: "Applied Microbial Remediation Technician",
      description:
        "Mould assessment, containment design, remediation protocols, and clearance criteria. Growing in demand as mould awareness increases across Australian property markets.",
      priority: "Specialisation",
    },
  ]

  const associations = [
    {
      name: "NRPG",
      fullName: "National Restoration & Procurement Group",
      benefits: [
        "Access to insurer work panels and preferred contractor agreements",
        "Standardised pricing schedules (NRPG rate cards)",
        "Industry networking events and conferences",
        "Business development support and mentoring",
        "Compliance frameworks and quality assurance programs",
      ],
    },
    {
      name: "CARSI",
      fullName: "Carpet & Associated Repair Services Institute",
      benefits: [
        "Carpet and textile restoration training",
        "Industry best-practice standards for soft flooring",
        "Access to specialised cleaning and repair certifications",
        "Networking with carpet and flooring professionals",
        "Technical support for complex textile restoration jobs",
      ],
    },
  ]

  const equipment = [
    { item: "Moisture meters (pin & pinless)", cost: "$300 - $1,500", note: "Essential for every job — Protimeter, Tramex, or Delmhorst are industry standards" },
    { item: "Thermal imaging camera", cost: "$2,000 - $8,000", note: "FLIR or Seek — reveals hidden moisture behind walls and ceilings" },
    { item: "Air movers (centrifugal fans)", cost: "$200 - $500 each", note: "You will need 10-20 to start — Dri-Eaz, XPOWER, Phoenix" },
    { item: "LGR dehumidifiers", cost: "$2,000 - $5,000 each", note: "Start with 2-4 units — Dri-Eaz, Phoenix, or B-Air" },
    { item: "Air scrubbers / negative air machines", cost: "$1,500 - $4,000 each", note: "Required for mould work and smoke damage — HEPA filtration" },
    { item: "Extraction equipment (carpet wand, pump)", cost: "$500 - $3,000", note: "Truck-mount or portable extractors for water removal" },
    { item: "Hygrometer / thermo-hygrometer", cost: "$100 - $400", note: "For monitoring ambient conditions — temperature and relative humidity" },
    { item: "PPE (respirators, gloves, coveralls)", cost: "$200 - $500 initial", note: "P2/N95 respirators minimum — full-face for mould and fire work" },
    { item: "Vehicle (van or ute with fit-out)", cost: "$20,000 - $60,000", note: "Large enough to carry equipment to site — shelving and tie-downs" },
  ]

  const insuranceTypes = [
    {
      type: "Public Liability",
      description: "Covers third-party injury or property damage. Most insurers and property managers require a minimum of $10 million cover.",
      essential: true,
    },
    {
      type: "Professional Indemnity",
      description: "Covers claims arising from your professional advice or services — e.g. incorrect scope, failed drying, or missed contamination.",
      essential: true,
    },
    {
      type: "Workers Compensation",
      description: "Mandatory if you employ staff. Covers workplace injuries. Requirements vary by state — check your local WorkCover authority.",
      essential: true,
    },
    {
      type: "Tools & Equipment Insurance",
      description: "Covers your restoration equipment against theft, damage, or breakdown. Critical given the capital investment in drying equipment.",
      essential: false,
    },
    {
      type: "Motor Vehicle Insurance",
      description: "Comprehensive cover for your work vehicle and its fit-out. Commercial vehicle policies cover business use.",
      essential: false,
    },
  ]

  const jobSources = [
    {
      source: "Insurance Work Panels",
      description:
        "Join NRPG or approach insurers directly. Insurance work provides steady volume but requires compliance with panel requirements — IICRC certification, documented processes, and agreed rate cards.",
    },
    {
      source: "Direct Referrals from Plumbers & Trades",
      description:
        "Plumbers are often the first call for water damage. Build relationships with local plumbers, electricians, and builders — they will refer work in exchange for reciprocal referrals.",
    },
    {
      source: "Property Managers & Strata Bodies",
      description:
        "Property management companies and body corporates manage hundreds of properties. Get on their preferred contractor list by demonstrating certification, responsiveness, and professional documentation.",
    },
    {
      source: "Google Business & Local SEO",
      description:
        "Set up your Google Business Profile with restoration-specific categories. Optimise for local search terms like 'water damage restoration [city]'. Most homeowners search Google first.",
    },
    {
      source: "Word of Mouth & Reviews",
      description:
        "Deliver excellent work and ask for Google reviews. A strong review profile builds trust and generates organic leads. Aim for 5-star reviews mentioning your professionalism and documentation.",
    },
  ]

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? "bg-[#1C2E47]" : "bg-[#F4F5F6]"}`}>
      <Header darkMode={darkMode} setDarkMode={setDarkMode} />

      {/* Hero Section */}
      <section className="pt-48 pb-20 px-6 relative z-10 min-h-[60vh] flex items-center bg-[#C4C8CA]/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-20 right-10 w-72 h-72 bg-[#8A6B4E]/10 rounded-full blur-3xl" />
          <div className="absolute bottom-20 left-10 w-96 h-96 bg-[#8A6B4E]/8 rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto w-full relative z-10">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <span
              className="inline-block px-4 py-1.5 rounded-full text-sm font-medium mb-6 bg-[#8A6B4E]/20 text-[#8A6B4E] border border-[#8A6B4E]/30"
              style={{ fontFamily: bodyFont }}
            >
              Resource Guide
            </span>
            <h1
              className={`text-4xl md:text-6xl font-bold mb-6 leading-tight ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
              style={{ fontFamily: headingFont }}
            >
              New to the Restoration Industry?
            </h1>
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className={`text-xl md:text-2xl max-w-3xl ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
            style={{ fontFamily: bodyFont }}
          >
            Your complete guide to starting a water, fire, or mould restoration business in Australia — from
            certifications and equipment to winning your first jobs.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mt-8 flex flex-wrap gap-4"
          >
            <Link
              href="/resources/new-to-industry/getting-started-checklist"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#8A6B4E] text-white rounded-lg font-medium hover:bg-[#8A6B4E]/80 transition-colors"
              style={{ fontFamily: bodyFont }}
            >
              <CheckCircle size={20} />
              Getting Started Checklist
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#5A6A7B] text-white rounded-lg font-medium hover:bg-[#5A6A7B]/80 transition-colors"
              style={{ fontFamily: bodyFont }}
            >
              Start Free Trial
              <ArrowRight size={20} />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* What is the Restoration Industry */}
      <section className="py-20 px-6 relative bg-[#C4C8CA]/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-10 left-1/4 w-80 h-80 bg-[#8A6B4E]/12 rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-1/4 w-64 h-64 bg-[#8A6B4E]/10 rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <h2
              className={`text-3xl md:text-4xl font-bold mb-4 ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
              style={{ fontFamily: headingFont }}
            >
              What is the Restoration Industry?
            </h2>
            <p
              className={`text-lg leading-relaxed mb-12 max-w-3xl ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
              style={{ fontFamily: bodyFont }}
            >
              The restoration industry repairs and restores properties after damage from water, fire, smoke, storms, and
              mould. Unlike general construction, restoration focuses on returning a property to its pre-loss condition
              — working with insurers, adjusters, and property owners under strict documentation and compliance
              requirements.
            </p>
          </motion.div>
          <div className="grid md:grid-cols-2 gap-8">
            {disciplines.map((d, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                className={`p-6 rounded-lg ${darkMode ? "bg-[#1C2E47]/50" : "bg-[#F4F5F6]/50"} backdrop-blur-sm border ${darkMode ? "border-[#5A6A7B]/30" : "border-[#5A6A7B]/20"}`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-[#8A6B4E]/20">
                    <d.icon size={24} className="text-[#8A6B4E]" />
                  </div>
                  <h3
                    className={`text-xl font-bold ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                    style={{ fontFamily: headingFont }}
                  >
                    {d.title}
                  </h3>
                </div>
                <p className={`text-sm leading-relaxed ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`} style={{ fontFamily: bodyFont }}>
                  {d.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* IICRC Certification */}
      <section className={`py-20 px-6 relative overflow-hidden ${darkMode ? "bg-[#1C2E47]" : "bg-white"}`}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-20 right-10 w-72 h-72 bg-[#8A6B4E]/8 rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-[#8A6B4E]/20">
                <Award size={28} className="text-[#8A6B4E]" />
              </div>
              <h2
                className={`text-3xl md:text-4xl font-bold ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                style={{ fontFamily: headingFont }}
              >
                IICRC Certification — Why It Matters
              </h2>
            </div>
            <p
              className={`text-lg leading-relaxed mb-12 max-w-3xl ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
              style={{ fontFamily: bodyFont }}
            >
              The Institute of Inspection Cleaning and Restoration Certification (IICRC) sets the global standard for
              restoration professionals. In Australia, IICRC certification is effectively mandatory — insurers, loss
              adjusters, and property managers expect it. Without WRT certification, you will struggle to get on
              insurance work panels or win commercial contracts.
            </p>
          </motion.div>
          <div className="grid md:grid-cols-2 gap-6">
            {certifications.map((cert, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                className={`p-6 rounded-lg ${darkMode ? "bg-[#1C2E47]/50 border-[#5A6A7B]/30" : "bg-[#F4F5F6]/50 border-[#5A6A7B]/20"} border backdrop-blur-sm`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3
                    className={`text-2xl font-bold ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                    style={{ fontFamily: headingFont }}
                  >
                    {cert.code}
                  </h3>
                  <span
                    className="px-3 py-1 text-xs font-semibold rounded-full bg-[#8A6B4E]/20 text-[#8A6B4E] border border-[#8A6B4E]/30"
                    style={{ fontFamily: bodyFont }}
                  >
                    {cert.priority}
                  </span>
                </div>
                <h4
                  className={`text-base font-semibold mb-2 ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
                  style={{ fontFamily: headingFont }}
                >
                  {cert.name}
                </h4>
                <p className={`text-sm leading-relaxed ${darkMode ? "text-[#C4C8CA]/80" : "text-[#5A6A7B]/80"}`} style={{ fontFamily: bodyFont }}>
                  {cert.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Industry Associations */}
      <section className="py-20 px-6 relative bg-[#C4C8CA]/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute bottom-20 left-10 w-96 h-96 bg-[#8A6B4E]/8 rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-[#8A6B4E]/20">
                <Users size={28} className="text-[#8A6B4E]" />
              </div>
              <h2
                className={`text-3xl md:text-4xl font-bold ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                style={{ fontFamily: headingFont }}
              >
                Industry Associations
              </h2>
            </div>
            <p
              className={`text-lg leading-relaxed mb-12 max-w-3xl ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
              style={{ fontFamily: bodyFont }}
            >
              Industry associations connect you with insurers, provide pricing frameworks, and give your business
              credibility. For new contractors in Australia, NRPG membership is particularly valuable for accessing
              insurance work.
            </p>
          </motion.div>
          <div className="grid md:grid-cols-2 gap-8">
            {associations.map((assoc, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.15 }}
                className={`p-6 rounded-lg ${darkMode ? "bg-[#1C2E47]/50" : "bg-[#F4F5F6]/50"} backdrop-blur-sm border ${darkMode ? "border-[#5A6A7B]/30" : "border-[#5A6A7B]/20"}`}
              >
                <h3
                  className={`text-2xl font-bold mb-1 ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                  style={{ fontFamily: headingFont }}
                >
                  {assoc.name}
                </h3>
                <p
                  className={`text-sm mb-4 ${darkMode ? "text-[#C4C8CA]/70" : "text-[#5A6A7B]/70"}`}
                  style={{ fontFamily: bodyFont }}
                >
                  {assoc.fullName}
                </p>
                <ul className="space-y-2">
                  {assoc.benefits.map((b, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <CheckCircle size={16} className="text-[#8A6B4E] mt-0.5 flex-shrink-0" />
                      <span className={`text-sm ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`} style={{ fontFamily: bodyFont }}>
                        {b}
                      </span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Equipment */}
      <section className={`py-20 px-6 relative overflow-hidden ${darkMode ? "bg-[#1C2E47]" : "bg-white"}`}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-10 right-1/4 w-80 h-80 bg-[#8A6B4E]/8 rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-[#8A6B4E]/20">
                <Wrench size={28} className="text-[#8A6B4E]" />
              </div>
              <h2
                className={`text-3xl md:text-4xl font-bold ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                style={{ fontFamily: headingFont }}
              >
                Equipment You Need to Get Started
              </h2>
            </div>
            <p
              className={`text-lg leading-relaxed mb-12 max-w-3xl ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
              style={{ fontFamily: bodyFont }}
            >
              Starting a restoration business requires significant equipment investment. Below is a realistic breakdown
              of what you need and what it costs in Australia.
            </p>
          </motion.div>
          <div className="space-y-4">
            {equipment.map((eq, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className={`p-5 rounded-lg ${darkMode ? "bg-[#1C2E47]/50 border-[#5A6A7B]/30" : "bg-[#F4F5F6]/50 border-[#5A6A7B]/20"} border backdrop-blur-sm flex flex-col md:flex-row md:items-center gap-4`}
              >
                <div className="flex-1">
                  <h4
                    className={`text-base font-semibold ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                    style={{ fontFamily: headingFont }}
                  >
                    {eq.item}
                  </h4>
                  <p className={`text-sm mt-1 ${darkMode ? "text-[#C4C8CA]/80" : "text-[#5A6A7B]/80"}`} style={{ fontFamily: bodyFont }}>
                    {eq.note}
                  </p>
                </div>
                <div
                  className="px-4 py-2 rounded-lg bg-[#8A6B4E]/20 text-[#8A6B4E] font-semibold text-sm whitespace-nowrap"
                  style={{ fontFamily: bodyFont }}
                >
                  {eq.cost}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Insurance Requirements */}
      <section className="py-20 px-6 relative bg-[#C4C8CA]/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-20 left-10 w-72 h-72 bg-[#8A6B4E]/10 rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-[#8A6B4E]/20">
                <Shield size={28} className="text-[#8A6B4E]" />
              </div>
              <h2
                className={`text-3xl md:text-4xl font-bold ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                style={{ fontFamily: headingFont }}
              >
                Insurance Requirements
              </h2>
            </div>
            <p
              className={`text-lg leading-relaxed mb-12 max-w-3xl ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
              style={{ fontFamily: bodyFont }}
            >
              Proper insurance is non-negotiable. Insurers and property managers will ask for your certificates of
              currency before you set foot on site.
            </p>
          </motion.div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {insuranceTypes.map((ins, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                className={`p-6 rounded-lg ${darkMode ? "bg-[#1C2E47]/50" : "bg-[#F4F5F6]/50"} backdrop-blur-sm border ${darkMode ? "border-[#5A6A7B]/30" : "border-[#5A6A7B]/20"}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3
                    className={`text-lg font-bold ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                    style={{ fontFamily: headingFont }}
                  >
                    {ins.type}
                  </h3>
                  {ins.essential && (
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-[#8A6B4E]/20 text-[#8A6B4E] border border-[#8A6B4E]/30">
                      Essential
                    </span>
                  )}
                </div>
                <p className={`text-sm leading-relaxed ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`} style={{ fontFamily: bodyFont }}>
                  {ins.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How to Win Your First Jobs */}
      <section className={`py-20 px-6 relative overflow-hidden ${darkMode ? "bg-[#1C2E47]" : "bg-white"}`}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-[#8A6B4E]/8 rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-[#8A6B4E]/20">
                <Briefcase size={28} className="text-[#8A6B4E]" />
              </div>
              <h2
                className={`text-3xl md:text-4xl font-bold ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                style={{ fontFamily: headingFont }}
              >
                How to Win Your First Jobs
              </h2>
            </div>
            <p
              className={`text-lg leading-relaxed mb-12 max-w-3xl ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
              style={{ fontFamily: bodyFont }}
            >
              Getting your first restoration jobs requires a mix of industry relationships, panel access, and local
              marketing. Here are the most effective channels for new contractors in Australia.
            </p>
          </motion.div>
          <div className="space-y-6">
            {jobSources.map((js, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className={`p-6 rounded-lg ${darkMode ? "bg-[#1C2E47]/50 border-[#5A6A7B]/30" : "bg-[#F4F5F6]/50 border-[#5A6A7B]/20"} border backdrop-blur-sm`}
              >
                <h3
                  className={`text-lg font-bold mb-2 ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                  style={{ fontFamily: headingFont }}
                >
                  {js.source}
                </h3>
                <p className={`text-sm leading-relaxed ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`} style={{ fontFamily: bodyFont }}>
                  {js.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How RestoreAssist Helps */}
      <section className="py-20 px-6 relative bg-[#C4C8CA]/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-10 left-1/4 w-80 h-80 bg-[#8A6B4E]/12 rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-[#8A6B4E]/20">
                <Rocket size={28} className="text-[#8A6B4E]" />
              </div>
              <h2
                className={`text-3xl md:text-4xl font-bold ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                style={{ fontFamily: headingFont }}
              >
                How RestoreAssist Helps New Contractors
              </h2>
            </div>
            <p
              className={`text-lg leading-relaxed mb-12 max-w-3xl ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
              style={{ fontFamily: bodyFont }}
            >
              RestoreAssist was built by restoration professionals for restoration professionals. We give new contractors
              the tools to look established from day one.
            </p>
          </motion.div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {[
              {
                title: "IICRC-Compliant Reports",
                description:
                  "Generate professional moisture mapping reports, drying logs, and inspection documentation that meets IICRC S500/S520 standards — no templates or spreadsheets needed.",
              },
              {
                title: "Digital Documentation",
                description:
                  "Capture photos, moisture readings, and site conditions on your phone. RestoreAssist organises everything into auditable job files that insurers trust.",
              },
              {
                title: "AI-Powered Scoping",
                description:
                  "Our AI analyses your site data and generates accurate scopes of work, helping you price jobs correctly from your very first project.",
              },
              {
                title: "NRPG Rate Integration",
                description:
                  "Built-in NRPG rate cards ensure your quotes and invoices align with industry-standard pricing — critical for insurance panel work.",
              },
              {
                title: "Professional Invoicing",
                description:
                  "Create detailed, line-itemised invoices that break down labour, equipment, and materials in the format insurers expect.",
              },
              {
                title: "Compliance Confidence",
                description:
                  "Built-in compliance checks ensure your documentation meets industry standards before you submit — reducing rejections and payment delays.",
              },
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
                className={`p-6 rounded-lg ${darkMode ? "bg-[#1C2E47]/50" : "bg-[#F4F5F6]/50"} backdrop-blur-sm border ${darkMode ? "border-[#5A6A7B]/30" : "border-[#5A6A7B]/20"}`}
              >
                <h3
                  className={`text-lg font-bold mb-2 ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                  style={{ fontFamily: headingFont }}
                >
                  {feature.title}
                </h3>
                <p className={`text-sm leading-relaxed ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`} style={{ fontFamily: bodyFont }}>
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={`py-20 px-6 relative overflow-hidden ${darkMode ? "bg-[#1C2E47]" : "bg-white"}`}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#8A6B4E]/10 rounded-full blur-3xl" />
        </div>
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <h2
              className={`text-3xl md:text-4xl font-bold mb-6 ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
              style={{ fontFamily: headingFont }}
            >
              Ready to Launch Your Restoration Business?
            </h2>
            <p
              className={`text-lg mb-8 ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
              style={{ fontFamily: bodyFont }}
            >
              Start your free trial and see how RestoreAssist gives new contractors the documentation, compliance, and
              invoicing tools to compete with established firms from day one.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-8 py-4 bg-[#8A6B4E] text-white rounded-lg font-semibold text-lg hover:bg-[#8A6B4E]/80 transition-colors"
                style={{ fontFamily: bodyFont }}
              >
                Start Your Free Trial
                <ArrowRight size={20} />
              </Link>
              <Link
                href="/resources/new-to-industry/getting-started-checklist"
                className="inline-flex items-center gap-2 px-8 py-4 bg-[#5A6A7B] text-white rounded-lg font-semibold text-lg hover:bg-[#5A6A7B]/80 transition-colors"
                style={{ fontFamily: bodyFont }}
              >
                <CheckCircle size={20} />
                View Checklist
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer darkMode={darkMode} />
    </div>
  )
}
