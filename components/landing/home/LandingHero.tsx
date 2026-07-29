"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
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
} from "./motion";

const TRUST = [
  "IICRC S500:2021",
  "NCC 2022",
  "WHS built-in",
  "Australian-designed",
  "Australia + New Zealand",
] as const;

/**
 * Daylight Workshop hero — full-bleed photo plane.
 * Brand · headline · support · CTAs sit in a mist wash over the image.
 * Trust strip sits on a paper band below the first composition.
 */
export function LandingHero() {
  const reduce = useReducedMotion();

  return (
    <section className="relative pt-[4.25rem]">
      {/* Full-bleed photographic plane */}
      <div className="relative min-h-[min(92dvh,56rem)] overflow-hidden">
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0"
        >
          <Image
            src="/landing/hero-workshop.jpg"
            alt="Daylight restoration workshop with tools and equipment ready for the next job"
            fill
            priority
            sizes="100vw"
            className="object-cover object-[center_40%]"
          />
        </motion.div>

        {/* Daylight mist wash — readable copy without a dark theme */}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#F3F5F7] via-[#F3F5F7]/92 to-[#F3F5F7]/25 sm:via-[#F3F5F7]/88 sm:to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#F3F5F7] via-transparent to-[#F3F5F7]/50"
          aria-hidden
        />

        <div className="relative mx-auto flex min-h-[min(92dvh,56rem)] max-w-7xl flex-col justify-center px-5 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
          <motion.div
            variants={staggerContainer}
            initial={reduce ? false : "hidden"}
            animate="visible"
            className="max-w-[36rem]"
          >
            <motion.p
              variants={fadeUp}
              className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#3B6D8C]"
            >
              {BRAND.tagline}
            </motion.p>

            <motion.h1
              variants={fadeUp}
              className={`${FONT_DISPLAY} mt-6 text-[2.85rem] font-bold leading-[0.98] tracking-[-0.035em] text-[#0B1F3A] sm:text-[3.75rem] lg:text-[4.15rem]`}
            >
              {BRAND.name}
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className={`${FONT_DISPLAY} mt-6 text-[1.35rem] font-semibold leading-[1.25] tracking-[-0.02em] text-slate-800 sm:text-[1.65rem]`}
            >
              From site to signed report. One system.
            </motion.p>

            <motion.p
              variants={fadeUp}
              className="mt-5 max-w-[32rem] text-[15px] leading-[1.75] text-slate-600 sm:text-[16.5px]"
            >
              {BRAND.slogan} The Australian-designed restoration CRM for office
              and field — capture evidence on site, finish IICRC-aligned
              paperwork in the office, and get client approvals without
              rewriting the same job twice.
            </motion.p>

            <motion.div
              variants={fadeUp}
              className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <Link href={BRAND.cta.primary.href} className={CTA_PRIMARY}>
                Start free — 3 trial reports
              </Link>
              <Link href={BRAND.cta.secondary.href} className={CTA_SECONDARY}>
                See how it works
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Paper trust band — below the hero composition */}
      <div className="border-y border-slate-200/90 bg-white">
        <motion.ul
          variants={staggerFast}
          initial={reduce ? false : "hidden"}
          whileInView="visible"
          viewport={VIEWPORT}
          className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-5 sm:px-6 lg:px-8"
          aria-label="Compliance standards and coverage"
        >
          {TRUST.map((item) => (
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
