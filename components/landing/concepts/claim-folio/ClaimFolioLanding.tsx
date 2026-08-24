"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import { BRAND } from "@/lib/brand";
import { HOME, getHomeFaqs } from "@/components/landing/home/homeContent";
import {
  CTA_ON_DARK_PRIMARY,
  CTA_ON_DARK_SECONDARY,
  CTA_PRIMARY,
  CTA_SECONDARY,
  FONT_DISPLAY,
  CONTAINER,
  EASE_OUT,
  VIEWPORT,
} from "@/components/landing/home/motion";
import { useLandingReduceMotion } from "@/components/landing/home/useLandingReduceMotion";

const SECTIONS = [
  { id: "workflow", label: "01" },
  { id: "gaps", label: "02" },
  { id: "platform", label: "03" },
  { id: "damage", label: "04" },
  { id: "coverage", label: "05" },
  { id: "faq", label: "06" },
  { id: "start", label: "07" },
] as const;

/**
 * Home 2 — Claim Spine
 * Full-bleed water-inspection photography with claim folio index.
 * Ruled typography, oversized numerals, continuous left spine.
 */
export function ClaimFolioLanding() {
  const reduce = useLandingReduceMotion();
  const faqs = getHomeFaqs();
  const [faqOpen, setFaqOpen] = useState(0);
  const [active, setActive] = useState("workflow");
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
    <div className="relative bg-[#F0F3F6] text-[#0B1F3A]">
      {/* Continuous claim spine */}
      <div
        className="pointer-events-none fixed top-[4.25rem] bottom-0 left-[max(0.75rem,calc((100vw-80%)/2-0.5rem))] z-40 hidden w-px lg:block"
        aria-hidden
      >
        <div className="absolute inset-0 bg-[#0B1F3A]/10" />
        <motion.div
          className="absolute top-0 left-0 w-px origin-top bg-[#3B6D8C]"
          style={{ height: reduce ? "100%" : spineHeight }}
        />
      </div>

      {/* Folio index — desktop */}
      <nav
        className="fixed top-1/2 right-[max(1rem,calc((100vw-80%)/2-3.5rem))] z-40 hidden -translate-y-1/2 flex-col gap-1 xl:flex"
        aria-label="Page sections"
      >
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={`font-[family-name:var(--font-landing-display)] rounded px-2 py-1.5 text-[10px] font-bold tracking-[0.14em] transition-colors ${
              active === s.id
                ? "text-[#3B6D8C]"
                : "text-slate-400 hover:text-[#0B1F3A]"
            }`}
          >
            {s.label}
          </a>
        ))}
      </nav>

      {/* ── HERO: full-bleed water inspection photography ── */}
      <section className="relative min-h-[100dvh] overflow-hidden pt-[4.25rem]">
        <motion.div
          initial={reduce ? false : { scale: 1.08, opacity: 0.55 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.5, ease: EASE_OUT }}
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
        </motion.div>

        {/* Full-frame readability wash — photo stays edge-to-edge */}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0B1F3A]/90 via-[#0B1F3A]/50 to-[#0B1F3A]/20 sm:via-[#0B1F3A]/42 sm:to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/70 via-transparent to-[#0B1F3A]/35"
          aria-hidden
        />

        <div
          className={`${CONTAINER} relative flex min-h-[calc(100dvh-4.25rem)] items-center py-16`}
        >
          <div className="max-w-[min(100%,36rem)] lg:max-w-[34rem]">
            <motion.p
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.08 }}
              className={`${FONT_DISPLAY} text-[15px] font-semibold tracking-[-0.01em] text-white sm:text-base`}
            >
              {HOME.hero.brand}
            </motion.p>

            <motion.div
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.16 }}
              className="mt-5 flex items-center gap-3"
            >
              <span className="h-px w-12 bg-[#7BA3BD]" aria-hidden />
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#A8C5D8]">
                {HOME.hero.eyebrow}
              </p>
            </motion.div>

            <motion.h1
              initial={reduce ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.26 }}
              className={`${FONT_DISPLAY} mt-6 text-[clamp(2rem,5.2vw,3.4rem)] font-bold leading-[1.06] tracking-[-0.035em] text-white`}
            >
              {HOME.hero.headline}
            </motion.h1>

            <motion.p
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.38 }}
              className={`${FONT_DISPLAY} mt-5 text-[1.1rem] font-medium text-white/90 sm:text-[1.25rem]`}
            >
              {HOME.hero.valueLine}
            </motion.p>

            <motion.p
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.46 }}
              className="mt-5 max-w-[28rem] text-[14.5px] leading-[1.75] text-white/75 sm:text-[15.5px]"
            >
              {HOME.hero.support}
            </motion.p>

            <motion.div
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.54 }}
              className="mt-9 flex flex-col gap-3 sm:flex-row"
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
          </div>
        </div>

        {/* Trust over the full photo */}
        <div className="absolute right-0 bottom-0 left-0">
          <ul
            className={`${CONTAINER} flex flex-wrap gap-x-6 gap-y-2 py-5 sm:justify-start lg:justify-end`}
            aria-label="Compliance standards and coverage"
          >
            {HOME.trust.map((item) => (
              <li
                key={item}
                className={`${FONT_DISPLAY} text-[10px] font-semibold uppercase tracking-[0.16em] text-white/80`}
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── WORKFLOW: monumental numbers ── */}
      <section id="workflow" className="scroll-mt-24 py-28 sm:py-36">
        <div className={CONTAINER}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#3B6D8C]">
            {HOME.workflow.eyebrow}
          </p>
          <h2
            className={`${FONT_DISPLAY} mt-5 max-w-[20ch] text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-[#0B1F3A]`}
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
                initial={reduce ? false : { opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={VIEWPORT}
                transition={{
                  duration: 0.7,
                  ease: EASE_OUT,
                  delay: reduce ? 0 : i * 0.08,
                }}
                className="relative grid items-start gap-6 border-t border-[#0B1F3A]/12 py-14 sm:grid-cols-[minmax(0,0.35fr)_minmax(0,0.65fr)] sm:gap-10 lg:py-20"
              >
                <span
                  className={`${FONT_DISPLAY} select-none text-[clamp(4.5rem,14vw,9rem)] font-bold leading-[0.8] tracking-[-0.06em] text-[#3B6D8C]/20`}
                  aria-hidden
                >
                  {s.step}
                </span>
                <div className="sm:pt-4">
                  <h3
                    className={`${FONT_DISPLAY} text-[1.65rem] font-semibold tracking-[-0.03em] text-[#0B1F3A] sm:text-[2rem]`}
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
        className="scroll-mt-24 overflow-hidden bg-[#0B1F3A] text-white"
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
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/40">
                Before
              </p>
              <h3 className={`${FONT_DISPLAY} mt-3 text-xl font-semibold`}>
                {HOME.beforeAfter.beforeTitle}
              </h3>
              <ul className="mt-8 space-y-5">
                {HOME.beforeAfter.before.map((line) => (
                  <li
                    key={line}
                    className="border-l border-white/20 pl-5 text-[16px] text-white/45 line-through decoration-white/30"
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
                className={`${FONT_DISPLAY} absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90 whitespace-nowrap bg-[#0B1F3A] px-4 text-[10px] font-bold tracking-[0.28em] text-[#7BA3BD]`}
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
                    className={`${FONT_DISPLAY} border-l-2 border-[#3B6D8C] pl-5 text-[16px] font-semibold text-white`}
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
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#3B6D8C]">
                {HOME.platform.eyebrow}
              </p>
              <h2
                className={`${FONT_DISPLAY} mt-5 text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-[#0B1F3A]`}
              >
                {HOME.platform.title}
              </h2>
              <p className="mt-6 text-[16px] leading-[1.75] text-slate-600">
                {HOME.platform.body}
              </p>
              <p
                className={`${FONT_DISPLAY} mt-5 text-[15px] font-medium text-[#16345A]`}
              >
                {HOME.platform.byok}
              </p>
              <div className="mt-10 flex items-center gap-4">
                <span
                  className={`${FONT_DISPLAY} text-sm font-semibold text-[#0B1F3A]`}
                >
                  {HOME.platform.continuumLeft}
                </span>
                <span className="h-px flex-1 bg-[#3B6D8C]/40" aria-hidden />
                <span
                  className={`${FONT_DISPLAY} text-sm font-semibold text-[#0B1F3A]`}
                >
                  {HOME.platform.continuumRight}
                </span>
              </div>
              <p className="mt-3 text-[13px] text-slate-500">
                {HOME.platform.continuumNote}
              </p>
            </div>

            <ol>
              {HOME.platform.features.map((f, i) => (
                <motion.li
                  key={f.title}
                  initial={reduce ? false : { opacity: 0, x: 24 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={VIEWPORT}
                  transition={{ duration: 0.55, ease: EASE_OUT }}
                  className="border-t border-[#0B1F3A]/10 py-10 first:border-t-0 first:pt-0"
                >
                  <div className="flex items-baseline gap-4">
                    <span
                      className={`${FONT_DISPLAY} text-[13px] font-bold text-[#3B6D8C]`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                      {f.lane}
                    </span>
                  </div>
                  <h3
                    className={`${FONT_DISPLAY} mt-3 text-[1.35rem] font-semibold tracking-[-0.025em] text-[#0B1F3A]`}
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
        className="scroll-mt-24 border-y border-[#0B1F3A]/10 bg-white py-28 sm:py-36"
      >
        <div className={CONTAINER}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#3B6D8C]">
            {HOME.damage.eyebrow}
          </p>
          <h2
            className={`${FONT_DISPLAY} mt-5 max-w-[20ch] text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-[#0B1F3A]`}
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
                className="group grid gap-4 border-t border-[#0B1F3A]/10 py-10 transition-colors hover:bg-[#F0F3F6]/80 sm:grid-cols-[4rem_minmax(0,1fr)_minmax(0,1.4fr)] sm:gap-10 sm:px-4"
              >
                <span
                  className={`${FONT_DISPLAY} text-2xl font-bold text-[#3B6D8C]/35 transition-colors group-hover:text-[#3B6D8C]`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3
                  className={`${FONT_DISPLAY} text-xl font-semibold tracking-[-0.02em] text-[#0B1F3A]`}
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
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#3B6D8C]">
            {HOME.coverage.eyebrow}
          </p>
          <h2
            className={`${FONT_DISPLAY} mt-5 text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-[#0B1F3A]`}
          >
            {HOME.coverage.title}
            <span className="mt-4 block text-[1.25rem] font-medium leading-snug text-slate-500 sm:text-[1.5rem]">
              {HOME.coverage.titleAside}
            </span>
          </h2>
          <p className="mt-6 max-w-[36rem] text-[16px] leading-[1.75] text-slate-600">
            {HOME.coverage.body}
          </p>

          <div className="mt-10 flex flex-wrap gap-8">
            {HOME.coverage.builtIn.map((b) => (
              <div key={b.label}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#3B6D8C]">
                  {b.label}
                </p>
                <p
                  className={`${FONT_DISPLAY} mt-1 text-lg font-semibold text-[#0B1F3A]`}
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
                  className="absolute top-2 left-0 h-8 w-px bg-[#3B6D8C]/50"
                  aria-hidden
                />
                <p
                  className={`${FONT_DISPLAY} text-[2rem] font-bold tracking-tight text-[#0B1F3A] sm:text-[2.35rem]`}
                >
                  {r.code}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-700">
                  {r.name}
                </p>
                <p className="mt-1 text-[12px] leading-snug text-slate-500">
                  {r.note}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section
        id="faq"
        className="scroll-mt-24 border-t border-[#0B1F3A]/10 bg-white py-28 sm:py-36"
      >
        <div className={`${CONTAINER} max-w-3xl`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#3B6D8C]">
            {HOME.faq.eyebrow}
          </p>
          <h2
            className={`${FONT_DISPLAY} mt-5 text-[clamp(2rem,4vw,3rem)] font-semibold tracking-[-0.035em] text-[#0B1F3A]`}
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
                <li key={item.q} className="border-t border-[#0B1F3A]/10">
                  <button
                    type="button"
                    className="flex w-full items-baseline justify-between gap-6 py-6 text-left"
                    aria-expanded={open}
                    onClick={() => setFaqOpen(i)}
                  >
                    <span className="min-w-0">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        {item.cat}
                      </span>
                      <span
                        className={`${FONT_DISPLAY} mt-1.5 block text-[1.05rem] font-semibold tracking-[-0.02em] text-[#0B1F3A] sm:text-[1.15rem]`}
                      >
                        {item.q}
                      </span>
                    </span>
                    <span
                      className={`${FONT_DISPLAY} shrink-0 text-2xl leading-none text-[#3B6D8C]`}
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
          className="pointer-events-none absolute -right-20 -bottom-20 h-[28rem] w-[28rem] rounded-full bg-[#3B6D8C]/10 blur-3xl"
          aria-hidden
        />
        <div className={`${CONTAINER} relative max-w-2xl`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#3B6D8C]">
            {HOME.cta.eyebrow}
          </p>
          <h2
            className={`${FONT_DISPLAY} mt-5 text-[clamp(2.25rem,5vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-[#0B1F3A]`}
          >
            {HOME.cta.title}
          </h2>
          <p
            className={`${FONT_DISPLAY} mt-6 text-lg font-semibold text-[#16345A]`}
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
                className="text-[13px] font-medium tracking-wide text-slate-500"
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
