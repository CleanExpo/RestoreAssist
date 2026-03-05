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
  const sansHeading =
    '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  const sansBody =
    '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

  const faqs = [
    {
      question: "What information do insurance assessors look for in a restoration report?",
      answer:
        "Insurance assessors look for S500-compliant language and methodology, psychrometric data and daily moisture readings with mapped locations, detailed equipment logs including dehumidifier and air mover placement, a clear scope of works with room-by-room breakdowns, and timestamped photographic evidence tied to specific readings and observations. Reports that follow IICRC standards and reference the correct procedures are far less likely to be queried or rejected.",
    },
    {
      question: "How do I make my restoration reports IICRC compliant?",
      answer:
        "Start with the right certifications — WRT and ASD are the baseline for water damage reporting. Then ensure your reports follow S500 structure: document initial conditions with moisture readings, record daily psychrometric data, log all equipment with placement details, and provide a clear drying plan with progress tracking. Software like RestoreAssist can automate much of this compliance structure from your field data, so you get compliant output without manual formatting.",
    },
    {
      question: "Can better reports really help me win more jobs?",
      answer:
        "Yes. Insurance companies and loss adjusters maintain preferred contractor lists, and report quality is a major factor in those decisions. Contractors who consistently deliver compliant, professional reports get faster claim approvals, fewer disputes, and more referrals. Over time, this translates directly into preferred contractor status and a larger share of insurance-funded work in your region.",
    },
    {
      question: "How long does it take to create a professional restoration report?",
      answer:
        "With manual methods — spreadsheets, Word documents, and separate photo folders — a thorough restoration report can take 2 to 4 hours per job. With RestoreAssist, field data automatically populates compliant report templates, reducing report generation to minutes. Technicians enter readings and photos on-site, and the system handles formatting, compliance structure, and professional layout automatically.",
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
              <li className={body}>Business Growth</li>
            </ol>
          </nav>

          {/* Article Header */}
          <header className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <span
                className="text-xs px-3 py-1 rounded-full bg-[#8A6B4E]/20 text-[#8A6B4E]"
                style={{ fontFamily: sansBody }}
              >
                Business Growth
              </span>
              <span className={`text-xs ${body}`} style={{ fontFamily: sansBody }}>
                5 min read
              </span>
              <span className={`text-xs ${body}`} style={{ fontFamily: sansBody }}>
                March 5, 2026
              </span>
            </div>
            <h1
              className={`text-4xl md:text-5xl font-bold leading-tight ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Why Restoration Contractors Lose Jobs to Competitors Who Use Better
              Reports
            </h1>
          </header>

          {/* Article Body */}
          <div
            className={`prose prose-lg max-w-none ${darkMode ? "prose-invert" : ""}`}
            style={{ fontFamily: sansBody }}
          >
            {/* Opening hook */}
            <p className={`text-lg leading-relaxed mb-6 ${body}`}>
              Two contractors quote on the same water damage job. Same
              qualifications, same equipment, similar pricing. One gets the work
              and builds a long-term relationship with the insurer. The other
              never hears back. The difference was not skill or price — it was
              the report.
            </p>
            <p className={`leading-relaxed mb-6 ${body}`}>
              In Australia&apos;s restoration industry, the quality of your
              documentation has become the single biggest factor separating
              contractors who win consistent insurance work from those who
              struggle to get off preferred lists. Insurance assessors process
              hundreds of claims. The contractors who make their jobs easier are
              the ones who keep getting called back.
            </p>

            {/* Section 1 */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              What Insurance Assessors Actually Want
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              Loss adjusters and insurance assessors are not looking for the
              longest report. They are looking for the right information,
              presented clearly, in a format they can process quickly. That
              means:
            </p>
            <ul className={`list-disc pl-6 mb-6 space-y-2 ${body}`}>
              <li>
                <strong className={heading}>S500-compliant language and methodology</strong> —
                References to IICRC standards show the work was performed to an
                accepted industry benchmark. Assessors can approve claims
                faster when the report demonstrates compliance rather than
                requiring them to verify it independently.
              </li>
              <li>
                <strong className={heading}>Psychrometric data and daily moisture readings</strong> —
                Documented drying progress with specific readings at mapped
                locations is the evidence assessors need to justify the scope
                and duration of the job. Without this data, every line item is
                open to challenge.
              </li>
              <li>
                <strong className={heading}>Equipment logs</strong> —
                Dehumidifier and air mover counts, placement details, and
                run times directly support equipment charges on the invoice.
                Assessors compare these logs against NRPG rate boundaries to
                validate costs.
              </li>
              <li>
                <strong className={heading}>Clear scope of works</strong> —
                A room-by-room breakdown with affected materials, damage
                categories, and restoration actions tells the assessor exactly
                what was done and why. Vague descriptions create delays and
                disputes.
              </li>
            </ul>

            {/* Section 2 */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              The Real Cost of a Poor Report
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              A weak report does not just slow down one claim. It compounds
              into real business damage over time:
            </p>
            <ul className={`list-disc pl-6 mb-6 space-y-2 ${body}`}>
              <li>
                <strong className={heading}>Delayed payments</strong> —
                When assessors need to request additional information, your
                invoice sits in a queue. A report that answers all questions
                upfront gets paid in days, not weeks.
              </li>
              <li>
                <strong className={heading}>Claim disputes</strong> —
                Insufficient documentation gives insurers grounds to dispute
                scope, duration, or equipment charges. Every dispute costs you
                time, cash flow, and credibility.
              </li>
              <li>
                <strong className={heading}>Losing preferred contractor status</strong> —
                Insurance panels and programs like SGS evaluate contractors on
                documentation quality alongside technical performance. If your
                reports consistently require follow-up, you drop down the list
                — or off it entirely.
              </li>
              <li>
                <strong className={heading}>Missed referrals</strong> —
                Assessors talk. A contractor known for clean, complete reports
                gets recommended across loss adjusting firms. A contractor
                known for missing data does not.
              </li>
            </ul>

            {/* Section 3 */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              What &quot;Better&quot; Looks Like in a Report
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              The gap between an adequate report and one that wins you
              preferred status is not about length — it is about structure and
              evidence quality:
            </p>
            <ul className={`list-disc pl-6 mb-6 space-y-2 ${body}`}>
              <li>
                <strong className={heading}>Professional layout</strong> —
                A branded, consistently formatted document signals that your
                business takes its work seriously. It sets the tone before the
                assessor reads a single data point.
              </li>
              <li>
                <strong className={heading}>Photos tied to readings</strong> —
                Timestamped images linked to specific moisture readings and
                room locations tell a clear story. Photos dumped into a folder
                with no context create more questions than they answer.
              </li>
              <li>
                <strong className={heading}>Room-by-room breakdown</strong> —
                Each affected area documented individually with its own scope,
                readings, equipment, and progress timeline. This structure
                mirrors how assessors review and approve claims.
              </li>
              <li>
                <strong className={heading}>Automated drying calculations</strong> —
                Psychrometric calculations that demonstrate proper equipment
                sizing and drying targets show technical competence and justify
                the equipment deployed on site.
              </li>
            </ul>

            {/* Section 4 */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              How Technology Closes the Gap
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              The reality is that most contractors understand what a good report
              looks like. The problem is time. After a long day on site, spending
              hours assembling spreadsheets, formatting documents, and organising
              photos is where quality drops.
            </p>
            <p className={`leading-relaxed mb-4 ${body}`}>
              This is where purpose-built restoration software changes the
              equation. RestoreAssist generates IICRC-compliant reports
              automatically from field data entered on site. Moisture readings,
              equipment logs, photos, and psychrometric data flow into a
              structured report template that meets S500 documentation
              requirements without manual formatting.
            </p>
            <p className={`leading-relaxed mb-6 ${body}`}>
              Technicians capture data during the job. The system handles
              compliance structure, professional layout, room-by-room
              organisation, and drying calculations. What used to take hours of
              office work now takes minutes — and the output is more accurate and
              consistent than anything assembled by hand.
            </p>

            {/* FAQ Section */}
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Frequently Asked Questions
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
            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Start Winning More Work with Better Reports
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              RestoreAssist gives restoration contractors the tools to produce
              IICRC-compliant, insurance-ready reports from the field — without
              the admin overhead. Start your free trial and see the difference
              professional reporting makes to your business.
            </p>
            <div className="mt-8 mb-4 flex flex-wrap gap-4">
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
      </article>

      <Footer darkMode={darkMode} />
    </div>
  )
}
