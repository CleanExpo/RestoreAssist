"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  fadeUpSoft,
  staggerContainer,
  staggerFast,
  SECTION_EYEBROW,
  SECTION_TITLE,
  SECTION_BODY,
  SECTION_PAD,
  CONTAINER,
  FONT_DISPLAY,
  SURFACE,
  VIEWPORT,
  HAIRLINE,
} from "./motion";

const STATES = [
  "NSW",
  "VIC",
  "QLD",
  "WA",
  "SA",
  "TAS",
  "ACT",
  "NT",
  "NZ",
] as const;

export function StatesSection() {
  const reduce = useReducedMotion();

  return (
    <section
      className={`relative bg-[#F3F5F7] ${HAIRLINE} ${SECTION_PAD}`}
      aria-labelledby="coverage-heading"
    >
      <div className={CONTAINER}>
        <motion.div
          variants={staggerContainer}
          initial={reduce ? false : "hidden"}
          whileInView="visible"
          viewport={VIEWPORT}
          className={`${SURFACE} overflow-hidden p-8 sm:p-10 lg:p-14`}
        >
          <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-16">
            <div>
              <p className={SECTION_EYEBROW}>Australia &amp; New Zealand</p>
              <h2 id="coverage-heading" className={SECTION_TITLE}>
                Designed in Australia.
                <span
                  className={`${FONT_DISPLAY} mt-3 block text-[1.35rem] font-medium leading-snug tracking-[-0.015em] text-slate-600 sm:text-2xl`}
                >
                  Deployed across Australia and New Zealand.
                </span>
              </h2>
              <p className={SECTION_BODY}>
                State codes, GST, and jurisdictional references are built into
                the workflow — so restoration software for Queensland works the
                same way as New South Wales, without rewriting your process for
                every border you cross.
              </p>
            </div>
            <motion.ul
              variants={staggerFast}
              className="grid grid-cols-3 gap-2.5"
              aria-label="States and regions covered"
            >
              {STATES.map((s) => (
                <motion.li
                  key={s}
                  variants={fadeUpSoft}
                  className={`${FONT_DISPLAY} flex min-h-12 items-center justify-center rounded-xl border border-slate-200/90 bg-[#F3F5F7] text-sm font-semibold tabular-nums tracking-wide text-[#0B1F3A] transition-[background-color,border-color,box-shadow] duration-200 hover:border-[#3B6D8C]/35 hover:bg-white hover:shadow-[0_1px_3px_rgba(15,23,42,0.05)]`}
                >
                  {s}
                </motion.li>
              ))}
            </motion.ul>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
