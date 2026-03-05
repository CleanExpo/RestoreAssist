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
  const cardBg = darkMode
    ? "bg-[#1C2E47]/50 border-[#5A6A7B]/30"
    : "bg-[#F4F5F6]/50 border-[#5A6A7B]/20"

  const certifications = [
    {
      abbr: "WRT",
      name: "Water Restoration Technician",
      standard: "S500",
      desc: "The foundational certification for water damage restoration. Covers water damage principles, psychrometry, drying science, and the S500 standard. Required by most insurers for water damage work.",
    },
    {
      abbr: "ASD",
      name: "Applied Structural Drying",
      standard: "S500",
      desc: "Advanced certification building on WRT knowledge. Covers complex drying scenarios, specialty equipment, drying calculations, and real-world structural drying challenges.",
    },
    {
      abbr: "FSRT",
      name: "Fire and Smoke Restoration Technician",
      standard: "S520",
      desc: "Covers fire damage restoration including smoke behaviour, deodorisation techniques, content cleaning, and the science of combustion by-products.",
    },
    {
      abbr: "AMRT",
      name: "Applied Microbial Remediation Technician",
      standard: "S520",
      desc: "Specialist certification for mould remediation. Covers microbial contamination assessment, containment design, safe removal procedures, and clearance verification protocols.",
    },
    {
      abbr: "OCT",
      name: "Odour Control Technician",
      standard: "S520",
      desc: "Covers the science of odour, deodorisation methods, chemical counteractants, and equipment selection for professional odour removal in restoration settings.",
    },
    {
      abbr: "UFT",
      name: "Upholstery and Fabric Cleaning Technician",
      standard: "S300",
      desc: "Specialist certification for cleaning and restoring upholstered furniture, drapery, and fabric contents affected by water, fire, or mould damage.",
    },
    {
      abbr: "CDS",
      name: "Commercial Drying Specialist",
      standard: "S500",
      desc: "Advanced certification for large-loss and commercial water damage restoration. Covers large-structure drying, project management, and complex psychrometric calculations.",
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
              <li className={body}>Certifications</li>
            </ol>
          </nav>

          {/* Article Header */}
          <header className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <span
                className="text-xs px-3 py-1 rounded-full bg-[#8A6B4E]/20 text-[#8A6B4E]"
                style={{ fontFamily: sansBody }}
              >
                Certifications
              </span>
              <span className={`text-xs ${body}`} style={{ fontFamily: sansBody }}>
                12 min read
              </span>
              <span className={`text-xs ${body}`} style={{ fontFamily: sansBody }}>
                March 5, 2025
              </span>
            </div>
            <h1
              className={`text-4xl md:text-5xl font-bold leading-tight ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              IICRC Certifications for Australian Restoration Contractors — Complete
              Guide 2025
            </h1>
          </header>

          {/* Article Body */}
          <div
            className={`prose prose-lg max-w-none ${darkMode ? "prose-invert" : ""}`}
            style={{ fontFamily: sansBody }}
          >
            <p className={`text-lg leading-relaxed mb-6 ${body}`}>
              IICRC certifications are the gold standard for restoration professionals
              worldwide. In Australia, holding the right IICRC credentials is
              increasingly essential for winning insurance work, meeting compliance
              requirements, and demonstrating professional competence. This guide covers
              every major IICRC certification relevant to Australian restoration
              contractors, how to get certified, what it costs, and how to maintain
              your credentials.
            </p>

            {/* All Certifications */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              IICRC Certifications Overview
            </h2>
            <p className={`leading-relaxed mb-6 ${body}`}>
              The IICRC (Institute of Inspection, Cleaning and Restoration
              Certification) offers a range of technician and specialist certifications.
              The following are the most relevant for Australian restoration contractors.
            </p>

            <div className={`overflow-x-auto mb-8 rounded-lg border ${cellBorder}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={`${cellBg} border-b ${cellBorder}`}>
                    <th className={`text-left p-4 font-bold ${heading}`}>Certification</th>
                    <th className={`text-left p-4 font-bold ${heading}`}>Full Name</th>
                    <th className={`text-left p-4 font-bold ${heading}`}>Related Standard</th>
                  </tr>
                </thead>
                <tbody className={body}>
                  {certifications.map((cert, i) => (
                    <tr
                      key={cert.abbr}
                      className={i < certifications.length - 1 ? `border-b ${cellBorder}` : ""}
                    >
                      <td className="p-4 font-semibold">{cert.abbr}</td>
                      <td className="p-4">{cert.name}</td>
                      <td className="p-4">{cert.standard}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Detailed Certification Sections */}
            {certifications.map((cert) => (
              <div key={cert.abbr} className="mb-8">
                <h3
                  className={`text-xl font-bold mt-8 mb-3 ${heading}`}
                  style={{ fontFamily: sansHeading }}
                >
                  {cert.abbr} — {cert.name}
                </h3>
                <p className={`leading-relaxed mb-2 ${body}`}>{cert.desc}</p>
              </div>
            ))}

            {/* How to Get Certified in Australia */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              How to Get IICRC Certified in Australia
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              IICRC certifications in Australia are delivered through IICRC-approved
              training schools and instructors. The process follows these steps:
            </p>
            <ol className={`list-decimal pl-6 mb-6 space-y-2 ${body}`}>
              <li>
                <strong className={heading}>Find an approved school</strong> — The
                IICRC maintains a directory of approved training providers. In Australia,
                several organisations deliver IICRC-approved courses, including the
                Australasian Restoration Institute (ARI) and other accredited providers.
              </li>
              <li>
                <strong className={heading}>Complete the course</strong> — Courses are
                typically delivered over 2 to 5 days depending on the certification.
                Training combines classroom instruction with practical exercises and
                case studies.
              </li>
              <li>
                <strong className={heading}>Pass the examination</strong> — Each
                certification requires passing a proctored multiple-choice exam.
                The exam tests theoretical knowledge of the relevant IICRC standard
                and practical application.
              </li>
              <li>
                <strong className={heading}>Register with the IICRC</strong> — Once
                you pass the exam, you register your certification with the IICRC.
                Your certification is then searchable on the IICRC global registry.
              </li>
            </ol>

            {/* Costs and Exam Process */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Costs and Exam Process
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              Certification costs vary by training provider and certification level.
              The following are typical ranges for Australian providers:
            </p>

            <div className={`overflow-x-auto mb-8 rounded-lg border ${cellBorder}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={`${cellBg} border-b ${cellBorder}`}>
                    <th className={`text-left p-4 font-bold ${heading}`}>Item</th>
                    <th className={`text-left p-4 font-bold ${heading}`}>Typical Cost (AUD)</th>
                  </tr>
                </thead>
                <tbody className={body}>
                  <tr className={`border-b ${cellBorder}`}>
                    <td className="p-4 font-semibold">WRT course + exam</td>
                    <td className="p-4">$1,200 &ndash; $1,800</td>
                  </tr>
                  <tr className={`border-b ${cellBorder}`}>
                    <td className="p-4 font-semibold">ASD course + exam</td>
                    <td className="p-4">$1,500 &ndash; $2,200</td>
                  </tr>
                  <tr className={`border-b ${cellBorder}`}>
                    <td className="p-4 font-semibold">FSRT course + exam</td>
                    <td className="p-4">$1,200 &ndash; $1,800</td>
                  </tr>
                  <tr className={`border-b ${cellBorder}`}>
                    <td className="p-4 font-semibold">AMRT course + exam</td>
                    <td className="p-4">$1,200 &ndash; $1,800</td>
                  </tr>
                  <tr className={`border-b ${cellBorder}`}>
                    <td className="p-4 font-semibold">IICRC registration fee</td>
                    <td className="p-4">$50 &ndash; $75 per certification</td>
                  </tr>
                  <tr>
                    <td className="p-4 font-semibold">Exam re-sit fee</td>
                    <td className="p-4">$150 &ndash; $250</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className={`leading-relaxed mb-4 ${body}`}>
              The exam format is multiple-choice, typically 100 to 200 questions, with a
              time limit of 2 to 3 hours. A score of 70% or higher is generally required
              to pass. Exams are proctored and can be taken on-site at the training
              provider&apos;s location.
            </p>

            {/* How Certifications Help Win Insurance Work */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              How Certifications Help Win Insurance Work
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              In Australia&apos;s restoration industry, IICRC certifications are
              increasingly a prerequisite for accessing insurance-funded work. Here is
              why they matter:
            </p>
            <ul className={`list-disc pl-6 mb-6 space-y-2 ${body}`}>
              <li>
                <strong className={heading}>Insurer panel requirements</strong> —
                Major Australian insurers and their appointed loss adjusters typically
                require contractors on their panels to hold current WRT certification
                at minimum. Many also require AMRT for mould-related claims.
              </li>
              <li>
                <strong className={heading}>Faster claim approvals</strong> —
                Documentation produced by IICRC-certified contractors following S500 or
                S520 protocols is more likely to be accepted by insurers without
                additional queries or dispute.
              </li>
              <li>
                <strong className={heading}>Professional credibility</strong> —
                Certifications demonstrate a commitment to industry standards that
                differentiates your business from uncertified competitors when quoting
                on jobs.
              </li>
              <li>
                <strong className={heading}>Risk management</strong> — Following IICRC
                standards reduces the likelihood of secondary damage, callbacks, and
                professional liability claims.
              </li>
              <li>
                <strong className={heading}>NRPG eligibility</strong> — National
                Restoration Pricing Guide (NRPG) membership and rate access is closely
                aligned with IICRC certification requirements.
              </li>
            </ul>

            {/* CEC Renewal */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              CEC Renewal Requirements
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              IICRC certifications are valid for a set period and require Continuing
              Education Credits (CECs) for renewal. Key points:
            </p>
            <ul className={`list-disc pl-6 mb-6 space-y-2 ${body}`}>
              <li>
                <strong className={heading}>Renewal cycle</strong> — Most certifications
                require renewal every 3 to 5 years, depending on the specific
                certification.
              </li>
              <li>
                <strong className={heading}>CEC requirements</strong> — Technicians
                must earn a specified number of CECs during each renewal cycle. CECs
                are earned through approved continuing education courses, industry
                conferences, and training events.
              </li>
              <li>
                <strong className={heading}>Tracking CECs</strong> — The IICRC provides
                an online portal for tracking earned CECs against renewal deadlines.
                Contractors should establish a system for monitoring CEC status across
                their entire team.
              </li>
              <li>
                <strong className={heading}>Lapsed certifications</strong> — If a
                certification lapses, the technician may need to re-sit the exam and/or
                complete additional training to reinstate it. Keeping certifications
                current avoids this cost and disruption.
              </li>
            </ul>

            {/* RestoreAssist CTA */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Track Your Team&apos;s Certifications with RestoreAssist
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              RestoreAssist includes built-in CEC and certification tracking for
              restoration teams. Monitor expiry dates, log continuing education
              activities, and ensure your entire team stays compliant — all from one
              dashboard.
            </p>
            <div className="mt-8 mb-4 flex flex-wrap gap-4">
              <Link
                href="/signup"
                className="inline-block px-8 py-3 bg-[#8A6B4E] text-white font-semibold rounded-lg hover:bg-[#8A6B4E]/90 transition-colors"
                style={{ fontFamily: sansBody }}
              >
                Sign Up Free
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
      </article>

      <Footer darkMode={darkMode} />
    </div>
  )
}
