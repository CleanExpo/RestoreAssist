"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { BRAND } from "@/lib/brand";
import {
  CTA_ON_DARK_PRIMARY,
  CTA_ON_DARK_SECONDARY,
  FONT_DISPLAY,
  fadeUp,
  fadeUpSoft,
  staggerContainer,
  staggerFast,
  VIEWPORT,
  CONTAINER,
  EASE_OUT,
} from "./motion";
import { useLandingReduceMotion } from "./useLandingReduceMotion";
import { HOME } from "./homeContent";

/**
 * Home 1 hero — full-bleed water damage inspection photography.
 * Soft left wash keeps headline/CTA readable over the kitchen scene.
 */
export function LandingHero() {
  const reduce = useLandingReduceMotion();

  return (
    <section className="relative pt-[4.25rem]">
      <div className="relative min-h-[min(92dvh,56rem)] overflow-hidden bg-[#0B1F3A]">
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 1.06 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: EASE_OUT }}
          className="absolute inset-0"
        >
          <Image
            src="/landing/hero-water-inspection.jpg"
            alt="RestoreAssist technician extracting floodwater from a water-filled home during active restoration"
            fill
            priority
            sizes="100vw"
            className="object-cover object-[42%_55%]"
          />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0B1F3A]/90 via-[#0B1F3A]/50 to-[#0B1F3A]/20 sm:via-[#0B1F3A]/42 sm:to-transparent"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/65 via-transparent to-[#0B1F3A]/30"
            aria-hidden
          />
        </motion.div>

        <div
          className={`${CONTAINER} relative grid min-h-[min(92dvh,56rem)] items-center py-20 sm:py-24 lg:py-28`}
        >
          <motion.div
            variants={staggerContainer}
            initial={reduce ? false : "hidden"}
            animate="visible"
            className="relative z-10 max-w-[38rem]"
          >
            <motion.p
              variants={fadeUp}
              className={`${FONT_DISPLAY} text-[15px] font-semibold tracking-[-0.01em] text-white sm:text-base`}
            >
              {HOME.hero.brand}
            </motion.p>

            <motion.div
              variants={fadeUp}
              className="mt-5 flex items-center gap-3"
            >
              <span
                className="h-px w-10 shrink-0 bg-[#7BA3BD]/90"
                aria-hidden
              />
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#A8C5D8]">
                {HOME.hero.eyebrow}
              </p>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className={`${FONT_DISPLAY} mt-6 text-[clamp(2rem,5vw,3.35rem)] font-bold leading-[1.06] tracking-[-0.035em] text-white`}
            >
              {HOME.hero.headline}
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className={`${FONT_DISPLAY} mt-6 text-[1.15rem] font-medium leading-snug tracking-[-0.02em] text-white/90 sm:text-[1.3rem]`}
            >
              {HOME.hero.valueLine}
            </motion.p>

            <motion.p
              variants={fadeUp}
              className="mt-5 max-w-[30rem] text-[15px] leading-[1.75] text-white/75 sm:text-[16px]"
            >
              {HOME.hero.support}
            </motion.p>

            <motion.div
              variants={fadeUp}
              className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <Link
                href={BRAND.cta.primary.href}
                className={CTA_ON_DARK_PRIMARY}
              >
                {HOME.hero.primaryCta}
              </Link>
              <Link
                href={BRAND.cta.secondary.href}
                className={CTA_ON_DARK_SECONDARY}
              >
                {HOME.hero.secondaryCta}
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </div>

      <div className="border-y border-slate-200/90 bg-white">
        <motion.ul
          variants={staggerFast}
          initial={reduce ? false : "hidden"}
          whileInView="visible"
          viewport={VIEWPORT}
          className={`${CONTAINER} flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-5`}
          aria-label="Compliance standards and coverage"
        >
          {HOME.trust.map((item) => (
            <motion.li
              key={item}
              variants={fadeUpSoft}
              className="flex items-center gap-2.5 text-[12px] font-medium tracking-[0.02em] text-slate-500"
            >
              <span
                className="h-1 w-1 shrink-0 rounded-full bg-[#3B6D8C]"
                aria-hidden
              />
              {item}
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
