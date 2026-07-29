"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useLandingReduceMotion } from "./useLandingReduceMotion";
import {
  fadeUp,
  staggerContainer,
  revealImage,
  SECTION_EYEBROW,
  SECTION_TITLE,
  SECTION_BODY,
  SECTION_PAD,
  CONTAINER,
  FONT_DISPLAY,
  VIEWPORT,
} from "./motion";

const STEPS = [
  {
    step: "01",
    title: "Capture on site",
    body: "Photos, moisture readings, voice notes, and floor plans — structured for the driveway, not the desktop. Evidence stays tied to the job from the first visit.",
  },
  {
    step: "02",
    title: "Finish the report",
    body: "IICRC S500:2021-aligned report drafts take shape in minutes from what you captured. You review, edit, and own every decision before it leaves your company.",
  },
  {
    step: "03",
    title: "Client approves",
    body: "Share professional PDFs, GST-ready invoices, and approvals through the client portal — so homeowners and insurers get clarity without retyping.",
  },
] as const;

/**
 * Workflow — centered story + horizontal three-step process + wide photo band.
 * Breaks the split-pane pattern used previously.
 */
export function WorkflowSection() {
  const reduce = useLandingReduceMotion();

  return (
    <section
      className={`relative bg-white ${SECTION_PAD}`}
      aria-labelledby="workflow-heading"
    >
      <div className={CONTAINER}>
        <motion.div
          variants={staggerContainer}
          initial={reduce ? false : "hidden"}
          whileInView="visible"
          viewport={VIEWPORT}
          className="mx-auto max-w-2xl text-center"
        >
          <motion.p variants={fadeUp} className={SECTION_EYEBROW}>
            Remove double-handling
          </motion.p>
          <motion.h2
            id="workflow-heading"
            variants={fadeUp}
            className={SECTION_TITLE}
          >
            Field, office, and client — connected end to end
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className={`${SECTION_BODY} mx-auto text-center`}
          >
            Inspection to scope to report to invoice. One restoration CRM so
            nothing gets lost between the driveway and the desk — and your team
            stops rebuilding the same paperwork on every claim.
          </motion.p>
        </motion.div>

        {/* Horizontal process — open columns, not boxed cards */}
        <motion.ol
          variants={staggerContainer}
          initial={reduce ? false : "hidden"}
          whileInView="visible"
          viewport={VIEWPORT}
          className="relative mt-16 grid gap-10 sm:mt-20 sm:gap-8 lg:grid-cols-3 lg:gap-0"
        >
          {/* Connecting rule — desktop only */}
          <div
            className="pointer-events-none absolute top-[1.15rem] right-[16%] left-[16%] hidden h-px bg-slate-200 lg:block"
            aria-hidden
          />

          {STEPS.map((item) => (
            <motion.li
              key={item.step}
              variants={fadeUp}
              className="relative px-0 text-center lg:px-8"
            >
              <span
                className={`${FONT_DISPLAY} relative z-10 mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold tabular-nums tracking-tight text-[#3B6D8C]`}
              >
                {item.step}
              </span>
              <h3
                className={`${FONT_DISPLAY} mt-5 text-lg font-semibold tracking-[-0.015em] text-[#0B1F3A] sm:text-xl`}
              >
                {item.title}
              </h3>
              <p className="mx-auto mt-3 max-w-sm text-[15px] leading-[1.72] text-slate-600">
                {item.body}
              </p>
            </motion.li>
          ))}
        </motion.ol>

        {/* Wide photographic band — different pattern from hero overlay */}
        <motion.div
          variants={revealImage}
          initial={reduce ? false : "hidden"}
          whileInView="visible"
          viewport={VIEWPORT}
          className="relative mt-16 aspect-[21/9] min-h-[14rem] overflow-hidden rounded-2xl border border-slate-200/90 shadow-[0_12px_40px_rgba(15,23,42,0.06)] sm:mt-20 sm:min-h-[16rem] lg:mt-24"
        >
          <Image
            src="/landing/field-capture.jpg"
            alt="Restoration technician measuring and documenting conditions on a job site"
            fill
            sizes="(max-width: 1280px) 100vw, 80rem"
            className="object-cover object-center"
          />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#F3F5F7]/95 via-[#F3F5F7]/20 to-transparent"
            aria-hidden
          />
          <p
            className={`${FONT_DISPLAY} absolute inset-x-0 bottom-0 px-5 py-5 text-sm font-semibold tracking-tight text-[#0B1F3A] sm:px-8 sm:py-6 sm:text-base`}
          >
            Built for the driveway — not just the desktop.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
