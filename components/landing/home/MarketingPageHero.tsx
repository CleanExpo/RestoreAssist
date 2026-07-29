"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  fadeUp,
  staggerContainer,
  FONT_DISPLAY,
  SECTION_EYEBROW,
  CONTAINER,
} from "./motion";

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
};

/**
 * Shared page hero for marketing routes — daylight, calm, no chrome clutter.
 */
export function MarketingPageHero({
  eyebrow,
  title,
  description,
  align = "left",
}: Props) {
  const reduce = useReducedMotion();
  const centered = align === "center";

  return (
    <section className="border-b border-slate-200/90 bg-[#F3F5F7]">
      <div
        className={`${CONTAINER} py-16 sm:py-20 lg:py-24 ${centered ? "text-center" : ""}`}
      >
        <motion.div
          variants={staggerContainer}
          initial={reduce ? false : "hidden"}
          animate="visible"
          className={centered ? "mx-auto max-w-3xl" : "max-w-3xl"}
        >
          {eyebrow ? (
            <motion.p variants={fadeUp} className={SECTION_EYEBROW}>
              {eyebrow}
            </motion.p>
          ) : null}
          <motion.h1
            variants={fadeUp}
            className={`${FONT_DISPLAY} ${eyebrow ? "mt-4" : ""} text-[2.35rem] font-semibold leading-[1.1] tracking-[-0.03em] text-[#0B1F3A] sm:text-[3rem] lg:text-[3.35rem]`}
          >
            {title}
          </motion.h1>
          {description ? (
            <motion.p
              variants={fadeUp}
              className={`mt-5 text-[15px] leading-[1.75] text-slate-600 sm:text-[17px] sm:leading-[1.75] ${centered ? "mx-auto max-w-2xl" : "max-w-2xl"}`}
            >
              {description}
            </motion.p>
          ) : null}
        </motion.div>
      </div>
    </section>
  );
}
