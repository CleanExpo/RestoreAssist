"use client";

import { motion } from "framer-motion";
import { useLandingReduceMotion } from "./useLandingReduceMotion";
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

const BEFORE = [
  "Field notes on paper or phone",
  "Office retypes the same details",
  "Reports rebuilt from scratch",
  "Invoices and approvals chase by email",
] as const;

const AFTER = [
  "Capture once on site",
  "Evidence stays on the job",
  "IICRC-aligned reports from the same record",
  "Client approvals in one portal",
] as const;

/**
 * Before / after — makes the double-handling problem visible.
 * Open editorial columns, not heavy dashboard cards.
 */
export function BeforeAfterSection() {
  const reduce = useLandingReduceMotion();

  return (
    <section
      className={`relative bg-[#F3F5F7] ${HAIRLINE} ${SECTION_PAD}`}
      aria-labelledby="before-after-heading"
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
            The double-handling problem
          </motion.p>
          <motion.h2
            id="before-after-heading"
            variants={fadeUp}
            className={SECTION_TITLE}
          >
            Same job. Two systems. Too many gaps.
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className={`${SECTION_BODY} mx-auto text-center`}
          >
            Most restoration teams still move work from the driveway to the
            desk by hand. RestoreAssist keeps one record from capture to
            client approval — so nothing gets rewritten along the way.
          </motion.p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial={reduce ? false : "hidden"}
          whileInView="visible"
          viewport={VIEWPORT}
          className="mt-14 grid gap-8 lg:mt-16 lg:grid-cols-2 lg:gap-10"
        >
          <motion.div
            variants={fadeUp}
            className="rounded-2xl border border-slate-200/90 bg-white/70 p-7 sm:p-8"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Before
            </p>
            <h3
              className={`${FONT_DISPLAY} mt-3 text-xl font-semibold tracking-[-0.015em] text-[#0B1F3A]`}
            >
              Scattered tools. Repeated work.
            </h3>
            <ul className="mt-6 space-y-4">
              {BEFORE.map((item) => (
                <li
                  key={item}
                  className="flex gap-3 text-[15px] leading-[1.55] text-slate-600"
                >
                  <span
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300"
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="rounded-2xl border border-[#0B1F3A]/12 bg-white p-7 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-8"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#3B6D8C]">
              With RestoreAssist
            </p>
            <h3
              className={`${FONT_DISPLAY} mt-3 text-xl font-semibold tracking-[-0.015em] text-[#0B1F3A]`}
            >
              One system. Fewer gaps.
            </h3>
            <ul className="mt-6 space-y-4">
              {AFTER.map((item) => (
                <li
                  key={item}
                  className="flex gap-3 text-[15px] leading-[1.55] text-slate-700"
                >
                  <span
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#3B6D8C]"
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
