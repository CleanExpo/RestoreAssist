"use client";

import { useState } from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
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
} from "./motion";

const FAQS = [
  {
    q: "What is RestoreAssist?",
    a: "RestoreAssist is Australia's first Australian-designed full CRM — an Office and Field Management System for the Australian Restoration Industry. It connects field capture, IICRC-aligned reporting, GST invoicing, and client approvals in one system so teams remove double-handling between the driveway and the desk.",
  },
  {
    q: "Does RestoreAssist create IICRC S500 reports?",
    a: "Yes. RestoreAssist helps produce S500:2021-aligned report drafts so writing time drops from hours to minutes. You review, edit, and own the final document — professional judgement stays with the operator on every claim.",
  },
  {
    q: "Is it compliant with Australian building codes and WHS?",
    a: "RestoreAssist includes inbuilt IICRC frameworks, WHS policies, and Australian Building Code / NCC 2022 references so compliance is part of the daily workflow — not a separate checklist after the job.",
  },
  {
    q: "Can field technicians use it offline on site?",
    a: "Yes. Field capture is designed for real job sites — evidence, moisture readings, and sketches can be captured offline and sync when you are back online, so poor reception does not stall the job.",
  },
  {
    q: "What's included in the free trial?",
    a: "Three complimentary trial reports with instant setup. Field capture, reporting, invoicing, and the client portal are ready from day one — so you can prove value on real work without rewriting your process.",
  },
  {
    q: "Who is RestoreAssist built for?",
    a: "Restoration company owners, office managers, and field technicians across Australia and New Zealand who need one reliable system for inspection, reporting, invoicing, and client communication.",
  },
] as const;

export function FAQSection() {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section
      className={`relative bg-white ${HAIRLINE} ${SECTION_PAD}`}
      aria-labelledby="faq-heading"
    >
      <div className="mx-auto max-w-3xl px-5 sm:px-6 lg:px-8">
        <motion.div
          variants={staggerContainer}
          initial={reduce ? false : "hidden"}
          whileInView="visible"
          viewport={VIEWPORT}
          className="text-center"
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
          <motion.p
            variants={fadeUp}
            className={`${SECTION_BODY} mx-auto text-center`}
          >
            Clear detail on compliance, field use, reporting, and getting
            started — so you can decide with confidence.
          </motion.p>
        </motion.div>

        <div className="mt-12 divide-y divide-slate-200/90 border-y border-slate-200/90">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            const panelId = `faq-panel-${i}`;
            const buttonId = `faq-button-${i}`;
            return (
              <div key={item.q}>
                <button
                  id={buttonId}
                  type="button"
                  className="flex min-h-12 w-full items-center justify-between gap-4 py-5 text-left transition-colors hover:text-[#16345A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6D8C]/50 focus-visible:ring-offset-2"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                >
                  <span
                    className={`${FONT_DISPLAY} text-[15px] font-semibold tracking-[-0.01em] text-[#0B1F3A] sm:text-base`}
                  >
                    {item.q}
                  </span>
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300/90 text-slate-500 transition-all duration-300 ease-out ${
                      isOpen
                        ? "rotate-45 border-[#3B6D8C]/45 bg-[#F3F5F7] text-[#3B6D8C]"
                        : ""
                    }`}
                    aria-hidden="true"
                  >
                    +
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={panelId}
                      role="region"
                      aria-labelledby={buttonId}
                      initial={
                        reduce ? false : { height: 0, opacity: 0 }
                      }
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: EASE_OUT }}
                      className="overflow-hidden"
                    >
                      <p className="pb-6 pr-12 text-[15px] leading-[1.72] text-slate-600">
                        {item.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
