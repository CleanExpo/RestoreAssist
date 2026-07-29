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
 * Problem first → RestoreAssist answers → support → CTAs.
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
            className="max-w-[40rem]"
          >
            {/* Problem context — quiet opener */}
            <motion.div
              variants={fadeUp}
              className="flex items-center gap-3"
            >
              <span
                className="h-px w-8 shrink-0 bg-[#3B6D8C]/70 sm:w-10"
                aria-hidden
              />
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#3B6D8C]">
                {BRAND.tagline}
              </p>
            </motion.div>

            {/* Problem first — the pain restoration teams feel */}
            <motion.h1
              variants={fadeUp}
              className={`${FONT_DISPLAY} mt-8 text-[2.35rem] font-semibold leading-[1.08] tracking-[-0.035em] text-[#0B1F3A] sm:mt-9 sm:text-[3.15rem] sm:leading-[1.05] lg:text-[3.5rem] lg:leading-[1.04]`}
            >
              Still rewriting the same job between the driveway and the desk?
            </motion.h1>

            {/* Brand answers — RestoreAssist as the system */}
            <motion.p
              variants={fadeUp}
              className={`${FONT_DISPLAY} mt-8 text-[1.85rem] font-semibold leading-none tracking-[-0.03em] text-[#0B1F3A] sm:mt-9 sm:text-[2.35rem]`}
            >
              {BRAND.name}
            </motion.p>

            <motion.p
              variants={fadeUp}
              className={`${FONT_DISPLAY} mt-4 text-[1.2rem] font-medium leading-[1.3] tracking-[-0.02em] text-[#16345A] sm:text-[1.4rem] sm:leading-[1.28]`}
            >
              From site to signed report. One system.
            </motion.p>

            {/* Spine slogan */}
            <motion.p
              variants={fadeUp}
              className={`${FONT_DISPLAY} mt-7 border-l-2 border-[#3B6D8C]/45 pl-4 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-[#0B1F3A] sm:mt-8 sm:pl-5 sm:text-base`}
            >
              {BRAND.slogan}
            </motion.p>

            {/* Support */}
            <motion.p
              variants={fadeUp}
              className="mt-5 max-w-[34rem] text-[15px] font-normal leading-[1.8] text-slate-600 sm:mt-6 sm:text-[16.5px] sm:leading-[1.8]"
            >
              The Australian-designed restoration CRM for office and field —
              capture evidence on site, finish IICRC-aligned paperwork in the
              office, and get client approvals without rewriting the same job
              twice.
            </motion.p>

            <motion.div
              variants={fadeUp}
              className="mt-10 flex flex-col gap-3 sm:mt-11 sm:flex-row sm:items-center sm:gap-3.5"
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
