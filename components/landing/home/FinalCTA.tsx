"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useLandingReduceMotion } from "./useLandingReduceMotion";
import { BRAND } from "@/lib/brand";
import { HOME } from "./homeContent";
import {
  CTA_PRIMARY,
  CTA_SECONDARY,
  fadeUp,
  fadeUpSoft,
  staggerContainer,
  staggerFast,
  SECTION_EYEBROW,
  FONT_DISPLAY,
  SECTION_PAD,
  VIEWPORT,
  HAIRLINE,
  CONTAINER,
} from "./motion";

export function FinalCTA() {
  const reduce = useLandingReduceMotion();
  const { cta } = HOME;

  return (
    <section
      className={`relative overflow-hidden bg-[#F3F5F7] ${HAIRLINE} ${SECTION_PAD}`}
      aria-labelledby="cta-heading"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(59,109,140,0.09),transparent_70%)]"
        aria-hidden
      />
      <div className={`${CONTAINER} relative text-center`}>
        <div className="mx-auto max-w-3xl">
          <motion.div
            variants={staggerContainer}
            initial={reduce ? false : "hidden"}
            whileInView="visible"
            viewport={VIEWPORT}
          >
            <motion.p variants={fadeUp} className={SECTION_EYEBROW}>
              {cta.eyebrow}
            </motion.p>
            <motion.h2
              id="cta-heading"
              variants={fadeUp}
              className={`${FONT_DISPLAY} mt-4 text-[1.9rem] font-semibold leading-[1.12] tracking-[-0.02em] text-[#0B1F3A] sm:text-[2.35rem] lg:text-[2.85rem] lg:leading-[1.08]`}
            >
              {cta.title}
            </motion.h2>
            <motion.p
              variants={fadeUp}
              className={`${FONT_DISPLAY} mx-auto mt-4 max-w-xl text-[15px] font-semibold leading-snug tracking-[-0.01em] text-[#16345A] sm:text-base`}
            >
              {cta.slogan}
            </motion.p>
            <motion.p
              variants={fadeUp}
              className="mx-auto mt-4 max-w-xl text-[15px] leading-[1.72] text-slate-600 sm:text-[17px]"
            >
              {cta.body}
            </motion.p>
            <motion.div
              variants={fadeUp}
              className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
            >
              <Link href={BRAND.cta.primary.href} className={CTA_PRIMARY}>
                {cta.primaryCta}
              </Link>
              <Link href="/pricing" className={CTA_SECONDARY}>
                {cta.secondaryCta}
              </Link>
            </motion.div>
            <motion.ul
              variants={staggerFast}
              className="mt-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-3"
            >
              {cta.reassurances.map((r) => (
                <motion.li
                  key={r}
                  variants={fadeUpSoft}
                  className="flex items-center gap-2.5 text-sm text-slate-500"
                >
                  <span
                    className="h-1 w-1 rounded-full bg-[#3B6D8C]"
                    aria-hidden
                  />
                  {r}
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
