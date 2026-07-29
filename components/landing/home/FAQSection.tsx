"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { PRICING_CONFIG } from "@/lib/pricing";
import {
  fadeUp,
  staggerContainer,
  SECTION_EYEBROW,
  SECTION_TITLE,
  SECTION_BODY,
  SECTION_PAD,
  FONT_DISPLAY,
  VIEWPORT,
  HAIRLINE,
  EASE_OUT,
  CONTAINER,
} from "./motion";

const trialDays = PRICING_CONFIG.free.trialDays;
const trialReports = PRICING_CONFIG.free.trialReportCredits;

const FAQS = [
  {
    cat: "Product",
    q: "What is RestoreAssist?",
    a: "RestoreAssist is Australia's first Australian-designed full CRM — an Office and Field Management System for the Australian Restoration Industry. It connects field capture, IICRC-aligned reporting, GST invoicing, and client approvals in one system so teams remove double-handling between the driveway and the desk.",
  },
  {
    cat: "Trial",
    q: "What's included in the free trial?",
    a: `${trialDays}-day trial with ${trialReports} inspection report credits and instant setup. Field capture, reporting, invoicing, and the client portal are ready from day one — so you can prove value on real work without rewriting your process.`,
  },
  {
    cat: "Pricing",
    q: "How does pricing work?",
    a: `Start free for ${trialDays} days with ${trialReports} report credits, then choose a plan that fits your team. See current options on the pricing page — clear packages, no need to rebuild your process just to evaluate the product.`,
  },
  {
    cat: "Team",
    q: "Can my whole team use it?",
    a: "Yes. Roles, handoffs, and shared jobs keep owners, office managers, and field technicians aligned on the same claim — from first visit to final invoice.",
  },
  {
    cat: "Reports",
    q: "Does RestoreAssist create IICRC S500 reports?",
    a: "Yes. RestoreAssist helps produce S500:2021-aligned report drafts so writing time drops from hours to minutes. You review, edit, and own the final document — professional judgement stays with the operator on every claim.",
  },
  {
    cat: "Compliance",
    q: "Is it compliant with Australian building codes and WHS?",
    a: "RestoreAssist includes inbuilt IICRC frameworks, WHS policies, and Australian Building Code / NCC 2022 references so compliance is part of the daily workflow — not a separate checklist after the job.",
  },
  {
    cat: "Field",
    q: "Can field technicians use it offline on site?",
    a: "Yes. Field capture is designed for real job sites — evidence, moisture readings, and sketches can be captured offline and sync when you are back online, so poor reception does not stall the job.",
  },
  {
    cat: "Office",
    q: "Does this replace our accounting tools?",
    a: "RestoreAssist is built for restoration operations — field capture, reporting, invoicing workflows, and client approvals. It sits alongside the tools your office already uses for bookkeeping rather than forcing a full finance rip-and-replace.",
  },
] as const;

/**
 * FAQ — "desk briefing index" pattern.
 * Left: question ledger. Right: active answer plate.
 * Not a stacked accordion wall.
 */
export function FAQSection() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const item = FAQS[active];

  return (
    <section
      className={`relative overflow-hidden bg-white ${HAIRLINE} ${SECTION_PAD}`}
      aria-labelledby="faq-heading"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_45%_at_0%_0%,rgba(59,109,140,0.06),transparent_55%)]"
        aria-hidden
      />

      <div className={`${CONTAINER} relative`}>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)] lg:gap-16 xl:gap-20">
          {/* Intro + question ledger */}
          <div>
            <motion.div
              variants={staggerContainer}
              initial={reduce ? false : "hidden"}
              whileInView="visible"
              viewport={VIEWPORT}
              className="max-w-md"
            >
              <motion.p variants={fadeUp} className={SECTION_EYEBROW}>
                Frequently asked questions
              </motion.p>
              <motion.h2
                id="faq-heading"
                variants={fadeUp}
                className={SECTION_TITLE}
              >
                Straight answers for restoration teams
              </motion.h2>
              <motion.p variants={fadeUp} className={SECTION_BODY}>
                Clear detail on trial, pricing, team use, compliance, and field
                work — so you can decide with confidence.
              </motion.p>
            </motion.div>

            <motion.ol
              variants={staggerContainer}
              initial={reduce ? false : "hidden"}
              whileInView="visible"
              viewport={VIEWPORT}
              className="mt-10 space-y-1 sm:mt-12"
              role="listbox"
              aria-label="Questions"
              aria-activedescendant={`faq-q-${active}`}
            >
              {FAQS.map((faq, i) => {
                const selected = i === active;
                return (
                  <motion.li key={faq.q} variants={fadeUp}>
                    <button
                      type="button"
                      role="option"
                      id={`faq-q-${i}`}
                      aria-selected={selected}
                      onClick={() => setActive(i)}
                      onMouseEnter={() => {
                        if (typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches) {
                          setActive(i);
                        }
                      }}
                      className={[
                        "group flex w-full items-start gap-4 rounded-xl px-3 py-3 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6D8C]/50 focus-visible:ring-offset-2",
                        selected
                          ? "bg-[#F3F5F7]"
                          : "hover:bg-[#F3F5F7]/70",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          FONT_DISPLAY,
                          "mt-0.5 text-[11px] font-bold tabular-nums tracking-[0.14em] transition-colors",
                          selected ? "text-[#3B6D8C]" : "text-slate-400",
                        ].join(" ")}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={[
                            FONT_DISPLAY,
                            "block text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors",
                            selected ? "text-[#3B6D8C]" : "text-slate-400",
                          ].join(" ")}
                        >
                          {faq.cat}
                        </span>
                        <span
                          className={[
                            FONT_DISPLAY,
                            "mt-1 block text-[15px] font-semibold leading-snug tracking-[-0.015em] transition-colors sm:text-base",
                            selected
                              ? "text-[#0B1F3A]"
                              : "text-slate-600 group-hover:text-[#16345A]",
                          ].join(" ")}
                        >
                          {faq.q}
                        </span>
                      </span>
                      <span
                        className={[
                          "mt-1 h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
                          selected ? "bg-[#3B6D8C]" : "bg-transparent",
                        ].join(" ")}
                        aria-hidden
                      />
                    </button>
                  </motion.li>
                );
              })}
            </motion.ol>
          </div>

          {/* Answer plate */}
          <div className="lg:pt-2">
            <div className="relative min-h-[22rem] overflow-hidden border border-slate-200/90 bg-[#F3F5F7] sm:min-h-[26rem] lg:sticky lg:top-28 lg:min-h-[28rem]">
              {/* Folio corner */}
              <div
                className="pointer-events-none absolute top-0 right-0 border-b border-l border-slate-200/90 bg-white px-4 py-2"
                aria-hidden
              >
                <span
                  className={`${FONT_DISPLAY} text-[11px] font-bold tabular-nums tracking-[0.16em] text-[#3B6D8C]`}
                >
                  {String(active + 1).padStart(2, "0")} /{" "}
                  {String(FAQS.length).padStart(2, "0")}
                </span>
              </div>

              <div
                className="absolute top-0 left-0 h-full w-1 bg-[#3B6D8C]"
                aria-hidden
              />

              <div className="flex h-full flex-col px-6 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={item.q}
                    initial={reduce ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? undefined : { opacity: 0, y: -10 }}
                    transition={{ duration: 0.32, ease: EASE_OUT }}
                    className="flex flex-1 flex-col"
                    role="article"
                    aria-live="polite"
                  >
                    <p
                      className={`${FONT_DISPLAY} text-[11px] font-semibold uppercase tracking-[0.2em] text-[#3B6D8C]`}
                    >
                      {item.cat}
                    </p>
                    <h3
                      className={`${FONT_DISPLAY} mt-4 max-w-lg text-[1.45rem] font-semibold leading-[1.15] tracking-[-0.025em] text-[#0B1F3A] sm:text-[1.75rem] sm:leading-[1.12]`}
                    >
                      {item.q}
                    </h3>
                    <p className="mt-5 max-w-xl flex-1 text-[15px] leading-[1.75] text-slate-600 sm:mt-6 sm:text-base sm:leading-[1.72]">
                      {item.a}
                    </p>

                    <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-200/90 pt-5">
                      <Link
                        href="/pricing"
                        className={`${FONT_DISPLAY} text-sm font-semibold text-[#3B6D8C] transition-colors hover:text-[#0B1F3A]`}
                      >
                        View pricing →
                      </Link>
                      <Link
                        href="/how-it-works"
                        className={`${FONT_DISPLAY} text-sm font-semibold text-[#3B6D8C] transition-colors hover:text-[#0B1F3A]`}
                      >
                        See how it works →
                      </Link>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
