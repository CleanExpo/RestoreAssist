"use client";

import { useState } from "react";
import Link from "next/link";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";

const fieldMappings = [
  {
    requirement: "Water damage category classification (1–3)",
    section: "IICRC S500:2025 §4.1",
    feature: "IICRC Classification module",
    reportSection: "Section 3 — IICRC Classification",
  },
  {
    requirement: "Water damage class classification (1–4)",
    section: "IICRC S500:2025 §4.2",
    feature: "IICRC Classification module",
    reportSection: "Section 3 — IICRC Classification",
  },
  {
    requirement: "Psychrometric data — temperature, relative humidity, GPP",
    section: "IICRC S500:2025 §6.3",
    feature: "Environmental readings log (multi-day)",
    reportSection: "Section 2 — Environmental Conditions",
  },
  {
    requirement: "Moisture readings with location and material type",
    section: "IICRC S500:2025 §7.1",
    feature: "Moisture mapping — room, surface, reading value",
    reportSection: "Section 4 — Moisture Readings",
  },
  {
    requirement: "Drying goal verification and dry standard confirmation",
    section: "IICRC S500:2025 §11.4",
    feature: "Verification checklist with pass/fail per reading",
    reportSection: "Section 8 — Verification Checklist",
  },
  {
    requirement: "Equipment deployment — type, quantity, placement dates",
    section: "IICRC S500:2025 §8.3",
    feature: "Equipment log with deployment and retrieval dates",
    reportSection: "Section 5 — Equipment Log",
  },
  {
    requirement: "Contamination protocols for Category 2/3 water",
    section: "IICRC S500:2025 §9.1–9.2",
    feature: "Scope items with category-specific remediation steps",
    reportSection: "Section 6 — Scope of Works",
  },
  {
    requirement: "Affected area identification with dimensions",
    section: "IICRC S500:2025 §10.2",
    feature: "Affected areas with room, surface, and area measurements",
    reportSection: "Section 5 — Affected Areas",
  },
  {
    requirement: "Health and safety documentation",
    section: "IICRC S500:2025 §5.1",
    feature: "WHS section with hazard identification",
    reportSection: "Section 7 — Scope of Works",
  },
  {
    requirement: "Photo documentation of damage and equipment",
    section: "IICRC S500:2025 §4.2",
    feature: "Photo upload per area and per equipment placement",
    reportSection: "Embedded in relevant sections",
  },
  {
    requirement: "Standards citations for insurer audit trail",
    section: "IICRC S500:2025 §4.2",
    feature: "Auto-generated standards reference section",
    reportSection: "Section 9 — IICRC Standards Referenced",
  },
  {
    requirement: "Signatory confirmation for completion",
    section: "IICRC S500:2025 §4.2",
    feature: "Digital signature capture (technician and client)",
    reportSection: "Section 10 — Signatures",
  },
];

const reportSections = [
  {
    num: "1",
    title: "Property Information",
    standard: "S500:2025 §4.2",
    desc: "Address, insurer, claim number, date of loss, inspecting technician",
  },
  {
    num: "2",
    title: "Environmental Conditions",
    standard: "S500:2025 §6.3 / §12.4",
    desc: "Temperature, relative humidity, grains per pound across monitoring days",
  },
  {
    num: "3",
    title: "IICRC Classification",
    standard: "S500:2025 §4.1–4.2",
    desc: "Water category (1–3) and damage class (1–4) with rationale",
  },
  {
    num: "4",
    title: "Moisture Readings",
    standard: "S500:2025 §7.1",
    desc: "Room-by-room readings: surface, material, reading value, target",
  },
  {
    num: "5",
    title: "Affected Areas & Equipment",
    standard: "S500:2025 §8.3 / §10.2",
    desc: "Area dimensions, affected materials, equipment type and deployment dates",
  },
  {
    num: "6",
    title: "Scope of Works",
    standard: "S500:2025 §9.1–9.2 / §13",
    desc: "Line-item remediation tasks with category-specific protocols",
  },
  {
    num: "7",
    title: "Cost Estimate",
    standard: "Insurance industry standard",
    desc: "Itemised costs with GST, labour, materials, and equipment",
  },
  {
    num: "8",
    title: "Verification Checklist",
    standard: "S500:2025 §11.4",
    desc: "Pass/fail drying verification for adjuster and insurer review",
  },
  {
    num: "9",
    title: "IICRC Standards Referenced",
    standard: "S500:2025 §4.2",
    desc: "Auto-generated list of all S500:2025 sections cited in the report",
  },
  {
    num: "10",
    title: "Signatures",
    standard: "S500:2025 §4.2",
    desc: "Digital technician and client signatures with timestamp",
  },
];

export default function CompliancePage() {
  const [darkMode, setDarkMode] = useState(true);

  const bg = darkMode ? "bg-[#050505]" : "bg-[#F4F5F6]";
  const text = darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]";
  const muted = darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]";
  const card = darkMode
    ? "bg-[#1C2E47]/60 border-[#5A6A7B]/30"
    : "bg-white border-[#5A6A7B]/20";
  const tableHead = darkMode
    ? "bg-[#1C2E47] text-[#D4A574]"
    : "bg-[#1C2E47] text-[#D4A574]";
  const tableRow = darkMode
    ? "border-[#5A6A7B]/20 hover:bg-[#1C2E47]/40"
    : "border-gray-200 hover:bg-gray-50";
  const badge =
    "inline-block rounded px-2 py-0.5 text-xs font-medium bg-[#8A6B4E]/20 text-[#D4A574]";

  return (
    <div className={`min-h-screen transition-colors duration-300 ${bg}`}>
      <Header darkMode={darkMode} setDarkMode={setDarkMode} />

      {/* Hero */}
      <section className="pt-48 pb-20 px-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-24 right-16 w-96 h-96 bg-[#8A6B4E]/10 rounded-full blur-3xl" />
          <div className="absolute bottom-8 left-8 w-72 h-72 bg-[#1C2E47]/20 rounded-full blur-3xl" />
        </div>
        <div className="max-w-5xl mx-auto relative">
          <span className={`${badge} mb-4 inline-block`}>
            AS-IICRC S500:2025
          </span>
          <h1
            className={`text-5xl md:text-6xl font-bold mb-6 leading-tight ${text}`}
            style={{ fontFamily: '"Open Sauce Sans", Inter, sans-serif' }}
          >
            IICRC S500:2025
            <br />
            <span className="text-[#D4A574]">Compliance in RestoreAssist</span>
          </h1>
          <p className={`text-xl max-w-3xl leading-relaxed ${muted}`}>
            A field-by-field reference showing how RestoreAssist maps to the
            IICRC S500:2025 standard for professional water damage restoration.
            Built for Australian restoration contractors, insurers, and
            assessors.
          </p>
        </div>
      </section>

      {/* What is S500:2025 */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className={`rounded-xl border p-8 ${card}`}>
            <h2
              className={`text-3xl font-bold mb-4 ${text}`}
              style={{ fontFamily: '"Open Sauce Sans", Inter, sans-serif' }}
            >
              What is IICRC S500:2025?
            </h2>
            <div className={`space-y-4 leading-relaxed ${muted}`}>
              <p>
                The IICRC S500 is the internationally recognised standard for
                professional water damage restoration. The 2025 edition —
                adopted in Australia as{" "}
                <strong className={text}>AS-IICRC S500:2025</strong> — sets the
                minimum documentation, classification, drying verification, and
                equipment requirements that restoration contractors must follow
                to demonstrate competent practice.
              </p>
              <p>
                For Australian restoration companies, the standard matters most
                in three situations: insurer claim audits, adjuster reviews, and
                any dispute where the quality or completeness of your
                documentation is challenged. A report that cannot demonstrate
                S500:2025 compliance is a liability.
              </p>
              <p>
                RestoreAssist was built around S500:2025 from the ground up.
                Every data field the technician fills in maps to a specific
                section of the standard. The exported PDF includes an
                auto-generated standards citation section so insurers can
                immediately verify compliance without additional documentation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Field Mapping Table */}
      <section className="py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <h2
            className={`text-3xl font-bold mb-3 ${text}`}
            style={{ fontFamily: '"Open Sauce Sans", Inter, sans-serif' }}
          >
            How RestoreAssist Maps to S500:2025
          </h2>
          <p className={`mb-8 ${muted}`}>
            Each row shows a standard requirement, the RestoreAssist feature
            that captures it, and the report section where it appears.
          </p>
          <div className="overflow-x-auto rounded-xl border border-[#5A6A7B]/30">
            <table className="w-full text-sm">
              <thead>
                <tr className={tableHead}>
                  <th className="text-left px-4 py-3 font-semibold w-[30%]">
                    S500:2025 Requirement
                  </th>
                  <th className="text-left px-4 py-3 font-semibold w-[15%]">
                    Standard Section
                  </th>
                  <th className="text-left px-4 py-3 font-semibold w-[28%]">
                    RestoreAssist Feature
                  </th>
                  <th className="text-left px-4 py-3 font-semibold w-[27%]">
                    Report Section
                  </th>
                </tr>
              </thead>
              <tbody>
                {fieldMappings.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-t transition-colors ${tableRow}`}
                  >
                    <td className={`px-4 py-3 ${text}`}>{row.requirement}</td>
                    <td className="px-4 py-3">
                      <span className={badge}>{row.section}</span>
                    </td>
                    <td className={`px-4 py-3 ${muted}`}>{row.feature}</td>
                    <td className={`px-4 py-3 ${muted}`}>
                      {row.reportSection}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Report Structure */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <h2
            className={`text-3xl font-bold mb-3 ${text}`}
            style={{ fontFamily: '"Open Sauce Sans", Inter, sans-serif' }}
          >
            Sample Report Structure
          </h2>
          <p className={`mb-8 ${muted}`}>
            Every RestoreAssist PDF follows this section structure. Each heading
            maps to the relevant S500:2025 section for insurer reference.
          </p>
          <div className="space-y-3">
            {reportSections.map((s) => (
              <div
                key={s.num}
                className={`flex items-start gap-4 rounded-lg border p-4 ${card}`}
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#1C2E47] flex items-center justify-center text-[#D4A574] font-bold text-sm">
                  {s.num}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`font-semibold ${text}`}>{s.title}</span>
                    <span className={badge}>{s.standard}</span>
                  </div>
                  <p className={`text-sm mt-1 ${muted}`}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className={`rounded-2xl border p-10 ${card}`}>
            <h2
              className={`text-3xl font-bold mb-4 ${text}`}
              style={{ fontFamily: '"Open Sauce Sans", Inter, sans-serif' }}
            >
              Generate your first compliant report
            </h2>
            <p className={`mb-8 text-lg ${muted}`}>
              Start a free trial and produce a fully S500:2025-mapped report
              from your next inspection — no setup fee, no credit card required.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/signup"
                className="inline-block rounded-lg bg-[#D4A574] px-8 py-3 font-semibold text-[#050505] hover:bg-[#8A6B4E] transition-colors"
              >
                Start free trial
              </Link>
              <Link
                href="/how-it-works"
                className={`inline-block rounded-lg border px-8 py-3 font-semibold transition-colors ${
                  darkMode
                    ? "border-[#5A6A7B]/50 text-[#C4C8CA] hover:border-[#D4A574] hover:text-[#D4A574]"
                    : "border-[#5A6A7B]/30 text-[#5A6A7B] hover:border-[#1C2E47] hover:text-[#1C2E47]"
                }`}
              >
                See how it works
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer darkMode={darkMode} />
    </div>
  );
}
