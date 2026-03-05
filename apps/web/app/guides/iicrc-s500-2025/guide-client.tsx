"use client"

import { useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import Header from "@/components/landing/Header"
import Footer from "@/components/landing/Footer"
import { BreadcrumbNav } from "@/components/seo/BreadcrumbNav"
import {
  Droplets,
  ShieldCheck,
  FileText,
  Thermometer,
  Award,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react"

const fontHeading = '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
const fontBody = '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

const breadcrumbs = [
  { name: "Home", url: "/" },
  { name: "Guides", url: "/guides" },
  { name: "AS-IICRC S500:2025", url: "/guides/iicrc-s500-2025" },
]

interface FAQItemProps {
  question: string
  answer: string
  darkMode: boolean
}

function FAQItem({ question, answer, darkMode }: FAQItemProps) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors ${
        darkMode ? "border-[#5A6A7B]/30 bg-[#1C2E47]/50" : "border-[#5A6A7B]/20 bg-white/50"
      }`}
    >
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between p-5 text-left ${
          darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"
        }`}
        style={{ fontFamily: fontHeading }}
        aria-expanded={open}
      >
        <span className="font-semibold text-base pr-4">{question}</span>
        {open ? <ChevronUp className="size-5 shrink-0" /> : <ChevronDown className="size-5 shrink-0" />}
      </button>
      {open && (
        <div
          className={`px-5 pb-5 text-sm leading-relaxed ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
          style={{ fontFamily: fontBody }}
        >
          {answer}
        </div>
      )}
    </div>
  )
}

export default function GuideClient() {
  const [darkMode, setDarkMode] = useState(true)

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? "bg-[#1C2E47]" : "bg-[#F4F5F6]"}`}>
      <Header darkMode={darkMode} setDarkMode={setDarkMode} />

      {/* Hero Section */}
      <section className="pt-48 pb-16 px-6 relative z-10 min-h-[50vh] flex items-center bg-[#C4C8CA]/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-20 right-10 w-72 h-72 bg-[#8A6B4E]/10 rounded-full blur-3xl" />
          <div className="absolute bottom-20 left-10 w-96 h-96 bg-[#8A6B4E]/8 rounded-full blur-3xl" />
        </div>
        <div className="max-w-4xl mx-auto w-full relative z-10">
          <BreadcrumbNav
            items={breadcrumbs}
            className={`mb-6 ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
          />
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <span
              className={`inline-block text-xs px-3 py-1 rounded-full mb-4 ${
                darkMode ? "bg-[#8A6B4E]/20 text-[#8A6B4E]" : "bg-[#8A6B4E]/10 text-[#8A6B4E]"
              }`}
              style={{ fontFamily: fontBody }}
            >
              Industry Guide
            </span>
            <h1
              className={`text-4xl md:text-5xl font-bold mb-6 leading-tight ${
                darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"
              }`}
              style={{ fontFamily: fontHeading }}
            >
              The Complete Guide to AS-IICRC S500:2025
            </h1>
            <p
              className={`text-xl md:text-2xl mb-4 ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
              style={{ fontFamily: fontBody }}
            >
              Water Damage Restoration Standard for Australian Contractors
            </p>
            <p
              className={`text-sm ${darkMode ? "text-[#5A6A7B]" : "text-[#5A6A7B]"}`}
              style={{ fontFamily: fontBody }}
            >
              Last updated: March 2025 &middot; 15 min read
            </p>
          </motion.div>
        </div>
      </section>

      {/* Table of Contents */}
      <section className="py-12 px-6 bg-[#C4C8CA]/30 overflow-hidden">
        <div className="max-w-4xl mx-auto">
          <div
            className={`p-6 rounded-lg border ${
              darkMode ? "bg-[#1C2E47]/70 border-[#5A6A7B]/30" : "bg-white/70 border-[#5A6A7B]/20"
            }`}
          >
            <h2
              className={`text-lg font-bold mb-4 flex items-center gap-2 ${
                darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"
              }`}
              style={{ fontFamily: fontHeading }}
            >
              <BookOpen className="size-5 text-[#8A6B4E]" />
              In This Guide
            </h2>
            <nav>
              <ol
                className={`space-y-2 text-sm ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
                style={{ fontFamily: fontBody }}
              >
                {[
                  { id: "what-is-s500", label: "What is AS-IICRC S500:2025?" },
                  { id: "key-changes", label: "Key Changes from S500:2021 to S500:2025" },
                  { id: "water-damage-categories", label: "Water Damage Categories (Cat 1, 2, 3)" },
                  { id: "water-damage-classes", label: "Water Damage Classes (Class 1-4)" },
                  { id: "psychrometric-principles", label: "Psychrometric Principles for Australian Climate" },
                  { id: "documentation-requirements", label: "Required Documentation Under S500:2025" },
                  { id: "iicrc-certification", label: "IICRC Certification Requirements for Australian Contractors" },
                  { id: "restoreassist-compliance", label: "How RestoreAssist Helps You Stay S500:2025 Compliant" },
                  { id: "faqs", label: "Frequently Asked Questions" },
                ].map((item, i) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="hover:text-[#8A6B4E] transition-colors"
                    >
                      {i + 1}. {item.label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <article className="py-16 px-6 bg-[#C4C8CA]/30 overflow-hidden">
        <div className="max-w-4xl mx-auto space-y-20">

          {/* Section 1: What is AS-IICRC S500:2025? */}
          <section id="what-is-s500">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-[#8A6B4E]/20">
                  <ShieldCheck className="size-6 text-[#8A6B4E]" />
                </div>
                <h2
                  className={`text-3xl font-bold ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                  style={{ fontFamily: fontHeading }}
                >
                  What is AS-IICRC S500:2025?
                </h2>
              </div>
              <div
                className={`space-y-4 text-base leading-relaxed ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
                style={{ fontFamily: fontBody }}
              >
                <p>
                  The AS-IICRC S500:2025 is the Australian-adopted edition of the IICRC S500 Standard and Reference
                  Guide for Professional Water Damage Restoration. Published by the Institute of Inspection, Cleaning
                  and Restoration Certification (IICRC), the S500 has been the global benchmark for water damage
                  restoration since its first edition in 1994. The 2025 revision represents the most significant update
                  in nearly a decade, reflecting advances in building science, materials technology, and restoration
                  methodology.
                </p>
                <p>
                  In Australia, the standard has been adopted through alignment with Standards Australia, creating a
                  unified reference framework that Australian restoration contractors, insurers, and loss adjusters rely
                  upon. The AS prefix denotes its formal recognition within the Australian standards ecosystem, ensuring
                  that local climatic, regulatory, and building considerations are incorporated alongside the
                  international IICRC framework.
                </p>
                <p>
                  The S500 is not merely a set of guidelines. It is a procedural standard that defines the acceptable
                  practices for water damage inspection, drying, monitoring, and restoration. Contractors who adhere to
                  S500 protocols demonstrate a defensible standard of care that protects their professional standing,
                  satisfies insurer requirements, and delivers measurably better outcomes for property owners.
                </p>
                <p>
                  For Australian restoration businesses, understanding and applying S500:2025 is essential. Insurance
                  companies and loss adjusters increasingly reference S500 compliance when assessing the quality of
                  restoration work. Failure to follow documented S500 procedures can result in disputed claims, withheld
                  payments, and reputational damage. Conversely, contractors who can demonstrate full compliance gain a
                  competitive edge in an industry where accountability and documentation standards are rising rapidly.
                </p>
              </div>
            </motion.div>
          </section>

          {/* Section 2: Key Changes from S500:2021 to S500:2025 */}
          <section id="key-changes">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-[#8A6B4E]/20">
                  <ClipboardList className="size-6 text-[#8A6B4E]" />
                </div>
                <h2
                  className={`text-3xl font-bold ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                  style={{ fontFamily: fontHeading }}
                >
                  Key Changes from S500:2021 to S500:2025
                </h2>
              </div>
              <p
                className={`text-base leading-relaxed mb-6 ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
                style={{ fontFamily: fontBody }}
              >
                The 2025 edition introduces meaningful refinements across multiple areas. While the core framework of
                categories, classes, and psychrometric principles remains intact, the standard has evolved to address
                gaps identified by practitioners and incorporate new building science research. Here are the most
                significant changes Australian contractors need to understand:
              </p>

              {/* Changes Table */}
              <div className="overflow-x-auto">
                <table
                  className={`w-full text-sm border-collapse rounded-lg overflow-hidden ${
                    darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"
                  }`}
                  style={{ fontFamily: fontBody }}
                >
                  <thead>
                    <tr className={darkMode ? "bg-[#1C2E47]" : "bg-white"}>
                      <th className={`px-4 py-3 text-left font-bold border-b ${darkMode ? "border-[#5A6A7B]/30 text-[#F4F5F6]" : "border-[#5A6A7B]/20 text-[#1C2E47]"}`}>
                        Area
                      </th>
                      <th className={`px-4 py-3 text-left font-bold border-b ${darkMode ? "border-[#5A6A7B]/30 text-[#F4F5F6]" : "border-[#5A6A7B]/20 text-[#1C2E47]"}`}>
                        S500:2021
                      </th>
                      <th className={`px-4 py-3 text-left font-bold border-b ${darkMode ? "border-[#5A6A7B]/30 text-[#F4F5F6]" : "border-[#5A6A7B]/20 text-[#1C2E47]"}`}>
                        S500:2025
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        area: "Category Escalation",
                        old: "General guidance on Cat 2 to Cat 3 progression",
                        new: "Defined 48-hour escalation timeline for untreated Cat 2 water with temperature thresholds",
                      },
                      {
                        area: "Antimicrobial Application",
                        old: "Basic antimicrobial guidance",
                        new: "Expanded protocols with product selection criteria, application methods, and contact time requirements",
                      },
                      {
                        area: "Moisture Documentation",
                        old: "Moisture readings recommended",
                        new: "Digital moisture mapping required; grid-based readings with specific interval logging",
                      },
                      {
                        area: "PPE Requirements",
                        old: "General PPE guidance by category",
                        new: "Risk-based PPE matrix with specific respirator, glove, and coverall requirements per contamination level",
                      },
                      {
                        area: "Psychrometric Calculations",
                        old: "Traditional GPP-based drying targets",
                        new: "Updated calculations accounting for modern insulation, vapour barriers, and engineered building products",
                      },
                      {
                        area: "Equipment Monitoring",
                        old: "Daily equipment checks recommended",
                        new: "Mandatory equipment performance logs with dehumidifier intake/output differential tracking",
                      },
                      {
                        area: "Clearance Testing",
                        old: "Visual and moisture meter verification",
                        new: "Comprehensive clearance protocol including thermal imaging confirmation and substrate-specific moisture criteria",
                      },
                    ].map((row, i) => (
                      <tr
                        key={i}
                        className={
                          i % 2 === 0
                            ? darkMode ? "bg-[#1C2E47]/30" : "bg-[#F4F5F6]/50"
                            : darkMode ? "bg-[#1C2E47]/50" : "bg-white/50"
                        }
                      >
                        <td className={`px-4 py-3 font-medium border-b ${darkMode ? "border-[#5A6A7B]/20 text-[#F4F5F6]" : "border-[#5A6A7B]/10 text-[#1C2E47]"}`}>
                          {row.area}
                        </td>
                        <td className={`px-4 py-3 border-b ${darkMode ? "border-[#5A6A7B]/20" : "border-[#5A6A7B]/10"}`}>
                          {row.old}
                        </td>
                        <td className={`px-4 py-3 border-b ${darkMode ? "border-[#5A6A7B]/20" : "border-[#5A6A7B]/10"}`}>
                          {row.new}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </section>

          {/* Section 3: Water Damage Categories */}
          <section id="water-damage-categories">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-[#8A6B4E]/20">
                  <Droplets className="size-6 text-[#8A6B4E]" />
                </div>
                <h2
                  className={`text-3xl font-bold ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                  style={{ fontFamily: fontHeading }}
                >
                  Water Damage Categories (Cat 1, 2, 3)
                </h2>
              </div>
              <div
                className={`space-y-4 text-base leading-relaxed mb-8 ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
                style={{ fontFamily: fontBody }}
              >
                <p>
                  S500:2025 classifies water damage by the contamination level of the water source at the point of
                  contact with indoor materials. Category determination drives the entire restoration protocol, from PPE
                  selection to antimicrobial treatment, disposal procedures, and whether materials can be restored or
                  must be removed. Australian contractors must assess category at first inspection and reassess
                  throughout the project, as category can escalate over time.
                </p>
              </div>

              <div className="grid gap-6">
                {/* Category 1 */}
                <div
                  className={`p-6 rounded-lg border ${
                    darkMode ? "bg-[#1C2E47]/50 border-[#5A6A7B]/30" : "bg-white/50 border-[#5A6A7B]/20"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <CheckCircle2 className="size-5 text-emerald-500" />
                    <h3
                      className={`text-xl font-bold ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                      style={{ fontFamily: fontHeading }}
                    >
                      Category 1 — Clean Water
                    </h3>
                  </div>
                  <div
                    className={`space-y-3 text-sm leading-relaxed ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
                    style={{ fontFamily: fontBody }}
                  >
                    <p>
                      Category 1 water originates from a sanitary source and poses no substantial risk from dermal,
                      ingestion, or inhalation exposure. This is the most straightforward category for restoration work,
                      though it still requires proper drying protocols to prevent microbial amplification.
                    </p>
                    <p>
                      <strong className={darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}>Australian examples:</strong>{" "}
                      Burst mains water supply pipe, leaking hot water system feed line, rainwater intrusion through a
                      clean roof with no accumulated debris, overflow from a sink or bath with potable water supply, or
                      a failed icemaker connection line.
                    </p>
                    <p>
                      <strong className={darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}>Key consideration:</strong>{" "}
                      Category 1 water can escalate to Category 2 within 48 hours if left untreated, especially in
                      Australian summer conditions where ambient temperatures frequently exceed 30 degrees Celsius. Warm,
                      moist conditions promote rapid microbial growth, making timely response critical even for clean
                      water losses.
                    </p>
                  </div>
                </div>

                {/* Category 2 */}
                <div
                  className={`p-6 rounded-lg border ${
                    darkMode ? "bg-[#1C2E47]/50 border-[#5A6A7B]/30" : "bg-white/50 border-[#5A6A7B]/20"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <AlertTriangle className="size-5 text-amber-500" />
                    <h3
                      className={`text-xl font-bold ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                      style={{ fontFamily: fontHeading }}
                    >
                      Category 2 — Grey Water
                    </h3>
                  </div>
                  <div
                    className={`space-y-3 text-sm leading-relaxed ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
                    style={{ fontFamily: fontBody }}
                  >
                    <p>
                      Category 2 water contains significant contamination and has the potential to cause discomfort or
                      illness if contacted or consumed. It may contain microorganisms, nutrients for microbial growth,
                      or other organic or inorganic matter.
                    </p>
                    <p>
                      <strong className={darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}>Australian examples:</strong>{" "}
                      Washing machine discharge, dishwasher overflow, toilet overflow with urine but no faeces,
                      aquarium water release, waterbed leakage, or punctured water-filled fire sprinkler systems that
                      have been stagnant for an extended period.
                    </p>
                    <p>
                      <strong className={darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}>Key consideration:</strong>{" "}
                      Under S500:2025, Category 2 water that remains untreated for 48 hours or more in temperatures
                      above 25 degrees Celsius must be escalated to Category 3. This is particularly relevant in
                      Queensland, Northern Territory, and Western Australia where ambient temperatures regularly exceed
                      this threshold for much of the year. Contractors must document temperature conditions at the time
                      of initial assessment.
                    </p>
                  </div>
                </div>

                {/* Category 3 */}
                <div
                  className={`p-6 rounded-lg border ${
                    darkMode ? "bg-[#1C2E47]/50 border-[#5A6A7B]/30" : "bg-white/50 border-[#5A6A7B]/20"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <AlertTriangle className="size-5 text-red-500" />
                    <h3
                      className={`text-xl font-bold ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                      style={{ fontFamily: fontHeading }}
                    >
                      Category 3 — Black Water
                    </h3>
                  </div>
                  <div
                    className={`space-y-3 text-sm leading-relaxed ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
                    style={{ fontFamily: fontBody }}
                  >
                    <p>
                      Category 3 water is grossly contaminated and may contain pathogenic, toxigenic, or other harmful
                      agents. It poses the highest risk to occupants and restoration workers and demands the most
                      rigorous protocols for safety, containment, and material disposal.
                    </p>
                    <p>
                      <strong className={darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}>Australian examples:</strong>{" "}
                      Sewage backflow, river or creek flooding (extremely common in NSW and Queensland flood events),
                      storm surge, ground surface water intrusion carrying soil and contaminants, water that has
                      contacted any biological growth, and any Category 1 or 2 water that has remained untreated long
                      enough to support microbial amplification.
                    </p>
                    <p>
                      <strong className={darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}>Key consideration:</strong>{" "}
                      Category 3 losses require full PPE including respiratory protection, structural containment to
                      prevent cross-contamination, and removal of all porous materials that contacted the water. In
                      Australian flood events, entire communities may be affected, and contractors must be prepared to
                      document each property individually while following strict decontamination protocols between sites.
                      S500:2025 strengthens the requirement for biocide application after extraction and before drying
                      commences.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </section>

          {/* Section 4: Water Damage Classes */}
          <section id="water-damage-classes">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-[#8A6B4E]/20">
                  <Thermometer className="size-6 text-[#8A6B4E]" />
                </div>
                <h2
                  className={`text-3xl font-bold ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                  style={{ fontFamily: fontHeading }}
                >
                  Water Damage Classes (Class 1-4)
                </h2>
              </div>
              <div
                className={`space-y-4 text-base leading-relaxed mb-8 ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
                style={{ fontFamily: fontBody }}
              >
                <p>
                  While categories describe what is in the water, classes describe how much water is present and how
                  difficult the drying process will be. Class determination drives equipment selection and placement,
                  expected drying timelines, and cost estimation. Australian contractors must assess class separately
                  from category because a clean water loss (Cat 1) can still be a Class 4 drying challenge if it
                  saturates hardwood flooring or concrete substrates.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {[
                  {
                    cls: "Class 1",
                    title: "Slow Rate of Evaporation",
                    desc: "Water has affected only a small area with minimal absorption into materials. Typically involves part of a room with low-porosity materials. Minimal equipment needed — often a single dehumidifier and a few air movers. Drying time is generally 1-3 days.",
                    equipment: "1 dehumidifier, 2-4 air movers",
                    example: "Small pipe leak affecting a tiled laundry floor with water contained to one area.",
                  },
                  {
                    cls: "Class 2",
                    title: "Fast Rate of Evaporation",
                    desc: "Water has affected an entire room with absorption into structural materials. Carpet, underlay, and walls are wet up to 600mm or higher. This is the most common class encountered in Australian residential water losses and requires calculated equipment placement.",
                    equipment: "1-2 dehumidifiers, 1 air mover per 3-4 linear metres of wall",
                    example: "Burst flexi hose under a bathroom vanity with water wicking through carpet in an adjacent bedroom.",
                  },
                  {
                    cls: "Class 3",
                    title: "Fastest Rate of Evaporation",
                    desc: "Water has come from overhead, saturating walls, ceilings, insulation, carpet, underlay, and sub-floor. The evaporation surface area is maximised. This class demands the highest volume of drying equipment and careful monitoring to prevent secondary damage.",
                    equipment: "2+ dehumidifiers, 1 air mover per 1.5-2 linear metres, possible injectidry systems",
                    example: "Upper-storey bathroom supply line failure causing water to saturate ceiling plasterboard, walls, and carpet on the floor below.",
                  },
                  {
                    cls: "Class 4",
                    title: "Specialty Drying Situations",
                    desc: "Water has been absorbed by materials with very low permeance or porosity that require specialised drying methods. Standard air movers and dehumidifiers alone will not achieve drying goals. Techniques include heat drying, desiccant dehumidification, and controlled demolition to expose trapped moisture.",
                    equipment: "Desiccant dehumidifiers, heat drying systems, injectidry panels, floor mat systems",
                    example: "Water saturation of hardwood timber flooring, stone benchtops, concrete slab on grade, or plaster walls with multiple coats of gloss paint creating a vapour barrier.",
                  },
                ].map((item) => (
                  <div
                    key={item.cls}
                    className={`p-6 rounded-lg border ${
                      darkMode ? "bg-[#1C2E47]/50 border-[#5A6A7B]/30" : "bg-white/50 border-[#5A6A7B]/20"
                    }`}
                  >
                    <h3
                      className={`text-lg font-bold mb-1 ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                      style={{ fontFamily: fontHeading }}
                    >
                      {item.cls} — {item.title}
                    </h3>
                    <p
                      className={`text-sm leading-relaxed mb-3 ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
                      style={{ fontFamily: fontBody }}
                    >
                      {item.desc}
                    </p>
                    <div className={`text-xs space-y-1 ${darkMode ? "text-[#5A6A7B]" : "text-[#5A6A7B]"}`} style={{ fontFamily: fontBody }}>
                      <p>
                        <strong className={darkMode ? "text-[#C4C8CA]" : "text-[#1C2E47]"}>Typical equipment:</strong>{" "}
                        {item.equipment}
                      </p>
                      <p>
                        <strong className={darkMode ? "text-[#C4C8CA]" : "text-[#1C2E47]"}>AU example:</strong>{" "}
                        {item.example}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </section>

          {/* Section 5: Psychrometric Principles */}
          <section id="psychrometric-principles">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-[#8A6B4E]/20">
                  <Thermometer className="size-6 text-[#8A6B4E]" />
                </div>
                <h2
                  className={`text-3xl font-bold ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                  style={{ fontFamily: fontHeading }}
                >
                  Psychrometric Principles for Australian Climate
                </h2>
              </div>
              <div
                className={`space-y-4 text-base leading-relaxed ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
                style={{ fontFamily: fontBody }}
              >
                <p>
                  Psychrometry is the science of air-water vapour mixtures, and it underpins every drying decision a
                  restoration technician makes. Understanding psychrometric principles is what separates professional
                  S500-compliant drying from simply placing fans in a room and hoping for the best. In Australia, where
                  climate conditions vary dramatically between regions and seasons, psychrometric literacy is
                  particularly critical.
                </p>

                <h3
                  className={`text-xl font-bold pt-4 ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                  style={{ fontFamily: fontHeading }}
                >
                  Key Psychrometric Concepts
                </h3>
                <ul className="space-y-3 list-none">
                  {[
                    {
                      term: "Relative Humidity (RH)",
                      def: "The percentage of moisture in the air relative to its maximum capacity at a given temperature. Drying goals typically target below 60% RH in the affected space to prevent microbial growth.",
                    },
                    {
                      term: "Grains Per Pound (GPP) / Grams Per Kilogram (g/kg)",
                      def: "The absolute moisture content of air, independent of temperature. GPP is the primary metric for calculating drying efficiency. The difference between outside GPP and inside GPP determines whether ventilation will help or hinder drying.",
                    },
                    {
                      term: "Dew Point",
                      def: "The temperature at which air becomes saturated and condensation forms. Critical for preventing secondary damage — if surface temperatures drop below dew point, condensation will occur on walls, windows, and other surfaces.",
                    },
                    {
                      term: "Temperature",
                      def: "Warmer air holds more moisture, which increases evaporation rate from wet materials. S500:2025 recommends maintaining the drying environment between 20-30 degrees Celsius for optimal drying efficiency.",
                    },
                  ].map((item) => (
                    <li key={item.term} className={`pl-4 border-l-2 ${darkMode ? "border-[#8A6B4E]/40" : "border-[#8A6B4E]/30"}`}>
                      <strong className={darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}>{item.term}:</strong> {item.def}
                    </li>
                  ))}
                </ul>

                <h3
                  className={`text-xl font-bold pt-4 ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                  style={{ fontFamily: fontHeading }}
                >
                  Australian Climate Considerations
                </h3>
                <p>
                  Australia presents unique psychrometric challenges that differ from the North American context in which
                  S500 was originally developed. Contractors working across Australian climate zones must adapt their
                  approach accordingly:
                </p>
                <ul className="space-y-3 list-none">
                  {[
                    {
                      region: "Tropical North (QLD, NT, northern WA)",
                      detail: "High ambient humidity (often 70-90% RH) means refrigerant dehumidifiers may struggle to achieve target conditions. Desiccant dehumidifiers are frequently required. Outside air ventilation is rarely beneficial as external GPP often exceeds internal GPP. Expect longer drying times and higher equipment ratios than S500 guidelines suggest for temperate climates.",
                    },
                    {
                      region: "Temperate Southeast (VIC, TAS, ACT, southern NSW)",
                      detail: "Winter drying presents the opposite challenge — cold ambient temperatures reduce evaporation rates. Supplemental heating may be required to maintain the 20-30 degree target range. However, winter humidity is typically lower, making refrigerant dehumidifiers highly effective. Spring and autumn offer the most favourable natural drying conditions.",
                    },
                    {
                      region: "Arid Interior (SA, western NSW, inland QLD/WA)",
                      detail: "Low ambient humidity and high temperatures create ideal natural drying conditions for Category 1 losses. Controlled ventilation with outside air can significantly reduce or eliminate the need for dehumidifiers in some Class 1 and Class 2 situations. However, rapid drying must be monitored to prevent timber checking and cracking from excessive moisture gradient.",
                    },
                    {
                      region: "Coastal Areas (all states)",
                      detail: "Salt-laden air introduces additional corrosion concerns for equipment and may contribute to contamination category escalation. Coastal areas also experience rapid humidity fluctuations with sea breezes, requiring more frequent atmospheric monitoring to maintain consistent drying conditions.",
                    },
                  ].map((item) => (
                    <li key={item.region} className={`pl-4 border-l-2 ${darkMode ? "border-[#8A6B4E]/40" : "border-[#8A6B4E]/30"}`}>
                      <strong className={darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}>{item.region}:</strong> {item.detail}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </section>

          {/* Section 6: Documentation Requirements */}
          <section id="documentation-requirements">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-[#8A6B4E]/20">
                  <FileText className="size-6 text-[#8A6B4E]" />
                </div>
                <h2
                  className={`text-3xl font-bold ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                  style={{ fontFamily: fontHeading }}
                >
                  Required Documentation Under S500:2025
                </h2>
              </div>
              <div
                className={`space-y-4 text-base leading-relaxed ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
                style={{ fontFamily: fontBody }}
              >
                <p>
                  Documentation is arguably the most important operational requirement of S500:2025. Thorough
                  documentation protects the contractor in disputes, satisfies insurer reporting requirements, and
                  provides an auditable record that the work met the standard of care. The 2025 edition significantly
                  strengthens documentation requirements, moving from recommendations to mandates in several areas.
                </p>
                <p>
                  The following documentation must be created and retained for every water damage restoration project:
                </p>

                <div className="grid md:grid-cols-2 gap-4 pt-2">
                  {[
                    {
                      title: "Initial Assessment Report",
                      items: [
                        "Source identification and cause of loss",
                        "Water damage category determination with rationale",
                        "Water damage class determination",
                        "Affected materials inventory",
                        "Preliminary scope of work",
                        "Photographic evidence of all affected areas before work begins",
                      ],
                    },
                    {
                      title: "Moisture Documentation",
                      items: [
                        "Baseline moisture readings for affected and unaffected materials",
                        "Moisture mapping on a grid pattern (S500:2025 now mandates grid-based digital mapping)",
                        "Instrument type and calibration status for each meter used",
                        "Daily moisture readings at consistent locations throughout drying",
                        "Post-drying moisture verification readings with comparison to dry standard",
                      ],
                    },
                    {
                      title: "Atmospheric Monitoring",
                      items: [
                        "Temperature readings (ambient, surface, and external)",
                        "Relative humidity readings (inside affected area and outside)",
                        "GPP/g-per-kg calculations showing drying progress",
                        "Dew point monitoring where condensation risk exists",
                        "Readings taken at minimum 12-hour intervals during active drying",
                      ],
                    },
                    {
                      title: "Equipment Records",
                      items: [
                        "Equipment type, model, and serial number for each unit deployed",
                        "Placement location and date/time of deployment",
                        "Daily operational checks confirming equipment is functioning",
                        "Dehumidifier intake and output readings (S500:2025 requirement)",
                        "Date/time of equipment removal with rationale",
                      ],
                    },
                    {
                      title: "Photo Documentation",
                      items: [
                        "Pre-existing damage and conditions",
                        "Extent of water damage before mitigation",
                        "Equipment placement",
                        "Progress photos during drying",
                        "Final condition at project completion",
                        "Photos must include timestamps and location identifiers",
                      ],
                    },
                    {
                      title: "Final Clearance Report",
                      items: [
                        "Confirmation that all materials have reached dry standard",
                        "Thermal imaging verification (S500:2025 requirement)",
                        "Summary of work performed with timeline",
                        "Materials removed and disposed (with waste receipts where required)",
                        "Recommendations for any remaining repairs or monitoring",
                        "Sign-off by qualified technician",
                      ],
                    },
                  ].map((doc) => (
                    <div
                      key={doc.title}
                      className={`p-5 rounded-lg border ${
                        darkMode ? "bg-[#1C2E47]/50 border-[#5A6A7B]/30" : "bg-white/50 border-[#5A6A7B]/20"
                      }`}
                    >
                      <h4
                        className={`text-sm font-bold mb-3 ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                        style={{ fontFamily: fontHeading }}
                      >
                        {doc.title}
                      </h4>
                      <ul className="space-y-1.5">
                        {doc.items.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs">
                            <CheckCircle2 className="size-3.5 text-[#8A6B4E] mt-0.5 shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </section>

          {/* Section 7: IICRC Certification */}
          <section id="iicrc-certification">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-[#8A6B4E]/20">
                  <Award className="size-6 text-[#8A6B4E]" />
                </div>
                <h2
                  className={`text-3xl font-bold ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                  style={{ fontFamily: fontHeading }}
                >
                  IICRC Certification Requirements for Australian Contractors
                </h2>
              </div>
              <div
                className={`space-y-4 text-base leading-relaxed ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
                style={{ fontFamily: fontBody }}
              >
                <p>
                  The IICRC offers a structured certification pathway for restoration professionals. In Australia, these
                  certifications are delivered through IICRC-approved training providers and are recognised by major
                  insurers, loss adjusters, and industry bodies. While holding IICRC certification is not mandated by
                  legislation in all states, it has become the de facto industry requirement for any contractor seeking
                  insurance restoration work.
                </p>

                <div className="grid gap-6 pt-2">
                  {[
                    {
                      cert: "WRT — Water Damage Restoration Technician",
                      desc: "The foundational certification for any technician performing water damage restoration work. WRT covers S500 principles, psychrometry, moisture detection, extraction and drying techniques, antimicrobial procedures, and documentation requirements. This is typically the minimum certification insurers require.",
                      duration: "3-day course with written examination",
                      renewal: "Every 3 years via continuing education credits (CECs)",
                    },
                    {
                      cert: "ASD — Applied Structural Drying",
                      desc: "An advanced certification building on WRT knowledge, focusing on complex drying scenarios including Class 4 situations, multi-storey losses, and commercial properties. ASD-certified technicians are expected to design and manage drying plans for challenging losses, select specialist equipment, and interpret psychrometric data to optimise drying performance.",
                      duration: "3-day course with practical and written examination",
                      renewal: "Every 3 years via continuing education credits (CECs)",
                    },
                    {
                      cert: "OCT — Odour Control Technician",
                      desc: "Addresses the science and methodology of odour identification, source removal, and treatment. Relevant to water damage restoration because microbial growth and Category 2/3 contamination frequently produce persistent odours that require professional treatment beyond standard drying protocols.",
                      duration: "2-day course with written examination",
                      renewal: "Every 3 years via continuing education credits (CECs)",
                    },
                    {
                      cert: "AMRT — Applied Microbial Remediation Technician",
                      desc: "Covers the assessment and remediation of microbial contamination, including mould growth resulting from water damage. Increasingly important in Australia given the high incidence of mould in post-flood and prolonged-leak scenarios. AMRT certification qualifies technicians to develop remediation protocols, establish containment, and perform clearance testing.",
                      duration: "3-day course with written examination",
                      renewal: "Every 3 years via continuing education credits (CECs)",
                    },
                  ].map((cert) => (
                    <div
                      key={cert.cert}
                      className={`p-6 rounded-lg border ${
                        darkMode ? "bg-[#1C2E47]/50 border-[#5A6A7B]/30" : "bg-white/50 border-[#5A6A7B]/20"
                      }`}
                    >
                      <h3
                        className={`text-lg font-bold mb-2 ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                        style={{ fontFamily: fontHeading }}
                      >
                        {cert.cert}
                      </h3>
                      <p
                        className={`text-sm leading-relaxed mb-3 ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
                        style={{ fontFamily: fontBody }}
                      >
                        {cert.desc}
                      </p>
                      <div
                        className={`flex flex-wrap gap-4 text-xs ${darkMode ? "text-[#5A6A7B]" : "text-[#5A6A7B]"}`}
                        style={{ fontFamily: fontBody }}
                      >
                        <span>
                          <strong className={darkMode ? "text-[#C4C8CA]" : "text-[#1C2E47]"}>Duration:</strong>{" "}
                          {cert.duration}
                        </span>
                        <span>
                          <strong className={darkMode ? "text-[#C4C8CA]" : "text-[#1C2E47]"}>Renewal:</strong>{" "}
                          {cert.renewal}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="pt-4">
                  Australian contractors should note that IICRC certification is recognised nationally, but some states
                  and territories have additional licensing requirements for building and trade work. In Queensland,
                  contractors performing structural drying as part of insurance restoration must hold a QBCC licence. In
                  Victoria, certain asbestos-related restoration work requires a separate WorkSafe licence. Always verify
                  state-specific requirements alongside IICRC certification.
                </p>
              </div>
            </motion.div>
          </section>

          {/* Section 8: RestoreAssist Compliance */}
          <section id="restoreassist-compliance">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-[#8A6B4E]/20">
                  <ShieldCheck className="size-6 text-[#8A6B4E]" />
                </div>
                <h2
                  className={`text-3xl font-bold ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                  style={{ fontFamily: fontHeading }}
                >
                  How RestoreAssist Helps You Stay S500:2025 Compliant
                </h2>
              </div>
              <div
                className={`space-y-4 text-base leading-relaxed ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
                style={{ fontFamily: fontBody }}
              >
                <p>
                  Meeting S500:2025 documentation and procedural requirements can be demanding, especially for
                  contractors managing multiple jobs simultaneously. RestoreAssist is purpose-built for Australian
                  restoration professionals, with compliance workflows designed around the S500 standard from the ground
                  up.
                </p>

                <div className="grid md:grid-cols-2 gap-4 pt-2">
                  {[
                    {
                      title: "Digital Inspection Forms",
                      desc: "Pre-built inspection templates mapped to S500:2025 requirements. Category and class determination, moisture readings, atmospheric data, and scope of work are captured in structured forms that ensure nothing is missed.",
                    },
                    {
                      title: "Automated Moisture Logging",
                      desc: "Record moisture readings with location tagging and automatic trend tracking. RestoreAssist generates the grid-based moisture maps that S500:2025 now mandates, with historical comparison to demonstrate drying progress.",
                    },
                    {
                      title: "AI-Powered Report Generation",
                      desc: "Generate comprehensive, professionally formatted restoration reports using AI that understands IICRC terminology and S500 structure. Reports include all required sections with compliant language and appropriate technical detail.",
                    },
                    {
                      title: "Photo Documentation Workflow",
                      desc: "Capture, timestamp, and organise photographic evidence within each job. Photos are automatically linked to the relevant room, area, and stage of work, creating the auditable visual record that insurers and loss adjusters expect.",
                    },
                    {
                      title: "Equipment Tracking",
                      desc: "Log equipment deployment, daily operational checks, and removal with equipment-specific records. Track dehumidifier performance metrics and generate equipment utilisation reports for accurate invoicing.",
                    },
                    {
                      title: "Compliance Reports for Insurers",
                      desc: "Export job documentation in formats that meet insurer and loss adjuster expectations. RestoreAssist reports are designed to reduce back-and-forth by providing the detail and structure that claims assessors require up front.",
                    },
                  ].map((feature) => (
                    <div
                      key={feature.title}
                      className={`p-5 rounded-lg border ${
                        darkMode ? "bg-[#1C2E47]/50 border-[#5A6A7B]/30" : "bg-white/50 border-[#5A6A7B]/20"
                      }`}
                    >
                      <h4
                        className={`text-sm font-bold mb-2 ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                        style={{ fontFamily: fontHeading }}
                      >
                        {feature.title}
                      </h4>
                      <p
                        className={`text-xs leading-relaxed ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
                        style={{ fontFamily: fontBody }}
                      >
                        {feature.desc}
                      </p>
                    </div>
                  ))}
                </div>

                <div
                  className={`mt-8 p-6 rounded-lg border-2 text-center ${
                    darkMode ? "border-[#8A6B4E]/40 bg-[#8A6B4E]/10" : "border-[#8A6B4E]/30 bg-[#8A6B4E]/5"
                  }`}
                >
                  <h3
                    className={`text-xl font-bold mb-2 ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                    style={{ fontFamily: fontHeading }}
                  >
                    Ready to Simplify S500:2025 Compliance?
                  </h3>
                  <p
                    className={`text-sm mb-4 ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
                    style={{ fontFamily: fontBody }}
                  >
                    Join Australian restoration contractors who use RestoreAssist to meet S500:2025 standards on every
                    job.
                  </p>
                  <Link
                    href="/signup"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-[#8A6B4E] text-white rounded-lg font-medium hover:bg-[#8A6B4E]/90 transition-colors"
                    style={{ fontFamily: fontBody }}
                  >
                    Start Your Free Trial
                    <ArrowRight className="size-4" />
                  </Link>
                </div>
              </div>
            </motion.div>
          </section>

          {/* Section 9: FAQs */}
          <section id="faqs">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-[#8A6B4E]/20">
                  <ClipboardList className="size-6 text-[#8A6B4E]" />
                </div>
                <h2
                  className={`text-3xl font-bold ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                  style={{ fontFamily: fontHeading }}
                >
                  Frequently Asked Questions
                </h2>
              </div>
              <div className="space-y-3">
                {[
                  {
                    question: "What is AS-IICRC S500:2025?",
                    answer:
                      "AS-IICRC S500:2025 is the Australian-adopted edition of the IICRC S500 Standard and Reference Guide for Professional Water Damage Restoration. It establishes the procedural standards for water damage inspection, mitigation, and restoration work performed by qualified contractors in Australia. The standard covers everything from water damage classification and drying protocols to documentation requirements and safety procedures.",
                  },
                  {
                    question: "What are the three water damage categories under S500?",
                    answer:
                      "Category 1 (Clean Water) originates from a sanitary source such as a burst supply pipe. Category 2 (Grey Water) contains significant contamination from sources like washing machine discharge or dishwasher overflow. Category 3 (Black Water) is grossly contaminated and may contain pathogenic agents — this includes sewage backflow, floodwater, and any water that has remained untreated long enough to support microbial amplification.",
                  },
                  {
                    question: "Do Australian restoration contractors need IICRC certification?",
                    answer:
                      "While IICRC certification is not a legislated requirement in all Australian jurisdictions, it is the recognised industry standard. Most insurers and loss adjusters require contractors to hold current Water Damage Restoration Technician (WRT) certification as a minimum. Some states reference IICRC standards in their building codes. Holding WRT, ASD, or AMRT certification demonstrates competency and is effectively mandatory for contractors seeking insurance restoration work.",
                  },
                  {
                    question: "What changed between S500:2021 and S500:2025?",
                    answer:
                      "Major changes include defined 48-hour category escalation timelines, expanded antimicrobial application protocols, mandatory digital moisture mapping on a grid pattern, a risk-based PPE selection matrix, updated psychrometric calculations for modern building materials, mandatory dehumidifier performance logging, and comprehensive thermal imaging requirements for clearance testing.",
                  },
                  {
                    question: "What documentation is required under S500:2025?",
                    answer:
                      "S500:2025 requires comprehensive documentation including an initial assessment report with category and class determination, grid-based moisture readings throughout the project, atmospheric monitoring at minimum 12-hour intervals, equipment deployment and performance logs, timestamped photographic evidence at all stages, and a final clearance report with thermal imaging verification and post-drying moisture confirmation.",
                  },
                  {
                    question: "How does RestoreAssist help with S500:2025 compliance?",
                    answer:
                      "RestoreAssist provides digital inspection forms mapped to S500:2025 requirements, automated moisture and atmospheric logging with grid-based mapping, AI-powered report generation using compliant terminology, built-in photo documentation workflows with timestamps and location tagging, equipment tracking with performance metrics, and exportable compliance reports designed for insurer and loss adjuster review.",
                  },
                  {
                    question: "What is the difference between water damage classes and categories?",
                    answer:
                      "Categories describe the contamination level of the water source: Category 1 is clean, Category 2 is grey (contaminated), and Category 3 is black (grossly contaminated). Classes describe the evaporation rate and drying difficulty: Class 1 is the least severe with small affected areas, Class 2 involves a whole room, Class 3 involves water from overhead with maximum evaporation surfaces, and Class 4 involves specialty materials like hardwood and concrete that require advanced drying techniques.",
                  },
                ].map((faq, i) => (
                  <FAQItem
                    key={i}
                    question={faq.question}
                    answer={faq.answer}
                    darkMode={darkMode}
                  />
                ))}
              </div>
            </motion.div>
          </section>

        </div>
      </article>

      <Footer darkMode={darkMode} />
    </div>
  )
}
