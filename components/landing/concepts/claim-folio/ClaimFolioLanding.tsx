"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import { BRAND } from "@/lib/brand";
import { ChromeCheck } from "@/components/brand/chrome-icons";
import { HOME, getHomeFaqs } from "@/components/landing/home/homeContent";
import { LandingOverviewVideo } from "@/components/landing/home/LandingOverviewVideo";
import {
  CTA_PRIMARY,
  CTA_SECONDARY,
  FONT_DISPLAY,
  CONTAINER,
  EASE_OUT,
  VIEWPORT,
} from "@/components/landing/home/motion";
import { useLandingReduceMotion } from "@/components/landing/home/useLandingReduceMotion";
import { useRevealArmed } from "@/components/landing/home/useRevealArmed";

/**
 * Folio index. `label` is the visual numeral; `title` is the accessible name —
 * the link text is the numeral alone, so without it a screen reader announces
 * "01" and nothing else.
 */
const SECTIONS = [
  { id: "overview", label: "01", title: "Product overview" },
  { id: "stance", label: "02", title: "What we build for" },
  { id: "workflow", label: "03", title: "How the workflow runs" },
  { id: "gaps", label: "04", title: "The double-handling problem" },
  { id: "platform", label: "05", title: "Platform capabilities" },
  { id: "damage", label: "06", title: "Damage types covered" },
  { id: "coverage", label: "07", title: "Australia and New Zealand coverage" },
  { id: "positioning", label: "08", title: "Who we answer to" },
  { id: "faq", label: "09", title: "Frequently asked questions" },
  { id: "start", label: "10", title: "Start with real work" },
] as const;

/**
 * Home 2 — Claim Spine
 * Full-bleed water-inspection photography with claim folio index.
 * Ruled typography, oversized numerals, continuous left spine.
 */
export function ClaimFolioLanding() {
  const reduce = useLandingReduceMotion();
  const armed = useRevealArmed();
  const motionHidden = armed && !reduce;
  const faqs = getHomeFaqs();
  const [faqOpen, setFaqOpen] = useState(0);
  const [active, setActive] = useState("overview");
  const { scrollYProgress } = useScroll();
  const spineHeight = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      Boolean,
    ) as HTMLElement[];
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActive(visible.target.id);
      },
      { rootMargin: "-35% 0px -45% 0px", threshold: [0.1, 0.35, 0.6] },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <div className="relative bg-[#F0F3F6] text-brand-navy">
      {/* Continuous claim spine */}
      <div
        className="pointer-events-none fixed top-[4.25rem] bottom-0 left-[max(0.75rem,calc((100vw-80%)/2-0.5rem))] z-40 hidden w-px lg:block"
        aria-hidden
      >
        <div className="absolute inset-0 bg-brand-navy/10" />
        <motion.div
          className="absolute top-0 left-0 w-px origin-top bg-brand-harbour"
          style={{ height: reduce ? "100%" : spineHeight }}
        />
      </div>

      {/* Folio index — desktop. It floats over light and navy sections, and no
          single text colour reaches 4.5:1 on both, so it carries its own light
          backing (RA-4868). */}
      <nav
        className="fixed top-1/2 right-[max(1rem,calc((100vw-80%)/2-3.5rem))] z-40 hidden -translate-y-1/2 flex-col gap-1 rounded-lg bg-white/85 p-1 backdrop-blur-sm xl:flex"
        aria-label="Page sections"
      >
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            aria-label={s.title}
            aria-current={active === s.id ? "true" : undefined}
            className={`font-[family-name:var(--font-landing-display)] rounded px-2 py-1.5 text-[10px] font-bold tracking-[0.14em] transition-colors ${
              active === s.id
                ? "text-brand-harbour"
                : "text-slate-600 hover:text-brand-navy"
            }`}
          >
            {s.label}
          </a>
        ))}
      </nav>

      {/* ── HERO: full-bleed water inspection photography ── */}
      <section className="relative min-h-[100dvh] overflow-hidden pt-[4.25rem]">
        <motion.div
          initial={motionHidden ? { scale: 1.08, opacity: 0.55 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.5, ease: EASE_OUT }}
          className="absolute inset-0"
        >
          <Image
            src="/landing/hero-flooded-home.avif"
            alt="Restoration technician photographing a moisture meter reading on a water-stained wall, with air movers and a dehumidifier drying an Australian home"
            fill
            priority
            sizes="100vw"
            className="object-cover object-[72%_55%]"
          />
        </motion.div>

        {/* Asymmetric readability — photo unchanged; light sculpts left column + base */}
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(108deg,rgba(244,247,250,0.96)_0%,rgba(244,247,250,0.9)_38%,rgba(244,247,250,0.5)_58%,rgba(244,247,250,0.1)_72%,transparent_88%)] dark:bg-[linear-gradient(108deg,rgba(11,31,58,0.94)_0%,rgba(11,31,58,0.88)_38%,rgba(11,31,58,0.45)_58%,rgba(11,31,58,0.08)_72%,transparent_88%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-brand-cloud/70 lg:bg-transparent lg:bg-gradient-to-t lg:from-brand-cloud/80 lg:via-transparent lg:to-transparent dark:bg-transparent dark:bg-gradient-to-t dark:from-brand-navy/85 dark:via-transparent dark:to-brand-navy/30"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-full max-w-[min(100%,52rem)] bg-gradient-to-r from-brand-cloud/30 to-transparent lg:max-w-[46rem] dark:from-brand-navy/25"
          aria-hidden
        />

        <div
          className={`${CONTAINER} relative grid min-h-[calc(100dvh-4.25rem)] grid-cols-1 items-end pb-[5.5rem] pt-10 sm:pb-[5.25rem] sm:pt-12 lg:grid-cols-12 lg:items-end lg:pb-24 lg:pt-16`}
        >
          <motion.div
            initial={motionHidden ? { opacity: 0, y: 20 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.08 }}
            className="relative z-10 lg:col-span-7 xl:col-span-6"
          >
            <div className="relative pl-5 sm:pl-6 lg:pl-10 lg:before:absolute lg:before:bottom-0 lg:before:left-0 lg:before:top-0 lg:before:w-px lg:before:bg-brand-navy/15 lg:before:content-[''] dark:lg:before:bg-white/20">
              <div className="flex items-baseline gap-4 lg:gap-5">
                <span
                  className={`${FONT_DISPLAY} hidden text-[11px] font-bold tabular-nums tracking-tight text-brand-steel sm:inline dark:text-[#7BA3BD]`}
                  aria-hidden
                >
                  00
                </span>
                <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-brand-cta dark:text-[#A8C5D8]">
                  {HOME.hero.eyebrow}
                </p>
              </div>

              <h1
                className={`${FONT_DISPLAY} mt-5 max-w-[19ch] text-balance text-[clamp(2.05rem,6.2vw,3.65rem)] font-bold leading-[1.04] tracking-[-0.045em] text-brand-navy dark:text-white sm:mt-6 sm:max-w-[22ch] lg:mt-7 lg:max-w-[16ch] lg:text-[clamp(2.5rem,3.6vw,3.75rem)] lg:leading-[1.03]`}
              >
                {HOME.hero.headline}
              </h1>

              <p className="mt-5 max-w-[34rem] text-[15px] leading-[1.68] text-brand-slate dark:text-white/86 sm:mt-6 sm:text-[16px] sm:leading-[1.72] lg:max-w-[28rem] lg:text-[17px]">
                {HOME.hero.lead}
              </p>

              <div className="mt-8 flex flex-col gap-4 sm:mt-10 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-3">
                <Link
                  href={BRAND.cta.primary.href}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-cta px-8 py-3.5 text-[15px] font-semibold tracking-tight text-white shadow-[0_12px_40px_rgba(11,31,58,0.2)] transition-[transform,box-shadow,background-color] duration-200 ease-out hover:bg-brand-cta-hover hover:shadow-[0_16px_48px_rgba(11,31,58,0.28)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-harbour focus-visible:ring-offset-2 focus-visible:ring-offset-brand-cloud sm:w-auto dark:bg-white dark:text-brand-navy dark:hover:bg-white dark:focus-visible:ring-white/80 dark:focus-visible:ring-offset-brand-navy"
                >
                  {HOME.hero.primaryCta}
                </Link>
                <Link
                  href={BRAND.cta.secondary.href}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-2 py-3.5 text-[15px] font-semibold tracking-tight text-brand-navy underline decoration-brand-navy/35 underline-offset-[6px] transition-[color,decoration-color] duration-200 hover:decoration-brand-navy/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-harbour focus-visible:ring-offset-2 focus-visible:ring-offset-brand-cloud dark:text-white/95 dark:decoration-white/35 dark:hover:decoration-white/70 dark:focus-visible:ring-white/70 dark:focus-visible:ring-offset-brand-navy sm:w-auto sm:justify-start sm:px-0"
                >
                  {HOME.hero.secondaryCta}
                  <span aria-hidden className="text-brand-slate dark:text-white/50">
                    →
                  </span>
                </Link>
              </div>

              <p className="mt-6 border-t border-brand-navy/15 pt-4 text-[12px] leading-relaxed tracking-wide text-brand-slate dark:border-white/15 dark:text-white/58 sm:text-[13px] lg:max-w-[26rem]">
                {HOME.hero.trialReassurance}
              </p>
            </div>
          </motion.div>

          <div
            className="pointer-events-none hidden lg:col-span-5 lg:block xl:col-span-6"
            aria-hidden
          />
        </div>

        {/* Trust — spec strip, low visual weight */}
        <div className="absolute inset-x-0 bottom-0 border-t border-brand-navy/10 bg-white/85 backdrop-blur-[2px] dark:border-white/10 dark:bg-brand-navy/35">
          <ul
            className={`${CONTAINER} flex flex-wrap items-center gap-x-3 gap-y-2 py-3.5 sm:gap-x-4 sm:py-4 lg:justify-end`}
            aria-label="Compliance standards and coverage"
          >
            {HOME.trust.map((item, i) => (
              <li
                key={item}
                className="flex items-center gap-3 sm:gap-4"
              >
                {i > 0 ? (
                  <span
                    className="hidden h-1 w-1 rounded-full bg-brand-steel/50 sm:inline dark:bg-white/35"
                    aria-hidden
                  />
                ) : null}
                <span
                  className={`${FONT_DISPLAY} text-[9px] font-semibold uppercase tracking-[0.14em] text-brand-slate sm:text-[10px] dark:text-white/70`}
                >
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── OVERVIEW: founder walkthrough ── */}
      <section
        id="overview"
        className="scroll-mt-24 border-b border-brand-navy/10 bg-white py-20 sm:py-28"
      >
        <div className={CONTAINER}>
          <div className="mx-auto max-w-[40rem] text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-brand-harbour">
              {HOME.overview.eyebrow}
            </p>
            <h2
              className={`${FONT_DISPLAY} mt-5 text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-brand-navy`}
            >
              {HOME.overview.title}
            </h2>
            <p className="mx-auto mt-6 text-[16px] leading-[1.75] text-slate-600">
              {HOME.overview.body}
            </p>
          </div>
          <div className="mx-auto mt-12 w-full">
            <LandingOverviewVideo />
          </div>
        </div>
      </section>

      {/* ── PROOF: honest live-product signal (no vanity logos) ── */}
      <section
        id="proof"
        className="scroll-mt-24 border-b border-brand-navy/10 bg-[#F3F5F7] py-16 sm:py-20"
      >
        <div className={`${CONTAINER} max-w-3xl`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-brand-harbour">
            {HOME.proof.eyebrow}
          </p>
          <h2
            className={`${FONT_DISPLAY} mt-4 text-[clamp(1.65rem,3.5vw,2.25rem)] font-semibold leading-[1.12] tracking-[-0.03em] text-brand-navy`}
          >
            {HOME.proof.title}
          </h2>
          <p className="mt-4 text-[15px] leading-[1.75] text-slate-600">
            {HOME.proof.body}
          </p>
          <ul className="mt-6 space-y-2 text-[15px] text-slate-700">
            {HOME.proof.bullets.map((item) => (
              <li key={item} className="flex gap-2">
                <ChromeCheck size={16} className="mt-1 shrink-0 text-brand-harbour" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── STANCE: the three commitments, ruled strip ── */}
      <section
        id="stance"
        className="scroll-mt-24 border-b border-brand-navy/10 bg-white py-20 sm:py-24"
      >
        <div className={CONTAINER}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-brand-harbour">
            {HOME.stance.eyebrow}
          </p>
          <ul className="mt-10 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {HOME.stance.pillars.map((pillar, i) => (
              <motion.li
                key={pillar.title}
                initial={motionHidden ? { opacity: 0, y: 24 } : false}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={VIEWPORT}
                transition={{
                  duration: 0.6,
                  ease: EASE_OUT,
                  delay: reduce ? 0 : i * 0.08,
                }}
                className="border-t border-brand-navy/12 pt-6"
              >
                <span
                  className={`${FONT_DISPLAY} text-[13px] font-bold text-brand-harbour`}
                  aria-hidden
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3
                  className={`${FONT_DISPLAY} mt-3 text-[1.2rem] font-semibold leading-snug tracking-[-0.025em] text-brand-navy`}
                >
                  {pillar.title}
                </h3>
                <p className="mt-3 text-[15px] leading-[1.75] text-slate-600">
                  {pillar.body}
                </p>
              </motion.li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── WORKFLOW: monumental numbers ── */}
      <section id="workflow" className="scroll-mt-24 py-28 sm:py-36">
        <div className={CONTAINER}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-brand-harbour">
            {HOME.workflow.eyebrow}
          </p>
          <h2
            className={`${FONT_DISPLAY} mt-5 max-w-[20ch] text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-brand-navy`}
          >
            {HOME.workflow.title}
          </h2>
          <p className="mt-6 max-w-[36rem] text-[16px] leading-[1.75] text-slate-600">
            {HOME.workflow.body}
          </p>

          <ol className="mt-20 space-y-0">
            {HOME.workflow.steps.map((s, i) => (
              <motion.li
                key={s.step}
                initial={motionHidden ? { opacity: 0, y: 40 } : false}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={VIEWPORT}
                transition={{
                  duration: 0.7,
                  ease: EASE_OUT,
                  delay: reduce ? 0 : i * 0.08,
                }}
                className="relative grid items-start gap-6 border-t border-brand-navy/12 py-14 sm:grid-cols-[minmax(0,0.35fr)_minmax(0,0.65fr)] sm:gap-10 lg:py-20"
              >
                <span
                  className={`${FONT_DISPLAY} select-none text-[clamp(4.5rem,14vw,9rem)] font-bold leading-[0.8] tracking-[-0.06em] text-brand-harbour/65`}
                  aria-hidden
                >
                  {s.step}
                </span>
                <div className="sm:pt-4">
                  <h3
                    className={`${FONT_DISPLAY} text-[1.65rem] font-semibold tracking-[-0.03em] text-brand-navy sm:text-[2rem]`}
                  >
                    {s.title}
                  </h3>
                  <p className="mt-4 max-w-[32rem] text-[16px] leading-[1.75] text-slate-600">
                    {s.body}
                  </p>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── GAPS: split arena ── */}
      <section
        id="gaps"
        className="scroll-mt-24 overflow-hidden bg-brand-navy text-white"
      >
        <div className={`${CONTAINER} py-28 sm:py-36`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#7BA3BD]">
            {HOME.beforeAfter.eyebrow}
          </p>
          <h2
            className={`${FONT_DISPLAY} mt-5 max-w-[18ch] text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.035em]`}
          >
            {HOME.beforeAfter.title}
          </h2>
          <p className="mt-6 max-w-[36rem] text-[16px] leading-[1.75] text-white/65">
            {HOME.beforeAfter.body}
          </p>

          <div className="relative mt-20 grid gap-16 lg:grid-cols-2 lg:gap-0">
            <div className="lg:pr-16">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/60">
                Before
              </p>
              <h3 className={`${FONT_DISPLAY} mt-3 text-xl font-semibold`}>
                {HOME.beforeAfter.beforeTitle}
              </h3>
              <ul className="mt-8 space-y-5">
                {HOME.beforeAfter.before.map((line) => (
                  <li
                    key={line}
                    className="border-l border-white/20 pl-5 text-[16px] text-white/60 line-through decoration-white/30"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            {/* Center spine mark */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 left-1/2 hidden w-px -translate-x-1/2 bg-white/15 lg:block"
              aria-hidden
            >
              <span
                className={`${FONT_DISPLAY} absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90 whitespace-nowrap bg-brand-navy px-4 text-[10px] font-bold tracking-[0.28em] text-[#7BA3BD]`}
              >
                ONE RECORD
              </span>
            </div>

            <div className="lg:pl-16">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#7BA3BD]">
                After
              </p>
              <h3 className={`${FONT_DISPLAY} mt-3 text-xl font-semibold`}>
                {HOME.beforeAfter.afterTitle}
              </h3>
              <ul className="mt-8 space-y-5">
                {HOME.beforeAfter.after.map((line) => (
                  <li
                    key={line}
                    className={`${FONT_DISPLAY} border-l-2 border-brand-harbour pl-5 text-[16px] font-semibold text-white`}
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── PLATFORM ── */}
      <section id="platform" className="scroll-mt-24 py-28 sm:py-36">
        <div className={CONTAINER}>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20">
            <div className="lg:sticky lg:top-32 lg:self-start">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-brand-harbour">
                {HOME.platform.eyebrow}
              </p>
              <h2
                className={`${FONT_DISPLAY} mt-5 text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-brand-navy`}
              >
                {HOME.platform.title}
              </h2>
              <p className="mt-6 text-[16px] leading-[1.75] text-slate-600">
                {HOME.platform.body}
              </p>
              <p
                className={`${FONT_DISPLAY} mt-5 text-[15px] font-medium text-brand-navy-hover`}
              >
                {HOME.platform.byok}
              </p>
              <div className="mt-10 flex items-center gap-4">
                <span
                  className={`${FONT_DISPLAY} text-sm font-semibold text-brand-navy`}
                >
                  {HOME.platform.continuumLeft}
                </span>
                <span className="h-px flex-1 bg-brand-harbour/40" aria-hidden />
                <span
                  className={`${FONT_DISPLAY} text-sm font-semibold text-brand-navy`}
                >
                  {HOME.platform.continuumRight}
                </span>
              </div>
              <p className="mt-3 text-[13px] text-slate-600">
                {HOME.platform.continuumNote}
              </p>
            </div>

            <ol>
              {HOME.platform.features.map((f, i) => (
                <motion.li
                  key={f.title}
                  initial={motionHidden ? { opacity: 0, x: 24 } : false}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={VIEWPORT}
                  transition={{ duration: 0.55, ease: EASE_OUT }}
                  className="border-t border-brand-navy/10 py-10 first:border-t-0 first:pt-0"
                >
                  <div className="flex items-baseline gap-4">
                    <span
                      className={`${FONT_DISPLAY} text-[13px] font-bold text-brand-harbour`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
                      {f.lane}
                    </span>
                  </div>
                  <h3
                    className={`${FONT_DISPLAY} mt-3 text-[1.35rem] font-semibold tracking-[-0.025em] text-brand-navy`}
                  >
                    {f.title}
                  </h3>
                  <p className="mt-3 text-[15px] leading-[1.75] text-slate-600">
                    {f.body}
                  </p>
                </motion.li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ── DAMAGE ── */}
      <section
        id="damage"
        className="scroll-mt-24 border-y border-brand-navy/10 bg-white py-28 sm:py-36"
      >
        <div className={CONTAINER}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-brand-harbour">
            {HOME.damage.eyebrow}
          </p>
          <h2
            className={`${FONT_DISPLAY} mt-5 max-w-[20ch] text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-brand-navy`}
          >
            {HOME.damage.title}
          </h2>
          <p className="mt-6 max-w-[36rem] text-[16px] leading-[1.75] text-slate-600">
            {HOME.damage.body}
          </p>

          <ul className="mt-20">
            {HOME.damage.types.map((t, i) => (
              <li
                key={t.title}
                className="group grid gap-4 border-t border-brand-navy/10 py-10 transition-colors hover:bg-[#F0F3F6]/80 sm:grid-cols-[4rem_minmax(0,1fr)_minmax(0,1.4fr)] sm:gap-10 sm:px-4"
              >
                <span
                  className={`${FONT_DISPLAY} text-2xl font-bold text-brand-harbour/65 transition-colors group-hover:text-brand-harbour`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3
                  className={`${FONT_DISPLAY} text-xl font-semibold tracking-[-0.02em] text-brand-navy`}
                >
                  {t.title}
                </h3>
                <p className="text-[15px] leading-[1.75] text-slate-600">
                  {t.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── COVERAGE: code constellation ── */}
      <section id="coverage" className="scroll-mt-24 py-28 sm:py-36">
        <div className={CONTAINER}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-brand-harbour">
            {HOME.coverage.eyebrow}
          </p>
          <h2
            className={`${FONT_DISPLAY} mt-5 text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-brand-navy`}
          >
            {HOME.coverage.title}
            <span className="mt-4 block text-[1.25rem] font-medium leading-snug text-slate-600 sm:text-[1.5rem]">
              {HOME.coverage.titleAside}
            </span>
          </h2>
          <p className="mt-6 max-w-[36rem] text-[16px] leading-[1.75] text-slate-600">
            {HOME.coverage.body}
          </p>

          <div className="mt-10 flex flex-wrap gap-8">
            {HOME.coverage.builtIn.map((b) => (
              <div key={b.label}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-harbour">
                  {b.label}
                </p>
                <p
                  className={`${FONT_DISPLAY} mt-1 text-lg font-semibold text-brand-navy`}
                >
                  {b.value}
                </p>
              </div>
            ))}
          </div>

          <ul className="mt-20 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-3">
            {HOME.coverage.regions.map((r) => (
              <li key={r.code} className="relative pl-4">
                <span
                  className="absolute top-2 left-0 h-8 w-px bg-brand-harbour/50"
                  aria-hidden
                />
                <p
                  className={`${FONT_DISPLAY} text-[2rem] font-bold tracking-tight text-brand-navy sm:text-[2.35rem]`}
                >
                  {r.code}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-700">
                  {r.name}
                </p>
                <p className="mt-1 text-[12px] leading-snug text-slate-600">
                  {r.note}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>


      {/* ── POSITIONING: who we answer to ── */}
      <section
        id="positioning"
        className="scroll-mt-24 relative overflow-hidden bg-brand-navy py-28 text-white sm:py-36"
      >
        <div
          className="pointer-events-none absolute -top-24 -left-24 h-[26rem] w-[26rem] rounded-full bg-brand-harbour/20 blur-3xl"
          aria-hidden
        />
        <div className={`${CONTAINER} relative max-w-3xl`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#7BA3BD]">
            {HOME.positioning.eyebrow}
          </p>
          <h2
            className={`${FONT_DISPLAY} mt-5 text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.035em]`}
          >
            {HOME.positioning.title}
          </h2>
          <div className="mt-10 space-y-6">
            {HOME.positioning.paragraphs.map((para) => (
              <p
                key={para}
                className="text-[16px] leading-[1.8] text-white/65 sm:text-[17px]"
              >
                {para}
              </p>
            ))}
          </div>
          <p
            className={`${FONT_DISPLAY} mt-10 border-l-2 border-brand-harbour pl-6 text-[17px] font-medium leading-[1.7] text-white sm:text-[18px]`}
          >
            {HOME.positioning.close}
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section
        id="faq"
        className="scroll-mt-24 border-t border-brand-navy/10 bg-white py-28 sm:py-36"
      >
        <div className={`${CONTAINER} max-w-3xl`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-brand-harbour">
            {HOME.faq.eyebrow}
          </p>
          <h2
            className={`${FONT_DISPLAY} mt-5 text-[clamp(2rem,4vw,3rem)] font-semibold tracking-[-0.035em] text-brand-navy`}
          >
            {HOME.faq.title}
          </h2>
          <p className="mt-6 text-[16px] leading-[1.75] text-slate-600">
            {HOME.faq.body}
          </p>

          <ul className="mt-14">
            {faqs.map((item, i) => {
              const open = faqOpen === i;
              return (
                <li key={item.q} className="border-t border-brand-navy/10">
                  <button
                    type="button"
                    className="flex w-full items-baseline justify-between gap-6 py-6 text-left"
                    aria-expanded={open}
                    onClick={() => setFaqOpen(i)}
                  >
                    <span className="min-w-0">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                        {item.cat}
                      </span>
                      <span
                        className={`${FONT_DISPLAY} mt-1.5 block text-[1.05rem] font-semibold tracking-[-0.02em] text-brand-navy sm:text-[1.15rem]`}
                      >
                        {item.q}
                      </span>
                    </span>
                    <span
                      className={`${FONT_DISPLAY} shrink-0 text-2xl leading-none text-brand-harbour`}
                      aria-hidden
                    >
                      {open ? "–" : "+"}
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {open ? (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.32, ease: EASE_OUT }}
                        className="overflow-hidden"
                      >
                        <p className="pb-7 text-[15px] leading-[1.8] text-slate-600">
                          {item.a}
                        </p>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ── CTA ── */}
      <section
        id="start"
        className="scroll-mt-24 relative overflow-hidden bg-[#F0F3F6] py-32 sm:py-40"
      >
        <div
          className="pointer-events-none absolute -right-20 -bottom-20 h-[28rem] w-[28rem] rounded-full bg-brand-harbour/10 blur-3xl"
          aria-hidden
        />
        <div className={`${CONTAINER} relative max-w-2xl`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-brand-harbour">
            {HOME.cta.eyebrow}
          </p>
          <h2
            className={`${FONT_DISPLAY} mt-5 text-[clamp(2.25rem,5vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-brand-navy`}
          >
            {HOME.cta.title}
          </h2>
          <p
            className={`${FONT_DISPLAY} mt-6 text-lg font-semibold text-brand-navy-hover`}
          >
            {HOME.cta.slogan}
          </p>
          <p className="mt-5 max-w-xl text-[16px] leading-[1.75] text-slate-600">
            {HOME.cta.body}
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href={BRAND.cta.primary.href} className={CTA_PRIMARY}>
              {HOME.cta.primaryCta}
            </Link>
            <Link href="/pricing" className={CTA_SECONDARY}>
              {HOME.cta.secondaryCta}
            </Link>
          </div>
          <ul className="mt-12 flex flex-wrap gap-x-8 gap-y-3">
            {HOME.cta.reassurances.map((r) => (
              <li
                key={r}
                className="text-[13px] font-medium tracking-wide text-slate-600"
              >
                {r}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
