"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  fadeUp,
  staggerContainer,
  SECTION_EYEBROW,
  SECTION_TITLE,
  SECTION_BODY,
  SECTION_PAD,
  CONTAINER,
  FONT_DISPLAY,
  VIEWPORT,
  HAIRLINE,
} from "./motion";

const FEATURES = [
  {
    title: "Reports that hold up at audit",
    body: "Produce S500:2021-aligned report drafts that cut hours of writing. Every document stays under your review — professional judgement never leaves the operator.",
  },
  {
    title: "Invoices that reconcile cleanly",
    body: "Variations, discounts, and professional PDF invoices that reconcile cleanly for Australian and New Zealand jobs — without spreadsheet rework.",
  },
  {
    title: "Capture on site — even offline",
    body: "Evidence, moisture readings, sketches, and voice notes capture on site even without signal — then sync when you are back online.",
  },
  {
    title: "Fewer chase-ups with homeowners",
    body: "Give homeowners a clear path to track progress, approve scopes, and download documents — fewer phone chases, faster sign-off.",
  },
  {
    title: "Compliance inside the workflow",
    body: "IICRC, WHS, and NCC 2022 references live inside the workflow so standards guide the job instead of living in a separate folder.",
  },
  {
    title: "Office and field on the same job",
    body: "Roles, handoffs, and shared jobs keep field technicians and the office aligned on the same claim — from first visit to final invoice.",
  },
] as const;

export function BentoFeatures() {
  const reduce = useReducedMotion();

  return (
    <section
      className={`relative bg-white ${HAIRLINE} ${SECTION_PAD}`}
      aria-labelledby="platform-heading"
    >
      <div className={CONTAINER}>
        <motion.div
          variants={staggerContainer}
          initial={reduce ? false : "hidden"}
          whileInView="visible"
          viewport={VIEWPORT}
          className="max-w-[38rem]"
        >
          <motion.p variants={fadeUp} className={SECTION_EYEBROW}>
            Restoration CRM platform
          </motion.p>
          <motion.h2
            id="platform-heading"
            variants={fadeUp}
            className={SECTION_TITLE}
          >
            Everything the job needs — without the gaps
          </motion.h2>
          <motion.p variants={fadeUp} className={SECTION_BODY}>
            Built for Australian restoration companies that need compliance
            depth and field speed in the same product. From moisture logs to
            insurer-ready paperwork, RestoreAssist keeps office and field on one
            system.
          </motion.p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial={reduce ? false : "hidden"}
          whileInView="visible"
          viewport={VIEWPORT}
          className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-200/60 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:grid-cols-2 lg:mt-16 lg:grid-cols-3"
        >
          {FEATURES.map((f, i) => (
            <motion.article
              key={f.title}
              variants={fadeUp}
              className="group relative bg-white p-7 sm:p-8 lg:p-9"
            >
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent to-[#F3F5F7]/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                aria-hidden
              />
              <div className="relative">
                <p className="text-[11px] font-semibold tabular-nums tracking-[0.16em] text-[#3B6D8C]/85">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3
                  className={`${FONT_DISPLAY} mt-3.5 text-lg font-semibold tracking-[-0.015em] text-[#0B1F3A] transition-colors duration-200 group-hover:text-[#16345A] sm:text-[1.2rem]`}
                >
                  {f.title}
                </h3>
                <p className="mt-3 text-[15px] leading-[1.72] text-slate-600">
                  {f.body}
                </p>
              </div>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
