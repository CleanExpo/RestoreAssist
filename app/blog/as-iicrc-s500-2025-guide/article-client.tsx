"use client"

import { useState } from "react"
import Link from "next/link"
import Header from "@/components/landing/Header"
import Footer from "@/components/landing/Footer"

interface FAQItemProps {
  question: string
  answer: string
  darkMode: boolean
  sansHeading: string
  sansBody: string
}

function FAQItem({ question, answer, darkMode, sansHeading, sansBody }: FAQItemProps) {
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
        style={{ fontFamily: sansHeading }}
        aria-expanded={open}
      >
        <span className="font-semibold text-base pr-4">{question}</span>
        <svg
          className={`size-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          className={`px-5 pb-5 text-sm leading-relaxed ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
          style={{ fontFamily: sansBody }}
        >
          {answer}
        </div>
      )}
    </div>
  )
}

export default function ArticleClient() {
  const [darkMode, setDarkMode] = useState(true)

  const heading = darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"
  const body = darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"
  const bg = darkMode ? "bg-[#1C2E47]" : "bg-[#F4F5F6]"
  const cardBg = darkMode ? "bg-[#1C2E47]/60 border-[#5A6A7B]/30" : "bg-white/70 border-[#5A6A7B]/20"
  const sansHeading =
    '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  const sansBody =
    '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

  const faqs = [
    {
      question: "What is the difference between AS-IICRC S500:2025 and the previous 2021 edition?",
      answer:
        "The 2025 edition strengthens psychrometric documentation requirements — contractors must now record vapor pressure in Pascals, grains per pound (GPP), and dew point at every moisture reading, not just initial and final measurements. Equipment audit trail requirements are more prescriptive, requiring serial numbers, room location logs, and hours operated for each dehumidifier and air mover. EMC targets for common building materials are also more tightly defined, and the standard explicitly requires calibration certificate documentation for all moisture measurement instruments.",
    },
    {
      question: "Who is required to comply with AS-IICRC S500:2025 in Australia?",
      answer:
        "Any contractor performing water damage restoration work in Australia that is funded through an insurance claim should comply with S500:2025. This includes IICRC-certified firms, contractors on insurer preferred contractor panels, and businesses that tender for institutional or commercial restoration work. While there is no statutory mandate in most Australian jurisdictions, virtually all major insurers now require S500-compliant documentation as a condition of claim acceptance. Non-compliant reports are increasingly rejected outright.",
    },
    {
      question: "What are the psychrometric data fields required by S500:2025?",
      answer:
        "S500:2025 requires documentation of temperature (°C), relative humidity (% RH), vapor pressure (Pa), grains per pound (GPP), dew point (°C), and equilibrium moisture content (EMC) at every measurement point and every visit. These readings must be taken both inside the affected structure and outside as a reference. The standard requires that drying validation be demonstrated through a downward trend in vapor pressure differential between inside and outside readings across consecutive days.",
    },
    {
      question: "What EMC targets does S500:2025 set for different building materials?",
      answer:
        "S500:2025 defines material-specific EMC targets for drying completion. Structural timber and hardwood flooring must reach 12–19% EMC (with species-specific targets where applicable). Gypsum wallboard is typically dry at 0.2–0.5% EMC when measured with a pin-type meter. Concrete slab targets vary by slab thickness and age but generally require readings below 3–4% with a calibrated concrete moisture meter. Engineered wood products have tighter targets, typically 10–15% EMC. The standard requires documentation of the target EMC used and its justification.",
    },
    {
      question: "How should equipment be documented under S500:2025?",
      answer:
        "Each piece of drying equipment must be logged with its make, model, and serial number; the room or zone it was deployed in; the date and time it was placed and removed; total hours operated per day; and its rated capacity (litres per day for dehumidifiers, CFM for air movers). This equipment audit trail must be present in the report to support equipment charges on the invoice. Missing serial numbers or undocumented placements are a common reason for insurer queries under S500:2025.",
    },
    {
      question: "What moisture meter calibration records does S500:2025 require?",
      answer:
        "S500:2025 requires that all moisture measurement instruments used on a job are documented with their serial number, the date of their most recent calibration, and a reference to the calibration certificate. In-field verification (touching two pins together or using a calibration check block) must also be recorded at the start of each day's readings. Calibration records can be challenged by insurers during claim review, so maintaining up-to-date certificates for every instrument in your kit is essential.",
    },
    {
      question: "How can RestoreAssist help me comply with AS-IICRC S500:2025?",
      answer:
        "RestoreAssist automates the most demanding documentation requirements of S500:2025. The platform records psychrometric readings (temperature, RH, vapor pressure, GPP, dew point, EMC) at every data point and links them to room plans. Equipment audit trails are maintained with serial numbers, deployment dates, and hours operated. Calibration records for moisture meters are stored in the equipment register and automatically attached to reports. The system calculates VP differentials and generates a drying validation trend chart — the key proof of drying progress that insurance assessors look for.",
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
                <Link href="/blog" className="text-[#8A6B4E] hover:underline">
                  Blog
                </Link>
              </li>
              <li className={body}>/</li>
              <li className={body}>Compliance</li>
            </ol>
          </nav>

          {/* Article Header */}
          <header className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <span
                className="text-xs px-3 py-1 rounded-full bg-[#8A6B4E]/20 text-[#8A6B4E]"
                style={{ fontFamily: sansBody }}
              >
                Compliance
              </span>
              <span className={`text-xs ${body}`} style={{ fontFamily: sansBody }}>
                12 min read
              </span>
              <span className={`text-xs ${body}`} style={{ fontFamily: sansBody }}>
                March 29, 2026
              </span>
            </div>
            <h1
              className={`text-4xl md:text-5xl font-bold leading-tight ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              AS-IICRC S500:2025 Complete Guide: Water Damage Compliance for Australian Contractors
            </h1>
            <p className={`mt-4 text-lg leading-relaxed ${body}`} style={{ fontFamily: sansBody }}>
              The definitive reference for restoration contractors, insurance repairers, and IICRC-certified firms navigating the 2025 update to Australia&apos;s water damage restoration standard.
            </p>
          </header>

          {/* Article Body */}
          <div
            className={`prose prose-lg max-w-none ${darkMode ? "prose-invert" : ""}`}
            style={{ fontFamily: sansBody }}
          >

            {/* ── Section 1: What is S500:2025 ── */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              1. What Is AS-IICRC S500:2025?
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              AS-IICRC S500:2025 is the current Australian Standard for professional water damage restoration. Published jointly by Standards Australia and the Institute of Inspection, Cleaning and Restoration Certification (IICRC), it sets the benchmark for how water-affected structures must be inspected, assessed, dried, and documented. The standard governs everything from initial Category/Class classification through to final drying validation.
            </p>
            <p className={`leading-relaxed mb-4 ${body}`}>
              The 2025 edition supersedes S500:2021 and introduces materially stronger requirements around psychrometric documentation, equipment audit trails, and calibration records. These are not cosmetic updates. They reflect a deliberate shift by the insurance industry toward evidence-based claim verification — where the data in your report, not your word or your invoice, drives approval decisions.
            </p>
            <p className={`leading-relaxed mb-6 ${body}`}>
              For Australian restoration contractors, AS-IICRC S500:2025 is the de facto compliance framework for any water damage work processed through an insurance claim. Major insurers and loss adjusting firms reference it explicitly in their preferred contractor requirements. Non-compliant reports are increasingly rejected without query.
            </p>

            {/* What changed from 2021 */}
            <h3
              className={`text-xl font-semibold mt-8 mb-3 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Key Changes from S500:2021 to S500:2025
            </h3>
            <ul className={`list-disc pl-6 mb-6 space-y-2 ${body}`}>
              <li>
                <strong className={heading}>Mandatory psychrometric data at every reading:</strong> The 2021 edition required psychrometric documentation at initial assessment and final sign-off. The 2025 edition requires vapor pressure (Pa), grains per pound (GPP), and dew point to be recorded at every moisture reading taken during the job — not just at milestones.
              </li>
              <li>
                <strong className={heading}>Equipment serial number logging:</strong> S500:2025 makes serial number documentation mandatory for every dehumidifier and air mover deployed. Previously, make and model were sufficient for most insurer purposes. Serial numbers are now required to support equipment rental charges and verify calibration compliance.
              </li>
              <li>
                <strong className={heading}>Calibration certificate documentation:</strong> Moisture meters must have their calibration certificate details recorded in the report — not just stated as calibrated. The certificate date, issuing laboratory, and instrument serial number must appear in the documentation.
              </li>
              <li>
                <strong className={heading}>Tighter EMC targets per material class:</strong> The 2025 edition provides more granular material-specific EMC targets, particularly for engineered wood products, composite subfloors, and modern gypsum formulations.
              </li>
              <li>
                <strong className={heading}>Drying validation via VP differential trend:</strong> The standard now explicitly requires that drying progress be validated by demonstrating a downward trend in the vapor pressure differential between internal and external reference readings across consecutive days.
              </li>
            </ul>

            {/* ── Section 2: Who must comply ── */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              2. Who Must Comply with AS-IICRC S500:2025?
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              Compliance with S500:2025 is not currently mandated by Australian legislation in most jurisdictions, but it is functionally compulsory for any contractor doing insurance-funded restoration work. The following groups have the strongest compliance obligations:
            </p>

            <h3
              className={`text-xl font-semibold mt-8 mb-3 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Restoration Contractors on Insurer Preferred Panels
            </h3>
            <p className={`leading-relaxed mb-4 ${body}`}>
              Major Australian insurers — including those operating through CGU, IAG, Suncorp, QBE, Allianz, and Hollard — now embed S500:2025 compliance requirements in their preferred contractor agreements. Panel membership is reviewed against documentation quality, and contractors who consistently fail to deliver compliant reports face demotion or removal from panels. S500:2025-compliant reporting is a baseline requirement, not a differentiator — it is what keeps you on the panel.
            </p>

            <h3
              className={`text-xl font-semibold mt-8 mb-3 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              IICRC-Certified Firms
            </h3>
            <p className={`leading-relaxed mb-4 ${body}`}>
              If your business holds IICRC Firm Certification, compliance with the current S500 standard is part of your certification maintenance obligations. IICRC certifications — including WRT (Water Restoration Technician), ASD (Applied Structural Drying), and RRP (Residential Restoration Professional) — are all underpinned by S500 as the governing technical standard.
            </p>

            <h3
              className={`text-xl font-semibold mt-8 mb-3 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Insurance Repairers and Building Repair Contractors
            </h3>
            <p className={`leading-relaxed mb-4 ${body}`}>
              Contractors who perform the repair and make-good phase following water damage — even if they do not handle the drying — are increasingly required to accept hand-over documentation that meets S500:2025 standards and to confirm that drying completion readings have been reached before commencing works. This creates a chain-of-compliance requirement that pulls all parties in the claim toward the standard.
            </p>

            <h3
              className={`text-xl font-semibold mt-8 mb-3 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Commercial and Strata Restoration Contractors
            </h3>
            <p className={`leading-relaxed mb-4 ${body}`}>
              Commercial building managers, strata schemes, and property management firms increasingly specify S500 compliance in their restoration contracts. For large-loss commercial jobs, S500:2025 compliance may be explicitly written into the scope of works and verified by an independent loss adjuster or hygienist.
            </p>

            {/* ── Section 3: Key Requirements ── */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              3. Key S500:2025 Requirements in Detail
            </h2>

            {/* 3.1 Category/Class */}
            <h3
              className={`text-xl font-semibold mt-8 mb-3 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              3.1 Category and Class Classification
            </h3>
            <p className={`leading-relaxed mb-4 ${body}`}>
              S500:2025 requires formal documentation of the water damage Category and Class at the time of initial assessment. These classifications must appear in the report with supporting rationale — not just as labels.
            </p>
            <div className={`rounded-lg border p-5 mb-6 ${cardBg}`}>
              <p className={`text-sm font-semibold mb-3 ${heading}`} style={{ fontFamily: sansHeading }}>
                Water Categories (Source Contamination)
              </p>
              <ul className={`text-sm space-y-2 ${body}`}>
                <li><strong className={heading}>Category 1 (Clean Water):</strong> Originates from a sanitary source — burst supply pipes, appliance overflows with potable water, rain ingress.</li>
                <li><strong className={heading}>Category 2 (Grey Water):</strong> Contains significant contamination — dishwasher or washing machine overflow, toilet overflow without faeces, sump pump failure.</li>
                <li><strong className={heading}>Category 3 (Black Water):</strong> Grossly contaminated — sewage, flooding from external sources, Category 1 or 2 water that has been stagnant.</li>
              </ul>
              <p className={`text-sm font-semibold mt-4 mb-3 ${heading}`} style={{ fontFamily: sansHeading }}>
                Drying Classes (Extent of Wet Materials)
              </p>
              <ul className={`text-sm space-y-2 ${body}`}>
                <li><strong className={heading}>Class 1:</strong> Least amount of water absorption. Affects part of one room; minimal moisture in materials.</li>
                <li><strong className={heading}>Class 2:</strong> Significant absorption. Affects entire room; moisture in structural materials to depth of 0.6 m.</li>
                <li><strong className={heading}>Class 3:</strong> Greatest absorption. Water may have come from overhead; walls, ceilings, insulation saturated.</li>
                <li><strong className={heading}>Class 4:</strong> Specialty drying situations. Dense, low-porosity materials — hardwood, concrete, plaster — that require extended drying times.</li>
              </ul>
            </div>

            {/* 3.2 Psychrometric data */}
            <h3
              className={`text-xl font-semibold mt-8 mb-3 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              3.2 Psychrometric Data: What Must Be Recorded at Every Reading
            </h3>
            <p className={`leading-relaxed mb-4 ${body}`}>
              This is the most significant compliance uplift in the 2025 edition. S500:2025 requires the following psychrometric data points to be recorded at every moisture measurement, at every visit, in both the affected area and an external reference location:
            </p>
            <div className={`rounded-lg border p-5 mb-4 ${cardBg}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b ${darkMode ? "border-[#5A6A7B]/40" : "border-[#5A6A7B]/20"}`}>
                    <th className={`text-left pb-2 font-semibold ${heading}`} style={{ fontFamily: sansHeading }}>Data Field</th>
                    <th className={`text-left pb-2 font-semibold ${heading}`} style={{ fontFamily: sansHeading }}>Unit</th>
                    <th className={`text-left pb-2 font-semibold ${heading}`} style={{ fontFamily: sansHeading }}>Purpose</th>
                  </tr>
                </thead>
                <tbody className={`${body} space-y-2`}>
                  <tr className={`border-b ${darkMode ? "border-[#5A6A7B]/20" : "border-[#5A6A7B]/10"}`}>
                    <td className="py-2 pr-4">Temperature</td>
                    <td className="py-2 pr-4">°C</td>
                    <td className="py-2">Drives evaporation rate; required for psychrometric calculations</td>
                  </tr>
                  <tr className={`border-b ${darkMode ? "border-[#5A6A7B]/20" : "border-[#5A6A7B]/10"}`}>
                    <td className="py-2 pr-4">Relative Humidity</td>
                    <td className="py-2 pr-4">% RH</td>
                    <td className="py-2">Indicates moisture saturation of air; used with temperature to calculate VP and GPP</td>
                  </tr>
                  <tr className={`border-b ${darkMode ? "border-[#5A6A7B]/20" : "border-[#5A6A7B]/10"}`}>
                    <td className="py-2 pr-4">Vapor Pressure</td>
                    <td className="py-2 pr-4">Pa</td>
                    <td className="py-2">Actual moisture content of air; VP differential between inside and outside proves drying progress</td>
                  </tr>
                  <tr className={`border-b ${darkMode ? "border-[#5A6A7B]/20" : "border-[#5A6A7B]/10"}`}>
                    <td className="py-2 pr-4">Grains Per Pound (GPP)</td>
                    <td className="py-2 pr-4">gr/lb</td>
                    <td className="py-2">Mass of water vapor per unit of dry air; used to calculate dehumidifier capacity requirements</td>
                  </tr>
                  <tr className={`border-b ${darkMode ? "border-[#5A6A7B]/20" : "border-[#5A6A7B]/10"}`}>
                    <td className="py-2 pr-4">Dew Point</td>
                    <td className="py-2 pr-4">°C</td>
                    <td className="py-2">Temperature at which condensation occurs; alerts to secondary damage risk</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Specific Humidity</td>
                    <td className="py-2 pr-4">g/kg</td>
                    <td className="py-2">Supports equipment sizing calculations and drying efficiency assessment</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className={`leading-relaxed mb-6 ${body}`}>
              The critical compliance test is the vapor pressure differential trend. By subtracting external VP from internal VP on each visit day, contractors can demonstrate a downward trend that proves the structure is actively drying. A flat or rising VP differential is a red flag for insurers and may indicate under-equipment or a moisture source that has not been identified and isolated.
            </p>

            {/* 3.3 EMC targets */}
            <h3
              className={`text-xl font-semibold mt-8 mb-3 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              3.3 Equilibrium Moisture Content (EMC) Targets per Material
            </h3>
            <p className={`leading-relaxed mb-4 ${body}`}>
              S500:2025 requires that drying completion be validated against material-specific EMC targets. Contractors must document the target EMC used, the instrument and method used to measure it, and the final readings achieved before signing off the job. The following targets represent the S500:2025 benchmarks for the most common building materials encountered in Australian restoration work:
            </p>
            <div className={`rounded-lg border p-5 mb-6 ${cardBg}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b ${darkMode ? "border-[#5A6A7B]/40" : "border-[#5A6A7B]/20"}`}>
                    <th className={`text-left pb-2 font-semibold ${heading}`} style={{ fontFamily: sansHeading }}>Material</th>
                    <th className={`text-left pb-2 font-semibold ${heading}`} style={{ fontFamily: sansHeading }}>Target EMC</th>
                    <th className={`text-left pb-2 font-semibold ${heading}`} style={{ fontFamily: sansHeading }}>Notes</th>
                  </tr>
                </thead>
                <tbody className={`${body}`}>
                  <tr className={`border-b ${darkMode ? "border-[#5A6A7B]/20" : "border-[#5A6A7B]/10"}`}>
                    <td className="py-2 pr-4">Structural timber / framing</td>
                    <td className="py-2 pr-4">12–19%</td>
                    <td className="py-2">Species-specific; hardwood closer to 12%, softwood up to 19%</td>
                  </tr>
                  <tr className={`border-b ${darkMode ? "border-[#5A6A7B]/20" : "border-[#5A6A7B]/10"}`}>
                    <td className="py-2 pr-4">Hardwood timber flooring</td>
                    <td className="py-2 pr-4">10–14%</td>
                    <td className="py-2">Tighter range due to cupping/gapping risk; compare to unaffected reference board</td>
                  </tr>
                  <tr className={`border-b ${darkMode ? "border-[#5A6A7B]/20" : "border-[#5A6A7B]/10"}`}>
                    <td className="py-2 pr-4">Engineered timber flooring</td>
                    <td className="py-2 pr-4">10–15%</td>
                    <td className="py-2">Manufacturer specification may override; document manufacturer target if used</td>
                  </tr>
                  <tr className={`border-b ${darkMode ? "border-[#5A6A7B]/20" : "border-[#5A6A7B]/10"}`}>
                    <td className="py-2 pr-4">Gypsum wallboard (plasterboard)</td>
                    <td className="py-2 pr-4">0.2–0.5%</td>
                    <td className="py-2">Measured with calibrated gypsum mode on pin meter; readings above 0.5% indicate residual moisture</td>
                  </tr>
                  <tr className={`border-b ${darkMode ? "border-[#5A6A7B]/20" : "border-[#5A6A7B]/10"}`}>
                    <td className="py-2 pr-4">Concrete slab (residential)</td>
                    <td className="py-2 pr-4">&lt;3.0–4.0%</td>
                    <td className="py-2">Measured with concrete-specific calibrated meter; depth matters — surface readings can mislead</td>
                  </tr>
                  <tr className={`border-b ${darkMode ? "border-[#5A6A7B]/20" : "border-[#5A6A7B]/10"}`}>
                    <td className="py-2 pr-4">Fibre cement sheet</td>
                    <td className="py-2 pr-4">10–16%</td>
                    <td className="py-2">Compare to dry reference sample from unaffected area of same product</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Particle board / MDF subfloor</td>
                    <td className="py-2 pr-4">8–12%</td>
                    <td className="py-2">High moisture absorption risk; assess for delamination before drying commences</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className={`leading-relaxed mb-6 ${body}`}>
              A practical compliance approach is to take a dry reference reading from an unaffected area of the same material type at the start of every job. This establishes the site-specific baseline EMC and provides a defensible drying target that accounts for local conditions — particularly relevant in high-humidity coastal areas of Queensland, New South Wales, and Western Australia.
            </p>

            {/* 3.4 Moisture meter calibration */}
            <h3
              className={`text-xl font-semibold mt-8 mb-3 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              3.4 Moisture Meter Calibration Documentation
            </h3>
            <p className={`leading-relaxed mb-4 ${body}`}>
              S500:2025 is explicit: moisture measurement instruments must be calibrated, and the calibration must be documented in the report. The following information must be recorded for each instrument used on a job:
            </p>
            <ul className={`list-disc pl-6 mb-4 space-y-2 ${body}`}>
              <li><strong className={heading}>Instrument serial number</strong> — Not just make and model. The serial number links the reading to a specific instrument with a traceable calibration record.</li>
              <li><strong className={heading}>Calibration date</strong> — The date of the most recent calibration service. Most NATA-accredited calibration labs recommend annual calibration for moisture meters used in professional restoration.</li>
              <li><strong className={heading}>Calibration certificate reference</strong> — The certificate number or issuing laboratory name, so the record can be produced if audited.</li>
              <li><strong className={heading}>In-field check log</strong> — S500:2025 also requires documentation of the in-field verification check performed at the start of each day&apos;s readings. This is typically a zero-pin check or a certified calibration check block reading.</li>
            </ul>
            <p className={`leading-relaxed mb-6 ${body}`}>
              Calibration is one of the most commonly challenged items in insurance claim audits. Assessors who doubt reading accuracy will request calibration records before approving drying costs. Having them pre-loaded into every report eliminates this friction point entirely.
            </p>

            {/* 3.5 Equipment audit trail */}
            <h3
              className={`text-xl font-semibold mt-8 mb-3 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              3.5 Equipment Deployment Audit Trail
            </h3>
            <p className={`leading-relaxed mb-4 ${body}`}>
              Every dehumidifier and air mover on site must be documented with an audit trail that supports the equipment line items on your invoice. Under S500:2025, this requires:
            </p>
            <ul className={`list-disc pl-6 mb-4 space-y-2 ${body}`}>
              <li><strong className={heading}>Serial number:</strong> Unique identifier tying the equipment to a specific asset, calibration record, and daily rate.</li>
              <li><strong className={heading}>Make and model:</strong> Required for rate verification against NRPG schedules.</li>
              <li><strong className={heading}>Rated capacity:</strong> Litres per day (L/day) for dehumidifiers at AHAM conditions; CFM for air movers. Must match the equipment specification sheet.</li>
              <li><strong className={heading}>Room/zone assignment:</strong> Where the unit was physically placed. Cross-referenced with the floor plan in the report.</li>
              <li><strong className={heading}>Deployment date and removal date:</strong> The period for which the daily rate is charged.</li>
              <li><strong className={heading}>Hours operated per day:</strong> For equipment operating on timed cycles, the actual run-time record supports the energy and equipment charges.</li>
            </ul>
            <div className={`rounded-lg border p-5 mb-6 ${cardBg}`}>
              <p className={`text-sm font-semibold mb-2 ${heading}`} style={{ fontFamily: sansHeading }}>
                Compliance Checklist: Equipment Audit Trail
              </p>
              <ul className={`text-sm space-y-1 ${body}`}>
                <li className="flex items-start gap-2"><span className="text-[#8A6B4E] mt-0.5">&#x2713;</span><span>Serial number recorded for every dehumidifier and air mover</span></li>
                <li className="flex items-start gap-2"><span className="text-[#8A6B4E] mt-0.5">&#x2713;</span><span>Make, model, and rated capacity (L/day or CFM) documented</span></li>
                <li className="flex items-start gap-2"><span className="text-[#8A6B4E] mt-0.5">&#x2713;</span><span>Room/zone assignment logged with reference to floor plan</span></li>
                <li className="flex items-start gap-2"><span className="text-[#8A6B4E] mt-0.5">&#x2713;</span><span>Deployment date and removal date recorded</span></li>
                <li className="flex items-start gap-2"><span className="text-[#8A6B4E] mt-0.5">&#x2713;</span><span>Hours operated per day recorded where applicable</span></li>
                <li className="flex items-start gap-2"><span className="text-[#8A6B4E] mt-0.5">&#x2713;</span><span>Equipment totals reconcile with invoice line items</span></li>
              </ul>
            </div>

            {/* 3.6 Drying validation */}
            <h3
              className={`text-xl font-semibold mt-8 mb-3 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              3.6 Drying Validation: Proving Progress with VP Differentials
            </h3>
            <p className={`leading-relaxed mb-4 ${body}`}>
              S500:2025 requires that drying progress be validated — not just asserted. The standard&apos;s preferred validation methodology is the vapor pressure differential (VPD) trend analysis. This works as follows:
            </p>
            <ol className={`list-decimal pl-6 mb-4 space-y-2 ${body}`}>
              <li>At each visit, record the vapor pressure (Pa) inside the affected area and at an external reference point (outside the building or in an unaffected area).</li>
              <li>Calculate the VP differential: Internal VP minus External VP.</li>
              <li>Plot the differential across consecutive visit days.</li>
              <li>A downward trend demonstrates that the internal moisture load is decreasing — the structure is drying.</li>
              <li>If the differential increases or plateaus, a professional assessment of under-equipment or an unresolved moisture source is required before drying continues.</li>
            </ol>
            <p className={`leading-relaxed mb-6 ${body}`}>
              This is the data that insurance assessors use to verify that the claimed drying duration was necessary and appropriate. A flat trend on day four of a six-day drying claim will trigger a query. A clear downward trend that reaches target conditions on day six justifies the full claim. The VP differential chart is, in effect, the most important document in your report.
            </p>

            {/* ── Section 4: How adjusters use S500 ── */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              4. How Insurance Adjusters Use S500:2025
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              Loss adjusters reviewing water damage claims now use S500:2025 as a structured checklist against which they assess the technical and documentation quality of restoration reports. Understanding what they are looking for — and in what order — gives contractors a significant advantage in getting claims approved without delay.
            </p>

            <h3
              className={`text-xl font-semibold mt-8 mb-3 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              What Adjusters Check First
            </h3>
            <ul className={`list-disc pl-6 mb-6 space-y-2 ${body}`}>
              <li>
                <strong className={heading}>Category and Class documentation:</strong> Is the contamination category correctly classified and supported by observations? Is the Class consistent with the scope of works and equipment deployed?
              </li>
              <li>
                <strong className={heading}>Psychrometric data completeness:</strong> Are temperature, RH, VP, GPP, and dew point recorded at every visit and every location? Is there an external reference reading to establish the VP differential?
              </li>
              <li>
                <strong className={heading}>Equipment audit trail:</strong> Does every equipment line item on the invoice have a corresponding serial number, deployment date, and room assignment in the report?
              </li>
              <li>
                <strong className={heading}>Calibration records:</strong> Is there a calibration certificate reference for each moisture meter used? When was it last calibrated?
              </li>
              <li>
                <strong className={heading}>Drying validation:</strong> Is there a VP differential trend showing progressive drying? Do the final readings confirm EMC targets have been reached?
              </li>
            </ul>

            <h3
              className={`text-xl font-semibold mt-8 mb-3 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Common Reasons S500:2025 Reports Are Rejected
            </h3>
            <ul className={`list-disc pl-6 mb-6 space-y-2 ${body}`}>
              <li>Missing or undated calibration records for moisture meters</li>
              <li>Psychrometric data recorded only at initial and final visits — not daily</li>
              <li>Equipment serial numbers absent or listed as &quot;TBA&quot;</li>
              <li>No external VP reference reading — VP differential cannot be calculated</li>
              <li>EMC target not stated or not material-specific</li>
              <li>Drying duration not supported by VP differential trend data</li>
              <li>Category 3 works proceeding without documented containment and PPE notation</li>
              <li>Scope of works inconsistent with Class classification (e.g., Class 1 scope billed at Class 3 equipment levels)</li>
            </ul>

            {/* ── Section 5: Digital compliance tools ── */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              5. Digital Compliance Tools: How RestoreAssist Automates S500:2025 Documentation
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              Meeting the documentation requirements of S500:2025 manually is genuinely difficult. Recording psychrometric data at every reading, maintaining equipment audit trails with serial numbers, and building VP differential trend charts from spreadsheet data takes hours per job. The practical reality is that under time pressure, these requirements get abbreviated — and abbreviated documentation is what triggers adjuster queries, delayed payments, and claim disputes.
            </p>
            <p className={`leading-relaxed mb-4 ${body}`}>
              RestoreAssist was built specifically to eliminate this documentation burden by capturing S500:2025-required data at the point of measurement and generating compliant reports automatically. Here is how the platform maps to each key requirement:
            </p>

            <h3
              className={`text-xl font-semibold mt-8 mb-3 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Psychrometric Data Capture
            </h3>
            <p className={`leading-relaxed mb-4 ${body}`}>
              RestoreAssist&apos;s moisture reading form captures temperature, % RH, vapor pressure (Pa), grains per pound (GPP), dew point, and EMC at each data point. The platform automatically calculates derived values — you enter temperature and RH, and VP, GPP, and dew point are computed. External reference readings are stored separately and VP differentials are calculated and charted automatically across visit days. No spreadsheet required.
            </p>

            <h3
              className={`text-xl font-semibold mt-8 mb-3 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Equipment Audit Trail
            </h3>
            <p className={`leading-relaxed mb-4 ${body}`}>
              The equipment register captures make, model, serial number, rated capacity, room assignment, deployment date, and daily run hours for every dehumidifier and air mover. When the report is generated, the equipment log is automatically formatted to meet S500:2025 requirements and reconciled against the invoice. Equipment with calibration expiry dates can be flagged — the platform will alert technicians if an instrument is overdue for calibration before a job commences.
            </p>

            <h3
              className={`text-xl font-semibold mt-8 mb-3 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Calibration Certificate Management
            </h3>
            <p className={`leading-relaxed mb-4 ${body}`}>
              Calibration certificates for moisture meters and psychrometers are stored in RestoreAssist&apos;s equipment profile for each instrument. The certificate serial number, issuing laboratory, and calibration date are automatically included in every report that uses the instrument — eliminating the manual step of attaching calibration records and ensuring they are never missing from a report submitted to an insurer.
            </p>

            <h3
              className={`text-xl font-semibold mt-8 mb-3 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              VP Differential Trend Chart
            </h3>
            <p className={`leading-relaxed mb-4 ${body}`}>
              The platform generates a vapor pressure differential trend chart automatically from the daily psychrometric readings. This chart — showing the internal-to-external VP differential trending downward across the drying period — is included in every report and is the primary drying validation document that insurance adjusters review. It is produced from the readings you already capture; no additional data entry is required.
            </p>

            <h3
              className={`text-xl font-semibold mt-8 mb-3 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Category, Class, and Scope Documentation
            </h3>
            <p className={`leading-relaxed mb-4 ${body}`}>
              RestoreAssist&apos;s inspection module guides technicians through S500:2025-structured assessment — Category and Class classification with supporting rationale, room-by-room scope of works, photographic evidence linked to specific readings and locations, and affected material documentation. Reports are formatted to mirror the S500 structure that adjusters expect, reducing review time and approval friction.
            </p>

            {/* ── Section 6: FAQ ── */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              6. Frequently Asked Questions
            </h2>
            <div className="space-y-3 mb-10">
              {faqs.map((faq, i) => (
                <FAQItem
                  key={i}
                  question={faq.question}
                  answer={faq.answer}
                  darkMode={darkMode}
                  sansHeading={sansHeading}
                  sansBody={sansBody}
                />
              ))}
            </div>

            {/* CTA Section */}
            <div className={`rounded-xl border p-8 mt-12 ${cardBg}`}>
              <h2
                className={`text-2xl font-bold mb-3 ${heading}`}
                style={{ fontFamily: sansHeading }}
              >
                Generate S500:2025-Compliant Reports Automatically
              </h2>
              <p className={`leading-relaxed mb-6 ${body}`}>
                RestoreAssist captures every S500:2025 data requirement at the point of measurement — psychrometric readings, equipment audit trails, calibration records, and VP differential validation — and generates complete, insurance-ready reports without manual formatting. Start your free trial and produce your first compliant report from your next job.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link
                  href="/signup"
                  className="inline-block px-8 py-3 bg-[#8A6B4E] text-white font-semibold rounded-lg hover:bg-[#8A6B4E]/90 transition-colors"
                  style={{ fontFamily: sansBody }}
                >
                  Start Free Trial
                </Link>
                <Link
                  href="/features"
                  className="inline-block px-8 py-3 border border-[#8A6B4E] text-[#8A6B4E] font-semibold rounded-lg hover:bg-[#8A6B4E]/10 transition-colors"
                  style={{ fontFamily: sansBody }}
                >
                  Explore Features
                </Link>
              </div>
            </div>
          </div>
        </div>
      </article>

      <Footer darkMode={darkMode} />
    </div>
  )
}
