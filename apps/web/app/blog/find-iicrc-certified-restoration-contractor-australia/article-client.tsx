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
              <li className={body}>IICRC Certification</li>
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
                8 min read
              </span>
              <span className={`text-xs ${body}`} style={{ fontFamily: sansBody }}>
                March 1, 2025
              </span>
            </div>
            <h1
              className={`text-4xl md:text-5xl font-bold leading-tight ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              How to Find an IICRC-Certified Restoration Contractor in Australia
              (2025 Guide)
            </h1>
          </header>

          {/* Article Body */}
          <div
            className={`prose prose-lg max-w-none ${darkMode ? "prose-invert" : ""}`}
            style={{ fontFamily: sansBody }}
          >
            <p className={`text-lg leading-relaxed mb-6 ${body}`}>
              When water damage, fire damage, or mould strikes your property, choosing
              the right restoration contractor is one of the most consequential
              decisions you will make. In Australia, IICRC certification is the
              industry gold standard that separates qualified professionals from
              unverified operators. This guide explains what the certification means,
              how to verify it, and what to look out for before signing a scope of
              works.
            </p>

            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              What Is IICRC Certification?
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              The Institute of Inspection, Cleaning and Restoration Certification
              (IICRC) is a globally recognised body that sets the standards for the
              restoration industry. Founded in the United States in 1972, the IICRC
              develops reference standards such as the S500 (water damage), S520
              (mould remediation), and S540 (trauma and crime scene cleanup) that
              define best-practice procedures for every stage of a restoration project.
            </p>
            <p className={`leading-relaxed mb-4 ${body}`}>
              In Australia, IICRC certification signals that a contractor has
              completed accredited training, passed rigorous examinations, and commits
              to ongoing professional development. Certified firms must employ at least
              one IICRC-certified technician and adhere to the organisation&apos;s code of
              ethics.
            </p>

            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Why IICRC Certification Matters for Insurance Claims
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              Australian insurers increasingly require or strongly prefer IICRC-certified
              contractors when processing property damage claims. There are several
              reasons for this:
            </p>
            <ul className={`list-disc pl-6 mb-6 space-y-2 ${body}`}>
              <li>
                <strong className={heading}>Standardised procedures</strong> &mdash; IICRC
                standards provide a documented framework that insurers can audit. This
                reduces disputes about scope of works and methodology.
              </li>
              <li>
                <strong className={heading}>Defensible documentation</strong> &mdash;
                Certified contractors are trained to produce moisture mapping reports,
                drying logs, and photographic evidence that satisfy insurer
                requirements.
              </li>
              <li>
                <strong className={heading}>Reduced re-work</strong> &mdash; Projects
                completed to IICRC standards are far less likely to result in secondary
                damage or mould issues, lowering the overall claim cost.
              </li>
              <li>
                <strong className={heading}>Liability protection</strong> &mdash; Using a
                certified contractor demonstrates due diligence, which can protect both
                the property owner and the insurer in the event of a dispute.
              </li>
            </ul>

            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              How to Verify a Contractor&apos;s IICRC Credentials
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              Verifying certification is straightforward. Follow these steps:
            </p>
            <ol className={`list-decimal pl-6 mb-6 space-y-2 ${body}`}>
              <li>
                <strong className={heading}>Check the IICRC online registry</strong> &mdash;
                Visit the IICRC website and use their &ldquo;Find a Certified
                Professional&rdquo; search tool. Enter the contractor&apos;s name or company to
                confirm active certification status.
              </li>
              <li>
                <strong className={heading}>Ask for certificate numbers</strong> &mdash;
                Legitimate contractors will readily provide their individual technician
                certification numbers and firm registration details.
              </li>
              <li>
                <strong className={heading}>Confirm specific certifications</strong> &mdash;
                IICRC offers multiple specialisations. Ensure the contractor holds the
                relevant certification for your situation: WRT (Water Restoration
                Technician), FSRT (Fire and Smoke Restoration Technician), or AMRT
                (Applied Microbial Remediation Technician).
              </li>
              <li>
                <strong className={heading}>Verify currency</strong> &mdash; IICRC
                certifications must be renewed regularly through continuing education.
                Confirm the certification has not expired.
              </li>
            </ol>

            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Questions to Ask Before Hiring
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              Beyond certification, ask these questions to assess a restoration
              contractor&apos;s suitability:
            </p>
            <ul className={`list-disc pl-6 mb-6 space-y-2 ${body}`}>
              <li>Which IICRC certifications do your on-site technicians hold?</li>
              <li>Can you provide your IICRC firm registration number?</li>
              <li>Do you carry professional indemnity and public liability insurance?</li>
              <li>What is your typical response time for emergency call-outs?</li>
              <li>Can you provide references from recent projects of similar scope?</li>
              <li>Are your rates aligned with NRPG rate boundaries?</li>
              <li>What documentation and reporting do you provide during and after the project?</li>
            </ul>

            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Red Flags to Watch For
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              Be cautious of contractors who exhibit any of the following warning
              signs:
            </p>
            <ul className={`list-disc pl-6 mb-6 space-y-2 ${body}`}>
              <li>
                <strong className={heading}>Reluctance to share credentials</strong> &mdash;
                Any legitimate contractor will be proud to share their IICRC
                certification details. Evasiveness is a major red flag.
              </li>
              <li>
                <strong className={heading}>No written scope of works</strong> &mdash; A
                professional contractor will provide a detailed written scope before
                commencing work, including methodology, timeline, and pricing.
              </li>
              <li>
                <strong className={heading}>Pressure to start immediately</strong> &mdash;
                While emergency mitigation needs to begin quickly, a reputable
                contractor will still take time to assess, document, and explain the
                process.
              </li>
              <li>
                <strong className={heading}>Significantly below-market pricing</strong>{" "}
                &mdash; Rates well below NRPG boundaries often indicate corners being
                cut on equipment, drying protocols, or documentation.
              </li>
              <li>
                <strong className={heading}>No moisture monitoring records</strong> &mdash;
                IICRC standards require daily moisture readings and drying logs.
                Contractors who skip this step are not following best practice.
              </li>
            </ul>

            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Find Verified Contractors with RestoreAssist
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              RestoreAssist maintains a directory of IICRC-certified restoration
              contractors across Australia. Every contractor in our network has been
              verified for active IICRC certification, appropriate insurance coverage,
              and NRPG compliance. Our platform makes it easy to compare contractors,
              request quotes, and manage the entire restoration process from
              assessment through to completion.
            </p>
            <div className="mt-8 mb-4">
              <Link
                href="/contractors"
                className="inline-block px-8 py-3 bg-[#8A6B4E] text-white font-semibold rounded-lg hover:bg-[#8A6B4E]/90 transition-colors"
                style={{ fontFamily: sansBody }}
              >
                Browse Verified Contractors
              </Link>
            </div>
          </div>
        </div>
      </article>

      <Footer darkMode={darkMode} />
    </div>
  )
}
