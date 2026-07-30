"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { BRAND } from "@/lib/brand";
import {
  CTA_PRIMARY,
  CTA_SECONDARY,
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
 * Home 1 hero — "Dawn Split"
 * Left: mist paper typography plane. Right: full-height photographic plane.
 * Not a card, not a centered stack — an asymmetric first composition.
 */
export function LandingHero() {
  const reduce = useLandingReduceMotion();

  return (
    <section className="relative pt-[4.25rem]">
      <div className="relative min-h-[min(92dvh,56rem)] overflow-hidden bg-[#F3F5F7]">
        {/* Photographic plane — right half on desktop, full bleed under wash on mobile */}
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 1.06 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: EASE_OUT }}
          className="absolute inset-0 lg:left-[46%]"
        >
          <Image
            src="/landing/hero-workshop.jpg"
            alt="Daylight restoration workshop with tools and equipment ready for the next job"
            fill
            priority
            sizes="(min-width: 1024px) 54vw, 100vw"
            className="object-cover object-[center_38%]"
          />
          {/* Soft edge into mist on desktop */}
          <div
            className="pointer-events-none absolute inset-y-0 left-0 hidden w-32 bg-gradient-to-r from-[#F3F5F7] to-transparent lg:block"
            aria-hidden
          />
          {/* Mobile readability wash */}
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#F3F5F7] via-[#F3F5F7]/88 to-[#F3F5F7]/35 lg:hidden"
            aria-hidden
          />
        </motion.div>

        {/* Quiet atmospheric grain on mist side */}
        <div
          className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(ellipse_80%_60%_at_10%_40%,rgba(59,109,140,0.07),transparent_55%)] lg:block"
          aria-hidden
        />

        <div
          className={`${CONTAINER} relative grid min-h-[min(92dvh,56rem)] items-center py-20 sm:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:py-28`}
        >
          <motion.div
            variants={staggerContainer}
            initial={reduce ? false : "hidden"}
            animate="visible"
            className="relative z-10 max-w-[38rem] lg:pr-8"
          >
            <motion.p
              variants={fadeUp}
              className={`${FONT_DISPLAY} text-[15px] font-semibold tracking-[-0.01em] text-[#0B1F3A] sm:text-base`}
            >
              {HOME.hero.brand}
            </motion.p>

            <motion.div
              variants={fadeUp}
              className="mt-5 flex items-center gap-3"
            >
              <span
                className="h-px w-10 shrink-0 bg-[#3B6D8C]/80"
                aria-hidden
              />
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#3B6D8C]">
                {HOME.hero.eyebrow}
              </p>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className={`${FONT_DISPLAY} mt-6 text-[clamp(2rem,5vw,3.35rem)] font-bold leading-[1.06] tracking-[-0.035em] text-[#0B1F3A]`}
            >
              {HOME.hero.headline}
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className={`${FONT_DISPLAY} mt-6 text-[1.15rem] font-medium leading-snug tracking-[-0.02em] text-[#16345A] sm:text-[1.3rem]`}
            >
              {HOME.hero.valueLine}
            </motion.p>

            <motion.p
              variants={fadeUp}
              className="mt-5 max-w-[30rem] text-[15px] leading-[1.75] text-slate-600 sm:text-[16px]"
            >
              {HOME.hero.support}
            </motion.p>

            <motion.div
              variants={fadeUp}
              className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <Link href={BRAND.cta.primary.href} className={CTA_PRIMARY}>
                {HOME.hero.primaryCta}
              </Link>
              <Link href={BRAND.cta.secondary.href} className={CTA_SECONDARY}>
                {HOME.hero.secondaryCta}
              </Link>
            </motion.div>
          </motion.div>

          {/* Desktop spacer keeps photo plane readable */}
          <div className="hidden lg:block" aria-hidden />
        </div>
      </div>

      {/* Trust — hairline paper rail */}
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
