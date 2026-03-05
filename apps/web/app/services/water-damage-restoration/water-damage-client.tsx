"use client"

import { useState } from "react"
import Link from "next/link"
import Header from "@/components/landing/Header"
import Footer from "@/components/landing/Footer"

export default function WaterDamageClient() {
  const [darkMode, setDarkMode] = useState(true)

  const heading = darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"
  const body = darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"
  const bg = darkMode ? "bg-[#1C2E47]" : "bg-[#F4F5F6]"
  const sansHeading =
    '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  const sansBody =
    '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  const cellBorder = darkMode ? "border-[#5A6A7B]/30" : "border-[#5A6A7B]/20"
  const cellBg = darkMode ? "bg-[#1C2E47]/70" : "bg-white/70"
  const cardBg = darkMode
    ? "bg-[#1C2E47]/50 border-[#5A6A7B]/30"
    : "bg-[#F4F5F6]/50 border-[#5A6A7B]/20"

  const faqs = [
    {
      q: "What is the IICRC S500 standard?",
      a: "The IICRC S500 is the internationally recognised Standard and Reference Guide for Professional Water Damage Restoration. It defines the criteria for water damage inspection, mitigation, and restoration to ensure a safe and healthy environment.",
    },
    {
      q: "What are the three categories of water damage?",
      a: "Category 1 (Clean Water) originates from a sanitary source such as a broken supply line. Category 2 (Grey Water) contains significant contamination, such as washing machine overflow. Category 3 (Black Water) is grossly contaminated and may contain pathogens — examples include sewage backups and floodwater.",
    },
    {
      q: "How long does the water damage restoration process take?",
      a: "Typical residential drying takes 3 to 5 days depending on the severity, materials affected, and drying class. Category 3 events and large commercial losses can take significantly longer due to decontamination and demolition requirements.",
    },
    {
      q: "What are the four drying classes?",
      a: "Class 1: Least amount of water absorption — affects only part of a room. Class 2: Significant water absorption into carpet, cushion, and wicking up walls. Class 3: Greatest amount of water — saturated ceilings, walls, insulation, and subfloors. Class 4: Specialty drying situations involving deeply trapped moisture in hardwood, concrete, or stone.",
    },
    {
      q: "Why should I choose an IICRC-certified contractor?",
      a: "IICRC-certified contractors have completed formal training in water damage restoration principles, including S500 procedures. Insurers prefer working with certified professionals because it reduces the risk of secondary damage, ensures proper documentation, and leads to faster claim approvals.",
    },
    {
      q: "Will my insurance cover water damage restoration?",
      a: "Most home and contents policies cover sudden and accidental water damage such as burst pipes. Flood damage from external sources may require separate flood cover. Always check your policy and lodge claims promptly. Using an IICRC-certified contractor with NRPG-aligned pricing can expedite insurer approvals.",
    },
    {
      q: "How does RestoreAssist help with water damage projects?",
      a: "RestoreAssist provides contractors with IICRC S500-compliant inspection workflows, automated moisture mapping, NRPG-aligned cost estimation, and professional report generation — ensuring every project is documented to insurer standards from day one.",
    },
  ]

  return (
    <div className={`min-h-screen transition-colors duration-300 ${bg}`}>
      <Header darkMode={darkMode} setDarkMode={setDarkMode} />

      <article className="pt-48 pb-20 px-6 relative z-10 bg-[#C4C8CA]/30">
        <div className="max-w-3xl mx-auto">
          {/* Breadcrumb */}
          <nav className="mb-8" aria-label="Breadcrumb">
            <ol className="flex items-center gap-2 text-sm" style={{ fontFamily: sansBody }}>
              <li>
                <Link href="/" className="text-[#8A6B4E] hover:underline">
                  Home
                </Link>
              </li>
              <li className={body}>/</li>
              <li>
                <Link href="/services" className="text-[#8A6B4E] hover:underline">
                  Services
                </Link>
              </li>
              <li className={body}>/</li>
              <li className={body}>Water Damage Restoration</li>
            </ol>
          </nav>

          {/* Page Header */}
          <header className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <span
                className="text-xs px-3 py-1 rounded-full bg-[#8A6B4E]/20 text-[#8A6B4E]"
                style={{ fontFamily: sansBody }}
              >
                Service
              </span>
            </div>
            <h1
              className={`text-4xl md:text-5xl font-bold leading-tight ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Water Damage Restoration Services — IICRC S500 Compliant
            </h1>
            <p
              className={`text-xl mt-6 leading-relaxed ${body}`}
              style={{ fontFamily: sansBody }}
            >
              Professional water damage restoration following the IICRC S500 standard.
              From emergency extraction to complete structural drying, delivered by
              certified contractors across Australia.
            </p>
          </header>

          {/* Article Body */}
          <div
            className={`prose prose-lg max-w-none ${darkMode ? "prose-invert" : ""}`}
            style={{ fontFamily: sansBody }}
          >
            {/* Process Overview */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              The Restoration Process
            </h2>
            <p className={`leading-relaxed mb-6 ${body}`}>
              IICRC S500-compliant water damage restoration follows a structured
              four-phase process designed to return properties to their pre-loss
              condition safely and efficiently.
            </p>

            <div className="grid sm:grid-cols-2 gap-4 mb-8">
              {[
                {
                  step: "1",
                  title: "Inspection & Assessment",
                  desc: "Identify the water source, classify the category and class of water damage, map affected areas with moisture meters, and document the initial scope of loss.",
                },
                {
                  step: "2",
                  title: "Water Extraction",
                  desc: "Remove standing water using truck-mounted or portable extractors. Rapid extraction reduces drying time, limits secondary damage, and lowers overall restoration costs.",
                },
                {
                  step: "3",
                  title: "Drying & Dehumidification",
                  desc: "Deploy air movers, dehumidifiers, and specialty drying equipment. Monitor moisture levels daily with calibrated instruments until materials reach target dry standards.",
                },
                {
                  step: "4",
                  title: "Restoration & Rebuild",
                  desc: "Repair or replace damaged materials — plasterboard, flooring, cabinetry. Final moisture verification confirms the structure is dry and safe for re-occupation.",
                },
              ].map((phase) => (
                <div
                  key={phase.step}
                  className={`p-5 rounded-lg border backdrop-blur-sm ${cardBg}`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="w-8 h-8 rounded-full bg-[#8A6B4E] text-white flex items-center justify-center text-sm font-bold">
                      {phase.step}
                    </span>
                    <h3
                      className={`text-lg font-bold ${heading}`}
                      style={{ fontFamily: sansHeading }}
                    >
                      {phase.title}
                    </h3>
                  </div>
                  <p className={`text-sm leading-relaxed ${body}`}>{phase.desc}</p>
                </div>
              ))}
            </div>

            {/* Categories of Water Damage */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Categories of Water Damage
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              The IICRC S500 classifies water damage into three categories based on the
              level of contamination. The category determines the required restoration
              procedures, PPE, and disposal protocols.
            </p>

            <div className={`overflow-x-auto mb-8 rounded-lg border ${cellBorder}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={`${cellBg} border-b ${cellBorder}`}>
                    <th className={`text-left p-4 font-bold ${heading}`}>Category</th>
                    <th className={`text-left p-4 font-bold ${heading}`}>Source</th>
                    <th className={`text-left p-4 font-bold ${heading}`}>Restoration Approach</th>
                  </tr>
                </thead>
                <tbody className={body}>
                  <tr className={`border-b ${cellBorder}`}>
                    <td className="p-4 font-semibold">Category 1 — Clean Water</td>
                    <td className="p-4">Burst supply line, rainwater, melting ice</td>
                    <td className="p-4">Extract, dry, and monitor. Porous materials can typically be restored in place.</td>
                  </tr>
                  <tr className={`border-b ${cellBorder}`}>
                    <td className="p-4 font-semibold">Category 2 — Grey Water</td>
                    <td className="p-4">Washing machine overflow, dishwasher, aquarium</td>
                    <td className="p-4">Extract, apply antimicrobial treatment, remove affected porous materials that cannot be cleaned.</td>
                  </tr>
                  <tr>
                    <td className="p-4 font-semibold">Category 3 — Black Water</td>
                    <td className="p-4">Sewage backup, floodwater, toilet overflow with faeces</td>
                    <td className="p-4">Remove all affected porous materials, decontaminate structure, antimicrobial treatment, full PPE required.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Drying Classes */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Drying Classes (1&ndash;4)
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              Drying class determines the amount and type of dehumidification equipment
              required. It is based on the ratio of affected wet surface area to the
              volume of the room or space.
            </p>

            <div className={`overflow-x-auto mb-8 rounded-lg border ${cellBorder}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={`${cellBg} border-b ${cellBorder}`}>
                    <th className={`text-left p-4 font-bold ${heading}`}>Class</th>
                    <th className={`text-left p-4 font-bold ${heading}`}>Description</th>
                    <th className={`text-left p-4 font-bold ${heading}`}>Typical Equipment</th>
                  </tr>
                </thead>
                <tbody className={body}>
                  <tr className={`border-b ${cellBorder}`}>
                    <td className="p-4 font-semibold">Class 1</td>
                    <td className="p-4">Least water absorption — small area of a room affected, low-porosity materials</td>
                    <td className="p-4">Minimal air movers and one dehumidifier</td>
                  </tr>
                  <tr className={`border-b ${cellBorder}`}>
                    <td className="p-4 font-semibold">Class 2</td>
                    <td className="p-4">Significant absorption — carpet, cushion, and wicking up walls to 600 mm</td>
                    <td className="p-4">Multiple air movers and dehumidifiers per room</td>
                  </tr>
                  <tr className={`border-b ${cellBorder}`}>
                    <td className="p-4 font-semibold">Class 3</td>
                    <td className="p-4">Greatest absorption — saturated ceilings, walls, insulation, and subfloors</td>
                    <td className="p-4">High-capacity dehumidification, ceiling and wall cavity drying</td>
                  </tr>
                  <tr>
                    <td className="p-4 font-semibold">Class 4</td>
                    <td className="p-4">Specialty drying — deeply trapped moisture in hardwood, concrete, plaster, or stone</td>
                    <td className="p-4">Low-grain-refrigerant or desiccant dehumidifiers, targeted heat drying</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Why IICRC-Certified */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Why Choose IICRC-Certified Contractors
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              The IICRC (Institute of Inspection, Cleaning and Restoration Certification)
              sets the global standard for restoration training and certification. Choosing
              a certified contractor means:
            </p>
            <ul className={`list-disc pl-6 mb-6 space-y-2 ${body}`}>
              <li>
                <strong className={heading}>Formal training</strong> — WRT-certified
                technicians have completed rigorous coursework in water damage restoration
                principles, psychrometry, and drying science.
              </li>
              <li>
                <strong className={heading}>Insurer confidence</strong> — Most Australian
                insurers prefer or require IICRC-certified contractors, leading to faster
                claim approvals and fewer invoice disputes.
              </li>
              <li>
                <strong className={heading}>Proper documentation</strong> — Certified
                contractors produce detailed moisture maps, daily drying logs, and
                photo-documented reports that satisfy insurer audit requirements.
              </li>
              <li>
                <strong className={heading}>Reduced liability</strong> — Following S500
                protocols minimises the risk of secondary damage, mould growth, and
                structural failures that could result in costly callbacks.
              </li>
              <li>
                <strong className={heading}>Continuing education</strong> — IICRC
                certification requires ongoing Continuing Education Credits (CECs),
                ensuring technicians stay current with evolving industry standards.
              </li>
            </ul>

            {/* How RestoreAssist Helps */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              How RestoreAssist Helps Contractors Deliver Compliant Reports
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              RestoreAssist is purpose-built for Australian restoration contractors who
              need to produce IICRC S500-compliant documentation efficiently and
              accurately.
            </p>
            <ul className={`list-disc pl-6 mb-6 space-y-2 ${body}`}>
              <li>
                <strong className={heading}>Guided S500 inspections</strong> — Step-by-step
                workflows ensure no critical data points are missed during the initial
                assessment.
              </li>
              <li>
                <strong className={heading}>Automated moisture mapping</strong> — Capture
                and visualise moisture readings across floor plans to track drying progress.
              </li>
              <li>
                <strong className={heading}>NRPG-aligned quoting</strong> — Generate
                contractor quotes using current National Restoration Pricing Guide rate
                boundaries, reducing insurer pushback.
              </li>
              <li>
                <strong className={heading}>Professional report generation</strong> — Export
                insurer-ready PDF reports with photos, moisture data, equipment logs, and
                scope of works — all from one platform.
              </li>
            </ul>

            {/* FAQ Section */}
            <h2
              className={`text-2xl font-bold mt-10 mb-6 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Frequently Asked Questions
            </h2>
            <div className="space-y-4 mb-8">
              {faqs.map((faq, i) => (
                <div
                  key={i}
                  className={`p-5 rounded-lg border backdrop-blur-sm ${cardBg}`}
                >
                  <h3
                    className={`text-lg font-bold mb-2 ${heading}`}
                    style={{ fontFamily: sansHeading }}
                  >
                    {faq.q}
                  </h3>
                  <p className={`text-sm leading-relaxed ${body}`}>{faq.a}</p>
                </div>
              ))}
            </div>

            {/* CTA */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Get Started with RestoreAssist
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              Whether you are a restoration contractor looking for IICRC-compliant
              tools, or a property owner searching for a certified professional,
              RestoreAssist connects you with the right resources.
            </p>
            <div className="flex flex-wrap gap-4 mt-8 mb-4">
              <Link
                href="/signup"
                className="inline-block px-8 py-3 bg-[#8A6B4E] text-white font-semibold rounded-lg hover:bg-[#8A6B4E]/90 transition-colors"
                style={{ fontFamily: sansBody }}
              >
                Sign Up Free
              </Link>
              <Link
                href="/contractors"
                className="inline-block px-8 py-3 border border-[#8A6B4E] text-[#8A6B4E] font-semibold rounded-lg hover:bg-[#8A6B4E]/10 transition-colors"
                style={{ fontFamily: sansBody }}
              >
                Find a Contractor
              </Link>
            </div>
          </div>
        </div>
      </article>

      <Footer darkMode={darkMode} />
    </div>
  )
}
