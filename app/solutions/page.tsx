"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { RAIcon } from "@/components/brand/RAIcon";

export default function SolutionsPage() {
  const darkMode = false;

  useEffect(() => {
    if (!document.getElementById("google-fonts-preconnect")) {
      const link1 = document.createElement("link");
      link1.id = "google-fonts-preconnect";
      link1.rel = "preconnect";
      link1.href = "https://fonts.googleapis.com";
      document.head.appendChild(link1);

      const link2 = document.createElement("link");
      link2.rel = "preconnect";
      link2.href = "https://fonts.gstatic.com";
      link2.crossOrigin = "anonymous";
      document.head.appendChild(link2);

      const link3 = document.createElement("link");
      link3.href =
        "https://fonts.googleapis.com/css2?family=Open+Sauce+Sans:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap";
      link3.rel = "stylesheet";
      document.head.appendChild(link3);
    }
  }, []);

  /**
   * One rule governs this page: insurers may appear as an audience for the
   * OUTPUT, never as a user of the software. The previous third card was
   * "For Insurance Adjusters — ensure fair settlements", which cast the product
   * as a neutral arbiter between contractor and carrier and contradicted the
   * launch positioning already sent to customers.
   */
  const solutions = [
    {
      title: "For the restoration contractor",
      description:
        "Capture the site while you're standing in it — photos, moisture readings, scope notes. Reports build on IICRC S500:2021 section structure from what you actually recorded, not what you reconstructed at 9pm. You review and own every decision before it leaves your business.",
      benefits: [
        "Capture on site, offline when there's no signal",
        "S500:2021 section structure",
        "Nothing auto-submitted anywhere",
        "Your evidence stays on your job",
      ],
    },
    {
      title: "For your client",
      description:
        "The homeowner or business owner sees what's happening to their property in language they understand. Fewer phone calls asking what's going on. Fewer disputes at the end, because nothing arrives as a surprise.",
      benefits: [
        "Plain-language progress",
        "Scope approvals in one place",
        "Documents they can download",
        "Fewer chase-up calls",
      ],
    },
    {
      title: "For the claim",
      description:
        "Documentation that holds up. Evidence carries its real capture data — if a photo didn't record a GPS location, the report says so rather than filling the field with a number that looks like data. Documentation that invents provenance is worthless the first time it's challenged.",
      benefits: [
        "Real capture data on every photo",
        "Gaps stated, never invented",
        "Built to survive scrutiny",
        "Insurers receive it; they don't drive it",
      ],
    },
  ];

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${darkMode ? "bg-brand-navy" : "bg-brand-cloud"}`}
    >
      {/* Hero Section */}
      <section className="pt-48 pb-20 px-6 relative z-10 min-h-[60vh] flex items-center bg-brand-mist/30 overflow-hidden">
        {/* Golden Decorative Shapes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-20 right-10 w-72 h-72 bg-brand-bronze/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 left-10 w-96 h-96 bg-brand-bronze/8 rounded-full blur-3xl"></div>
        </div>
        <div className="w-full max-w-[80%] mx-auto w-full relative z-10">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className={`text-5xl md:text-6xl font-bold mb-6 leading-tight ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}
            style={{
              fontFamily:
                '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            Built for the contractor. Trusted by everyone downstream.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className={`text-xl md:text-2xl ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
            style={{
              fontFamily:
                '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            Restoration software is usually sold to the party paying the claim.
            That shapes everything about it — what it asks you to record, whose
            workflow you follow, who your evidence belongs to. RestoreAssist is
            built the other way round. One customer: the restorer.
          </motion.p>
        </div>
      </section>

      {/* Solutions Grid */}
      <section className="py-20 px-6 relative bg-brand-mist/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-10 left-1/4 w-80 h-80 bg-brand-bronze/12 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-1/4 w-64 h-64 bg-brand-bronze/10 rounded-full blur-3xl"></div>
        </div>
        <div className="w-full max-w-[80%] mx-auto relative z-10">
          <div className="grid md:grid-cols-3 gap-8">
            {solutions.map((solution, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className={`p-8 rounded-lg ${darkMode ? "bg-brand-navy/50" : "bg-brand-cloud/50"} backdrop-blur-sm border ${darkMode ? "border-brand-slate/30" : "border-brand-slate/20"}`}
              >
                <h3
                  className={`text-2xl font-bold mb-4 ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}
                  style={{
                    fontFamily:
                      '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  {solution.title}
                </h3>
                <p
                  className={`text-base mb-6 ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
                  style={{
                    fontFamily:
                      '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  {solution.description}
                </p>
                <ul className="space-y-2">
                  {solution.benefits.map((benefit, idx) => (
                    <li
                      key={idx}
                      className={`flex items-center gap-2 ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
                      style={{
                        fontFamily:
                          '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                      }}
                    >
                      <span className="text-brand-bronze">
                        <RAIcon name="success" size={16} decorative />
                      </span>
                      {benefit}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing — whose software is it */}
      <section className="py-20 px-6 relative bg-brand-mist/30 overflow-hidden">
        <div className="w-full max-w-[80%] mx-auto relative z-10">
          <div
            className={`max-w-3xl rounded-lg border p-10 ${darkMode ? "border-brand-slate/30 bg-brand-navy/50" : "border-brand-slate/20 bg-brand-cloud/50"} backdrop-blur-sm`}
          >
            <h2
              className={`text-3xl font-bold mb-6 ${darkMode ? "text-brand-cloud" : "text-brand-navy"}`}
              style={{
                fontFamily:
                  '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              }}
            >
              Whose software is it?
            </h2>
            <div
              className={`space-y-4 text-base leading-relaxed ${darkMode ? "text-brand-mist" : "text-brand-slate"}`}
              style={{
                fontFamily:
                  '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              }}
            >
              <p>
                Your documentation still has to satisfy an insurer, an adjuster,
                sometimes a tribunal. It will. But it satisfies them because it
                is complete and honest, not because the software was designed
                around their process.
              </p>
              <p>
                Ask any vendor the same simple question: who is your customer? If
                the answer is the carrier, you know whose workflow you will be
                feeding.
              </p>
              <p>
                Ours is you. That is why the pricing page lists every cost
                including the ones we do not charge, and why the reports admit
                what they do not know.
              </p>
            </div>
            <Link
              href="/signup"
              className="mt-8 inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-bronze px-7 py-3 text-base font-semibold text-brand-navy transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-bronze focus-visible:ring-offset-2"
            >
              Start free — 15-day trial, 50 reports, no credit card
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
