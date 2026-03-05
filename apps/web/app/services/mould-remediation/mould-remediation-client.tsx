"use client"

import { useState } from "react"
import Link from "next/link"
import Header from "@/components/landing/Header"
import Footer from "@/components/landing/Footer"

export default function MouldRemediationClient() {
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
      q: "What is the IICRC S520 standard?",
      a: "The IICRC S520 is the Standard and Reference Guide for Professional Mould Remediation. It provides a framework for the assessment, containment, removal, and post-remediation verification of mould contamination in buildings.",
    },
    {
      q: "What is an AMRT certification?",
      a: "AMRT stands for Applied Microbial Remediation Technician. It is an IICRC certification that qualifies professionals to perform mould remediation in accordance with the S520 standard. AMRT-certified technicians understand contamination assessment, containment design, removal procedures, and clearance protocols.",
    },
    {
      q: "Is mould dangerous to health?",
      a: "Yes. Mould exposure can cause respiratory issues, allergic reactions, skin irritation, and in severe cases, chronic health conditions. Certain species such as Stachybotrys chartarum (black mould) produce mycotoxins that pose serious health risks. The S520 standard emphasises protecting both occupants and remediation workers.",
    },
    {
      q: "How do I know if I need professional mould remediation?",
      a: "Professional remediation is recommended when visible mould covers more than 1 square metre, when mould is present inside wall cavities or HVAC systems, when occupants are experiencing health symptoms, or when the property has experienced prolonged water damage. An AMRT-certified assessor can determine the scope of contamination.",
    },
    {
      q: "What PPE is required during mould remediation?",
      a: "At minimum, workers require an N95 or P2 respirator, disposable coveralls, gloves, and eye protection. For large-scale or Category 3 contamination (as defined by S520), a full-face powered air-purifying respirator (PAPR) and additional protective measures are required.",
    },
    {
      q: "What is clearance testing?",
      a: "Clearance testing is the post-remediation verification process where an independent assessor confirms that mould levels have been reduced to acceptable levels. This typically involves visual inspection and air or surface sampling. Clearance must be performed by a party independent of the remediation contractor.",
    },
    {
      q: "How does RestoreAssist help with mould remediation documentation?",
      a: "RestoreAssist provides S520-aligned inspection workflows, containment documentation templates, photo-documented remediation progress tracking, and clearance test result logging — giving contractors a complete digital record for insurer and client reporting.",
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
              <li className={body}>Mould Remediation</li>
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
              Mould Remediation — IICRC S520 Standard
            </h1>
            <p
              className={`text-xl mt-6 leading-relaxed ${body}`}
              style={{ fontFamily: sansBody }}
            >
              Professional mould assessment and remediation following the IICRC S520
              standard. Protecting health, ensuring compliance, and restoring safe
              indoor environments across Australia.
            </p>
          </header>

          {/* Article Body */}
          <div
            className={`prose prose-lg max-w-none ${darkMode ? "prose-invert" : ""}`}
            style={{ fontFamily: sansBody }}
          >
            {/* Health Risks */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Health Risks of Mould Exposure
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              Mould is more than a cosmetic issue. When mould colonies grow indoors,
              they release spores and volatile organic compounds (VOCs) into the air
              that can cause a range of health problems, particularly for vulnerable
              occupants.
            </p>
            <ul className={`list-disc pl-6 mb-6 space-y-2 ${body}`}>
              <li>
                <strong className={heading}>Respiratory problems</strong> — Coughing,
                wheezing, shortness of breath, and exacerbation of asthma. Australia has
                one of the highest asthma prevalence rates globally, making indoor mould
                a significant public health concern.
              </li>
              <li>
                <strong className={heading}>Allergic reactions</strong> — Sneezing, runny
                nose, red eyes, and dermatitis. Sensitised individuals can react to even
                low spore counts.
              </li>
              <li>
                <strong className={heading}>Mycotoxin exposure</strong> — Certain mould
                species produce mycotoxins that can cause neurological symptoms, immune
                suppression, and chronic inflammatory response syndrome (CIRS).
              </li>
              <li>
                <strong className={heading}>Infection risk</strong> — Immunocompromised
                individuals are at risk of opportunistic fungal infections from species
                such as Aspergillus.
              </li>
            </ul>

            {/* S520 Protocol */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              The S520 Remediation Protocol
            </h2>
            <p className={`leading-relaxed mb-6 ${body}`}>
              The IICRC S520 standard outlines a systematic approach to mould
              remediation that prioritises safety, effectiveness, and verification.
            </p>

            <div className="grid sm:grid-cols-2 gap-4 mb-8">
              {[
                {
                  step: "1",
                  title: "Assessment & Sampling",
                  desc: "Identify the extent of mould contamination through visual inspection, moisture mapping, and where necessary, air or surface sampling. Determine the contamination condition (1, 2, or 3) as defined by S520.",
                },
                {
                  step: "2",
                  title: "Containment Setup",
                  desc: "Establish appropriate containment barriers using polyethylene sheeting and negative air pressure to prevent cross-contamination to unaffected areas during remediation.",
                },
                {
                  step: "3",
                  title: "Removal & Cleaning",
                  desc: "Remove mould-affected porous materials that cannot be cleaned. HEPA vacuum and damp-wipe non-porous surfaces. Apply antimicrobial treatments as specified by S520.",
                },
                {
                  step: "4",
                  title: "Clearance & Verification",
                  desc: "An independent assessor performs post-remediation verification including visual inspection and air or surface sampling to confirm mould levels meet acceptable clearance criteria.",
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

            {/* AMRT Certification */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              AMRT Certification — IICRC Applied Microbial Remediation Technician
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              The AMRT certification is the IICRC&apos;s specialist credential for mould
              remediation professionals. AMRT-certified technicians are trained in:
            </p>
            <ul className={`list-disc pl-6 mb-6 space-y-2 ${body}`}>
              <li>Microbial contamination assessment and classification</li>
              <li>Containment design and engineering controls</li>
              <li>Safe removal and disposal procedures for contaminated materials</li>
              <li>Antimicrobial treatment selection and application</li>
              <li>Post-remediation verification procedures</li>
              <li>Worker health and safety protocols specific to mould remediation</li>
            </ul>
            <p className={`leading-relaxed mb-4 ${body}`}>
              In Australia, AMRT certification is delivered through IICRC-approved
              training providers. The certification requires passing a proctored
              examination and maintaining Continuing Education Credits (CECs) for renewal.
            </p>

            {/* Containment & PPE */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Containment and PPE Requirements
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              Proper containment and personal protective equipment are non-negotiable in
              professional mould remediation. The S520 standard specifies requirements
              based on the contamination condition.
            </p>

            <div className={`overflow-x-auto mb-8 rounded-lg border ${cellBorder}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={`${cellBg} border-b ${cellBorder}`}>
                    <th className={`text-left p-4 font-bold ${heading}`}>Condition</th>
                    <th className={`text-left p-4 font-bold ${heading}`}>Containment</th>
                    <th className={`text-left p-4 font-bold ${heading}`}>Minimum PPE</th>
                  </tr>
                </thead>
                <tbody className={body}>
                  <tr className={`border-b ${cellBorder}`}>
                    <td className="p-4 font-semibold">Condition 1 (Normal)</td>
                    <td className="p-4">Source containment only</td>
                    <td className="p-4">N95/P2 respirator, gloves, eye protection</td>
                  </tr>
                  <tr className={`border-b ${cellBorder}`}>
                    <td className="p-4 font-semibold">Condition 2 (Settled Spores)</td>
                    <td className="p-4">Limited or full containment with negative air</td>
                    <td className="p-4">Half-face respirator with P100 filters, coveralls, gloves, eye protection</td>
                  </tr>
                  <tr>
                    <td className="p-4 font-semibold">Condition 3 (Active Growth)</td>
                    <td className="p-4">Full containment with negative air machine and HEPA filtration</td>
                    <td className="p-4">Full-face PAPR, disposable coveralls, double gloves, boot covers</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Documentation & Clearance */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Documentation and Clearance Testing
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              Thorough documentation is essential for insurance claims, regulatory
              compliance, and occupant confidence. A complete mould remediation record
              should include:
            </p>
            <ul className={`list-disc pl-6 mb-6 space-y-2 ${body}`}>
              <li>Initial assessment report with contamination condition classification</li>
              <li>Moisture source identification and rectification evidence</li>
              <li>Containment design and setup photographs</li>
              <li>Removal and disposal documentation (waste manifests)</li>
              <li>Pre- and post-remediation air sampling results</li>
              <li>Independent clearance certificate confirming successful remediation</li>
            </ul>
            <p className={`leading-relaxed mb-4 ${body}`}>
              Clearance testing must be conducted by a qualified assessor who is
              independent of the remediation contractor. This separation of roles
              is a core requirement of the S520 standard.
            </p>

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
              RestoreAssist provides IICRC S520-aligned workflows for mould
              assessment and remediation documentation. Streamline your compliance,
              protect your team, and deliver professional results.
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
