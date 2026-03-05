"use client"

import { useState } from "react"
import Link from "next/link"
import Header from "@/components/landing/Header"
import Footer from "@/components/landing/Footer"

export default function ArticleClient() {
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
              <li className={body}>Pricing</li>
            </ol>
          </nav>

          {/* Article Header */}
          <header className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <span
                className="text-xs px-3 py-1 rounded-full bg-[#8A6B4E]/20 text-[#8A6B4E]"
                style={{ fontFamily: sansBody }}
              >
                Pricing
              </span>
              <span className={`text-xs ${body}`} style={{ fontFamily: sansBody }}>
                9 min read
              </span>
              <span className={`text-xs ${body}`} style={{ fontFamily: sansBody }}>
                March 1, 2025
              </span>
            </div>
            <h1
              className={`text-4xl md:text-5xl font-bold leading-tight ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Water Damage Restoration Costs in Australia: 2025 Price Guide
            </h1>
          </header>

          {/* Article Body */}
          <div
            className={`prose prose-lg max-w-none ${darkMode ? "prose-invert" : ""}`}
            style={{ fontFamily: sansBody }}
          >
            <p className={`text-lg leading-relaxed mb-6 ${body}`}>
              Water damage is one of the most common property insurance claims in
              Australia. Whether caused by a burst pipe, storm flooding, or appliance
              failure, the cost of professional restoration varies significantly based
              on the category of water, the area affected, and the materials involved.
              This guide breaks down typical costs so you can set realistic
              expectations and make informed decisions.
            </p>

            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Understanding Water Damage Categories
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              The IICRC S500 standard classifies water damage into three categories
              based on the contamination level of the water source. The category
              directly affects the complexity and cost of restoration.
            </p>

            <div className={`overflow-x-auto mb-8 rounded-lg border ${cellBorder}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={`${cellBg} border-b ${cellBorder}`}>
                    <th className={`text-left p-4 font-bold ${heading}`}>Category</th>
                    <th className={`text-left p-4 font-bold ${heading}`}>Source</th>
                    <th className={`text-left p-4 font-bold ${heading}`}>Typical Cost Range</th>
                  </tr>
                </thead>
                <tbody className={body}>
                  <tr className={`border-b ${cellBorder}`}>
                    <td className="p-4 font-semibold">Category 1 (Clean Water)</td>
                    <td className="p-4">Burst pipe, supply line, rainwater</td>
                    <td className="p-4">$2,000 &ndash; $8,000</td>
                  </tr>
                  <tr className={`border-b ${cellBorder}`}>
                    <td className="p-4 font-semibold">Category 2 (Grey Water)</td>
                    <td className="p-4">Washing machine overflow, dishwasher</td>
                    <td className="p-4">$4,000 &ndash; $15,000</td>
                  </tr>
                  <tr>
                    <td className="p-4 font-semibold">Category 3 (Black Water)</td>
                    <td className="p-4">Sewage backup, flood water, toilet overflow</td>
                    <td className="p-4">$8,000 &ndash; $30,000+</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className={`leading-relaxed mb-4 ${body}`}>
              These ranges represent typical residential projects. Commercial
              properties, multi-storey buildings, and heritage-listed structures can
              incur substantially higher costs.
            </p>

            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Key Factors Affecting Restoration Costs
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              No two water damage events are identical. The final cost depends on
              several variables:
            </p>
            <ul className={`list-disc pl-6 mb-6 space-y-2 ${body}`}>
              <li>
                <strong className={heading}>Affected area size</strong> &mdash; Larger
                affected areas require more drying equipment, extraction work, and
                dehumidification capacity. Costs scale roughly proportionally with
                square meterage.
              </li>
              <li>
                <strong className={heading}>Materials affected</strong> &mdash; Carpet
                and underlay are relatively inexpensive to dry or replace. Hardwood
                flooring, plasterboard walls, and structural timber require more
                specialised treatment and longer drying times.
              </li>
              <li>
                <strong className={heading}>Contamination level</strong> &mdash; Category
                2 and 3 water events require antimicrobial treatment,
                decontamination, and potentially the removal and disposal of porous
                materials. This adds significant cost.
              </li>
              <li>
                <strong className={heading}>Response time</strong> &mdash; The longer
                water sits, the more damage it causes. Delayed response often
                escalates a Category 1 event to Category 2 or 3 as microbial growth
                begins, increasing costs substantially.
              </li>
              <li>
                <strong className={heading}>Access and location</strong> &mdash; Properties
                in remote or regional areas may incur travel and logistics surcharges.
                Multi-level buildings or properties with limited access can also
                increase labour costs.
              </li>
              <li>
                <strong className={heading}>Equipment requirements</strong> &mdash; The
                number and type of air movers, dehumidifiers, and specialty equipment
                (such as injectidry systems for wall cavities) directly affects daily
                running costs.
              </li>
            </ul>

            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              NRPG Rate Boundaries
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              The National Restoration Pricing Guide (NRPG) provides standardised
              rate boundaries for restoration work in Australia. These rates are
              developed in consultation with insurers and the restoration industry to
              ensure fair and consistent pricing.
            </p>
            <p className={`leading-relaxed mb-4 ${body}`}>
              NRPG rate boundaries cover labour rates, equipment hire charges,
              materials, and consumables. Contractors who price within NRPG
              boundaries are more likely to have their invoices approved by insurers
              without dispute. Rates outside these boundaries &mdash; whether
              significantly above or below &mdash; can trigger queries from loss
              adjusters.
            </p>
            <p className={`leading-relaxed mb-4 ${body}`}>
              When comparing quotes, check whether the contractor&apos;s rates align
              with current NRPG boundaries. This is one of the most reliable
              indicators that you are being quoted a fair price.
            </p>

            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              The Insurance Claim Process
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              For insured water damage events, the typical process follows these
              steps:
            </p>
            <ol className={`list-decimal pl-6 mb-6 space-y-2 ${body}`}>
              <li>
                <strong className={heading}>Emergency mitigation</strong> &mdash; Stop the
                water source and begin extraction immediately to limit further damage.
              </li>
              <li>
                <strong className={heading}>Lodge your claim</strong> &mdash; Contact your
                insurer as soon as possible. Most policies require notification within
                a specified timeframe.
              </li>
              <li>
                <strong className={heading}>Assessment and scoping</strong> &mdash; A
                qualified restoration contractor will assess the damage, classify the
                water category, and produce a detailed scope of works with NRPG-aligned
                pricing.
              </li>
              <li>
                <strong className={heading}>Insurer approval</strong> &mdash; Your insurer
                or their appointed loss adjuster reviews the scope and approves the
                work. NRPG-compliant scopes are typically approved faster.
              </li>
              <li>
                <strong className={heading}>Restoration</strong> &mdash; The contractor
                performs extraction, drying, decontamination, and any required
                demolition or rebuild work, documenting progress throughout.
              </li>
              <li>
                <strong className={heading}>Sign-off and payment</strong> &mdash; Final
                moisture readings confirm the property is dry. The contractor submits
                their invoice, and your insurer processes payment (less any applicable
                excess).
              </li>
            </ol>

            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Why You Should Get Multiple Quotes
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              Even in emergency situations, obtaining at least two to three quotes is
              worthwhile. Multiple quotes help you:
            </p>
            <ul className={`list-disc pl-6 mb-6 space-y-2 ${body}`}>
              <li>Verify that the proposed scope of works is appropriate and complete</li>
              <li>Identify pricing that falls outside NRPG rate boundaries</li>
              <li>Compare contractor credentials, response times, and communication quality</li>
              <li>Strengthen your position with your insurer by demonstrating due diligence</li>
            </ul>
            <p className={`leading-relaxed mb-4 ${body}`}>
              Be wary of quotes that are dramatically lower than others &mdash; this
              often indicates that critical steps such as antimicrobial treatment,
              proper drying verification, or documentation have been omitted.
            </p>

            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Get an Instant Estimate with RestoreAssist
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              RestoreAssist&apos;s contractor quote tool uses current NRPG rate boundaries
              to generate accurate restoration cost estimates. Enter your project
              details to receive an instant quote that aligns with insurer
              expectations, then connect with verified contractors in your area.
            </p>
            <div className="mt-8 mb-4">
              <Link
                href="/tools/quote"
                className="inline-block px-8 py-3 bg-[#8A6B4E] text-white font-semibold rounded-lg hover:bg-[#8A6B4E]/90 transition-colors"
                style={{ fontFamily: sansBody }}
              >
                Try the Quote Tool
              </Link>
            </div>
          </div>
        </div>
      </article>

      <Footer darkMode={darkMode} />
    </div>
  )
}
