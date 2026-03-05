"use client"

import { useState } from "react"
import Link from "next/link"
import Header from "@/components/landing/Header"
import Footer from "@/components/landing/Footer"

export default function ServicesClient() {
  const [darkMode, setDarkMode] = useState(true)

  const heading = darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"
  const body = darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"
  const bg = darkMode ? "bg-[#1C2E47]" : "bg-[#F4F5F6]"
  const sansHeading =
    '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  const sansBody =
    '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  const cardBg = darkMode
    ? "bg-[#1C2E47]/50 border-[#5A6A7B]/30"
    : "bg-[#F4F5F6]/50 border-[#5A6A7B]/20"

  const services = [
    {
      title: "Water Damage Restoration",
      href: "/services/water-damage-restoration",
      standard: "IICRC S500",
      description:
        "Professional water damage restoration following the IICRC S500 standard. Emergency extraction, structural drying, and complete restoration by certified contractors.",
      topics: [
        "Water damage categories (Cat 1/2/3)",
        "Drying classes (1-4)",
        "Extraction and dehumidification",
        "IICRC WRT certification",
      ],
    },
    {
      title: "Mould Remediation",
      href: "/services/mould-remediation",
      standard: "IICRC S520",
      description:
        "Comprehensive mould assessment and remediation following the IICRC S520 standard. From containment to clearance testing, delivered by AMRT-certified professionals.",
      topics: [
        "Health risks and contamination conditions",
        "S520 remediation protocol",
        "Containment and PPE requirements",
        "Independent clearance testing",
      ],
    },
  ]

  return (
    <div className={`min-h-screen transition-colors duration-300 ${bg}`}>
      <Header darkMode={darkMode} setDarkMode={setDarkMode} />

      <section className="pt-48 pb-20 px-6 relative z-10 bg-[#C4C8CA]/30">
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
              <li className={body}>Services</li>
            </ol>
          </nav>

          {/* Header */}
          <header className="mb-12">
            <h1
              className={`text-4xl md:text-5xl font-bold leading-tight ${heading}`}
              style={{ fontFamily: sansHeading }}
            >
              Restoration Services
            </h1>
            <p
              className={`text-xl mt-6 leading-relaxed ${body}`}
              style={{ fontFamily: sansBody }}
            >
              IICRC-compliant restoration services delivered by certified contractors
              across Australia. Explore our service areas to learn about industry
              standards, processes, and how RestoreAssist supports compliant delivery.
            </p>
          </header>

          {/* Service Cards */}
          <div className="space-y-6">
            {services.map((service) => (
              <Link
                key={service.href}
                href={service.href}
                className={`block p-6 rounded-lg border backdrop-blur-sm ${cardBg} hover:border-[#8A6B4E]/50 transition-colors`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <h2
                    className={`text-2xl font-bold ${heading}`}
                    style={{ fontFamily: sansHeading }}
                  >
                    {service.title}
                  </h2>
                  <span
                    className="text-xs px-3 py-1 rounded-full bg-[#8A6B4E]/20 text-[#8A6B4E]"
                    style={{ fontFamily: sansBody }}
                  >
                    {service.standard}
                  </span>
                </div>
                <p
                  className={`leading-relaxed mb-4 ${body}`}
                  style={{ fontFamily: sansBody }}
                >
                  {service.description}
                </p>
                <ul className={`list-disc pl-6 space-y-1 text-sm ${body}`}>
                  {service.topics.map((topic) => (
                    <li key={topic}>{topic}</li>
                  ))}
                </ul>
                <span
                  className="inline-block mt-4 text-[#8A6B4E] font-semibold text-sm"
                  style={{ fontFamily: sansBody }}
                >
                  Read more &rarr;
                </span>
              </Link>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-12 text-center">
            <p
              className={`leading-relaxed mb-6 ${body}`}
              style={{ fontFamily: sansBody }}
            >
              Need a certified restoration contractor? RestoreAssist connects you with
              IICRC-certified professionals across Australia.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
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
      </section>

      <Footer darkMode={darkMode} />
    </div>
  )
}
