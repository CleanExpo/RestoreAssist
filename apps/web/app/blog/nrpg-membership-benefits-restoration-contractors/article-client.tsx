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
              <li className={body}>Industry</li>
            </ol>
          </nav>

          {/* Article Header */}
          <header className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <span
                className="text-xs px-3 py-1 rounded-full bg-[#8A6B4E]/20 text-[#8A6B4E]"
                style={{ fontFamily: sansBody }}
              >
                Industry
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
              NRPG Membership: What It Means for Restoration Contractors and Why
              It Matters
            </h1>
          </header>

          {/* Article Body */}
          <div
            className={`prose prose-lg max-w-none ${darkMode ? "prose-invert" : ""}`}
            style={{ fontFamily: sansBody }}
          >
            <p className={`text-lg leading-relaxed mb-6 ${body}`}>
              The National Restoration Pricing Guide (NRPG) is the pricing
              framework that underpins the relationship between restoration
              contractors and insurers across Australia. For contractors, NRPG
              membership is more than a badge &mdash; it is a commitment to
              transparent, fair pricing that benefits the entire industry. This
              article explains what NRPG membership involves, why it matters, and
              how it shapes the restoration landscape.
            </p>

            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              What Is the NRPG?
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              The NRPG is an industry-developed pricing guide that establishes
              standardised rate boundaries for restoration work in Australia. It
              covers labour rates, equipment hire charges, materials,
              consumables, and ancillary services used in water damage, fire
              damage, mould remediation, and related restoration disciplines.
            </p>
            <p className={`leading-relaxed mb-4 ${body}`}>
              The guide is maintained and updated regularly through consultation
              between restoration industry representatives and insurance sector
              stakeholders. This collaborative approach ensures that rate
              boundaries reflect current market conditions, including labour
              costs, equipment pricing, and regulatory requirements.
            </p>
            <p className={`leading-relaxed mb-4 ${body}`}>
              Unlike a fixed price list, the NRPG provides rate boundaries
              &mdash; minimum and maximum rates for each line item. This allows
              contractors to price competitively while maintaining viable
              margins, and gives insurers confidence that claims are being priced
              within an accepted framework.
            </p>

            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              NRPG Membership Requirements
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              To become an NRPG member, restoration contractors must meet
              several criteria that demonstrate professionalism, capability, and
              commitment to industry standards:
            </p>
            <ul className={`list-disc pl-6 mb-6 space-y-2 ${body}`}>
              <li>
                <strong className={heading}>IICRC certification</strong> &mdash;
                Member firms must employ IICRC-certified technicians with
                relevant specialisations (WRT, FSRT, AMRT) for the services they
                offer.
              </li>
              <li>
                <strong className={heading}>Insurance coverage</strong> &mdash;
                Members must hold current professional indemnity insurance and
                public liability insurance at levels specified by the NRPG.
              </li>
              <li>
                <strong className={heading}>Equipment standards</strong> &mdash;
                Member contractors must maintain properly calibrated and
                serviced restoration equipment that meets manufacturer and
                industry specifications.
              </li>
              <li>
                <strong className={heading}>Documentation capability</strong>{" "}
                &mdash; Members must demonstrate the ability to produce
                compliant documentation including moisture mapping, drying logs,
                photographic records, and detailed scopes of works.
              </li>
              <li>
                <strong className={heading}>Ongoing compliance</strong> &mdash;
                Membership is not a one-time qualification. Members must
                maintain their credentials, attend industry updates, and adhere
                to the NRPG code of conduct on an ongoing basis.
              </li>
            </ul>

            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Understanding Rate Boundaries
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              The NRPG rate boundary system is designed to create a fair
              marketplace. Each line item in the guide has a defined minimum and
              maximum rate. Here is how the system works in practice:
            </p>
            <ul className={`list-disc pl-6 mb-6 space-y-2 ${body}`}>
              <li>
                <strong className={heading}>Minimum rates</strong> protect
                contractors from a &ldquo;race to the bottom&rdquo; where
                unsustainable pricing leads to cut corners, inadequate
                equipment, and poor outcomes.
              </li>
              <li>
                <strong className={heading}>Maximum rates</strong> protect
                property owners and insurers from price gouging, particularly
                during high-demand events like widespread flooding.
              </li>
              <li>
                <strong className={heading}>Regional adjustments</strong> account
                for legitimate cost differences between metropolitan and
                regional areas, including travel, accommodation, and local
                labour market conditions.
              </li>
              <li>
                <strong className={heading}>Regular updates</strong> ensure
                rates keep pace with inflation, equipment costs, and changes to
                regulatory requirements.
              </li>
            </ul>
            <p className={`leading-relaxed mb-4 ${body}`}>
              Contractors who consistently price within NRPG boundaries
              experience fewer invoice disputes, faster payment cycles, and
              stronger relationships with insurer panels.
            </p>

            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              How NRPG Protects Contractors and Property Owners
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              The NRPG framework creates a balanced ecosystem that serves
              multiple stakeholders:
            </p>

            <h3
              className={`text-xl font-bold mt-8 mb-3 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              For Contractors
            </h3>
            <ul className={`list-disc pl-6 mb-6 space-y-2 ${body}`}>
              <li>
                Guaranteed minimum rates ensure sustainable business operations
                and the ability to invest in training, equipment, and quality
                assurance.
              </li>
              <li>
                A standardised framework reduces time spent on price
                negotiations with insurers, allowing contractors to focus on
                delivering quality restoration work.
              </li>
              <li>
                NRPG membership signals credibility to insurers and can
                facilitate access to insurer panels and preferred contractor
                programs.
              </li>
            </ul>

            <h3
              className={`text-xl font-bold mt-8 mb-3 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              For Property Owners
            </h3>
            <ul className={`list-disc pl-6 mb-6 space-y-2 ${body}`}>
              <li>
                Rate boundaries provide confidence that you are paying a fair
                market rate, not an inflated emergency premium.
              </li>
              <li>
                NRPG member contractors must meet quality and certification
                requirements, reducing the risk of substandard work.
              </li>
              <li>
                Insurance claims priced within NRPG boundaries are processed
                more smoothly, reducing delays and disputes.
              </li>
            </ul>

            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              How RestoreAssist Integrates with NRPG Compliance
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              RestoreAssist is built with NRPG compliance at its core. Our
              platform helps restoration contractors operate within NRPG rate
              boundaries through several integrated features:
            </p>
            <ul className={`list-disc pl-6 mb-6 space-y-2 ${body}`}>
              <li>
                <strong className={heading}>Rate boundary validation</strong>{" "}
                &mdash; Our quoting and invoicing tools automatically flag line
                items that fall outside current NRPG rate boundaries before you
                submit to an insurer.
              </li>
              <li>
                <strong className={heading}>Compliant scope templates</strong>{" "}
                &mdash; Pre-built scope of works templates align with NRPG line
                items, ensuring nothing is missed and pricing is consistent.
              </li>
              <li>
                <strong className={heading}>Documentation automation</strong>{" "}
                &mdash; RestoreAssist generates moisture reports, drying logs,
                and project documentation that meets both IICRC and NRPG
                standards.
              </li>
              <li>
                <strong className={heading}>Contractor directory</strong> &mdash;
                Our verified contractor directory highlights NRPG membership
                status, making it easy for property owners and insurers to find
                compliant contractors.
              </li>
            </ul>
            <p className={`leading-relaxed mb-4 ${body}`}>
              By integrating NRPG rate boundaries directly into the quoting
              workflow, RestoreAssist eliminates the guesswork and manual
              cross-referencing that leads to pricing errors and invoice
              rejections.
            </p>

            <h2
              className={`text-2xl font-bold mt-10 mb-4 ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Get Started with NRPG-Compliant Quoting
            </h2>
            <p className={`leading-relaxed mb-4 ${body}`}>
              Whether you are a restoration contractor looking to streamline
              your quoting process or a property owner seeking fair,
              transparent pricing, RestoreAssist can help. Our tools are
              designed to make NRPG compliance effortless so you can focus on
              what matters &mdash; delivering quality restoration outcomes.
            </p>
            <div className="mt-8 mb-4 flex flex-wrap gap-4">
              <Link
                href="/tools/quote"
                className="inline-block px-8 py-3 bg-[#8A6B4E] text-white font-semibold rounded-lg hover:bg-[#8A6B4E]/90 transition-colors"
                style={{ fontFamily: sansBody }}
              >
                Try the Quote Tool
              </Link>
              <Link
                href="/compliance/nrpg"
                className="inline-block px-8 py-3 border border-[#8A6B4E] text-[#8A6B4E] font-semibold rounded-lg hover:bg-[#8A6B4E]/10 transition-colors"
                style={{ fontFamily: sansBody }}
              >
                Learn About NRPG Compliance
              </Link>
            </div>
          </div>
        </div>
      </article>

      <Footer darkMode={darkMode} />
    </div>
  )
}
