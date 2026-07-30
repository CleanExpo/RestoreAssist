"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
} from "framer-motion";
import { BRAND } from "@/lib/brand";
import { HOME, getHomeFaqs } from "@/components/landing/home/homeContent";
import {
  CTA_PRIMARY,
  CTA_SECONDARY,
  FONT_DISPLAY,
  CONTAINER,
  EASE_OUT,
  VIEWPORT,
} from "@/components/landing/home/motion";
import { useLandingReduceMotion } from "@/components/landing/home/useLandingReduceMotion";

/**
 * Home 3 — Horizon Film
 * Full-bleed title sequence hero. Full-viewport chapters.
 * Horizontal feature reel. Type as landscape.
 */
export function OperatorAtlasLanding() {
  const reduce = useLandingReduceMotion();
  const faqs = getHomeFaqs();
  const [faqIndex, setFaqIndex] = useState(0);
  const faq = faqs[faqIndex];
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const photoScale = useTransform(
    scrollYProgress,
    [0, 1],
    [1, reduce ? 1 : 1.12],
  );
  const photoY = useTransform(
    scrollYProgress,
    [0, 1],
    ["0%", reduce ? "0%" : "12%"],
  );
  const mistOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0.35]);

  return (
    <div className="bg-[#FAFBFC] text-[#0B1F3A]">
      {/* ── HERO: dual-plane film strip — headline leads, brand is quiet ── */}
      <section
        ref={heroRef}
        className="relative min-h-[min(100dvh,64rem)] overflow-hidden pt-[4.25rem]"
      >
        {/* Primary photographic plane */}
        <motion.div
          style={{ scale: photoScale, y: photoY }}
          className="absolute inset-0 bottom-[22%] sm:bottom-[26%]"
        >
          <Image
            src="/landing/hero-workshop.jpg"
            alt="Daylight restoration workshop ready for the next claim"
            fill
            priority
            sizes="100vw"
            className="object-cover object-[center_40%]"
          />
        </motion.div>

        {/* Readable mist from left — not a centered title card */}
        <motion.div
          style={{ opacity: mistOpacity }}
          className="absolute inset-0 bottom-[22%] sm:bottom-[26%]"
        >
          <div
            className="absolute inset-0 bg-gradient-to-r from-[#FAFBFC] via-[#FAFBFC]/88 to-transparent sm:via-[#FAFBFC]/78 sm:to-transparent"
            aria-hidden
          />
          <div
            className="absolute inset-0 bg-gradient-to-t from-[#FAFBFC]/50 via-transparent to-[#FAFBFC]/30"
            aria-hidden
          />
        </motion.div>

        {/* Secondary film strip — field capture, edge to edge */}
        <div className="absolute right-0 bottom-0 left-0 h-[22%] overflow-hidden sm:h-[26%]">
          <Image
            src="/landing/field-capture.jpg"
            alt="Field capture on a restoration job site"
            fill
            sizes="100vw"
            className="object-cover object-[center_35%]"
          />
          <div
            className="absolute inset-0 bg-gradient-to-r from-[#0B1F3A]/55 via-[#0B1F3A]/25 to-transparent"
            aria-hidden
          />
          <div
            className={`${CONTAINER} absolute inset-0 flex items-end pb-5 sm:pb-6`}
          >
            <ul
              className="flex flex-wrap gap-x-6 gap-y-2"
              aria-label="Compliance standards and coverage"
            >
              {HOME.trust.map((item) => (
                <li
                  key={item}
                  className={`${FONT_DISPLAY} text-[10px] font-semibold uppercase tracking-[0.16em] text-white/85`}
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Steel seam between planes */}
        <div
          className="pointer-events-none absolute right-0 bottom-[22%] left-0 z-10 h-px bg-[#3B6D8C]/60 sm:bottom-[26%]"
          aria-hidden
        />

        <div
          className={`${CONTAINER} relative flex min-h-[calc(min(100dvh,64rem)-4.25rem)] items-center pb-[calc(22%+2rem)] pt-16 sm:pb-[calc(26%+2.5rem)] sm:pt-20`}
        >
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, ease: EASE_OUT }}
            className="max-w-[40rem]"
          >
            <motion.p
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: EASE_OUT, delay: 0.08 }}
              className={`${FONT_DISPLAY} text-[15px] font-semibold tracking-[-0.01em] text-[#0B1F3A] sm:text-base`}
            >
              {HOME.hero.brand}
            </motion.p>

            <motion.div
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: EASE_OUT, delay: 0.16 }}
              className="mt-5 flex items-center gap-3"
            >
              <span className="h-px w-12 bg-[#3B6D8C]" aria-hidden />
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#3B6D8C]">
                {HOME.hero.eyebrow}
              </p>
            </motion.div>

            <motion.h1
              initial={reduce ? false : { opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.75, ease: EASE_OUT, delay: 0.26 }}
              className={`${FONT_DISPLAY} mt-6 text-[clamp(2.15rem,5.5vw,3.65rem)] font-bold leading-[1.05] tracking-[-0.04em] text-[#0B1F3A]`}
            >
              {HOME.hero.headline}
            </motion.h1>

            <motion.p
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.4 }}
              className={`${FONT_DISPLAY} mt-6 text-[1.15rem] font-medium leading-snug tracking-[-0.02em] text-[#16345A] sm:text-[1.35rem]`}
            >
              {HOME.hero.valueLine}
            </motion.p>

            <motion.p
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.48 }}
              className="mt-5 max-w-[32rem] text-[15px] leading-[1.75] text-slate-600 sm:text-[16px]"
            >
              {HOME.hero.support}
            </motion.p>

            <motion.div
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.56 }}
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
        </div>
      </section>

      {/* ── WORKFLOW: stacked horizon bands ── */}
      <section className="bg-[#FAFBFC]">
        <div className={`${CONTAINER} pt-28 pb-8 sm:pt-36`}>
          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.36em] text-[#3B6D8C]">
            {HOME.workflow.eyebrow}
          </p>
          <h2
            className={`${FONT_DISPLAY} mx-auto mt-5 max-w-[22ch] text-center text-[clamp(2rem,4.5vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.04em] text-[#0B1F3A]`}
          >
            {HOME.workflow.title}
          </h2>
          <p className="mx-auto mt-6 max-w-[34rem] text-center text-[16px] leading-[1.75] text-slate-600">
            {HOME.workflow.body}
          </p>
        </div>

        <ol>
          {HOME.workflow.steps.map((s, i) => (
            <motion.li
              key={s.step}
              initial={reduce ? false : { opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VIEWPORT}
              transition={{ duration: 0.7, ease: EASE_OUT }}
              className={`border-t border-slate-200/80 ${
                i % 2 === 0 ? "bg-white" : "bg-[#F3F5F7]"
              }`}
            >
              <div
                className={`${CONTAINER} grid items-center gap-8 py-16 sm:py-20 lg:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-16`}
              >
                <p
                  className={`${FONT_DISPLAY} text-[4rem] font-bold leading-none tracking-[-0.06em] text-[#3B6D8C]/30 sm:text-[5rem]`}
                >
                  {s.step}
                </p>
                <h3
                  className={`${FONT_DISPLAY} text-[1.75rem] font-semibold tracking-[-0.03em] text-[#0B1F3A] sm:text-[2.15rem]`}
                >
                  {s.title}
                </h3>
                <p className="text-[16px] leading-[1.75] text-slate-600">
                  {s.body}
                </p>
              </div>
            </motion.li>
          ))}
        </ol>
      </section>

      {/* ── GAPS: immersive chapter ── */}
      <section className="relative min-h-[100dvh] overflow-hidden">
        <Image
          src="/landing/field-capture.jpg"
          alt="Field capture on a restoration job site"
          fill
          sizes="100vw"
          className="object-cover"
        />
        <div
          className="absolute inset-0 bg-[#0B1F3A]/62"
          aria-hidden
        />
        <div
          className={`${CONTAINER} relative flex min-h-[100dvh] flex-col justify-center py-24`}
        >
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VIEWPORT}
            transition={{ duration: 0.8, ease: EASE_OUT }}
            className="max-w-2xl"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.36em] text-white/55">
              {HOME.beforeAfter.eyebrow}
            </p>
            <h2
              className={`${FONT_DISPLAY} mt-5 text-[clamp(2rem,5vw,3.75rem)] font-semibold leading-[1.05] tracking-[-0.04em] text-white`}
            >
              {HOME.beforeAfter.title}
            </h2>
            <p className="mt-6 text-[17px] leading-[1.75] text-white/75">
              {HOME.beforeAfter.body}
            </p>
          </motion.div>

          <div className="mt-16 grid gap-12 sm:grid-cols-2 sm:gap-20">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/40">
                Before — {HOME.beforeAfter.beforeTitle}
              </p>
              <ul className="mt-6 space-y-4">
                {HOME.beforeAfter.before.map((line) => (
                  <li
                    key={line}
                    className="text-[16px] text-white/50 line-through decoration-white/25"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#9BC0D4]">
                After — {HOME.beforeAfter.afterTitle}
              </p>
              <ul className="mt-6 space-y-4">
                {HOME.beforeAfter.after.map((line) => (
                  <li
                    key={line}
                    className={`${FONT_DISPLAY} text-[16px] font-semibold text-white`}
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── PLATFORM: horizontal reel ── */}
      <section className="bg-[#FAFBFC] py-28 sm:py-36">
        <div className={CONTAINER}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.36em] text-[#3B6D8C]">
            {HOME.platform.eyebrow}
          </p>
          <h2
            className={`${FONT_DISPLAY} mt-5 max-w-[20ch] text-[clamp(2rem,4.5vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.04em] text-[#0B1F3A]`}
          >
            {HOME.platform.title}
          </h2>
          <p className="mt-6 max-w-[36rem] text-[16px] leading-[1.75] text-slate-600">
            {HOME.platform.body}
          </p>
          <p
            className={`${FONT_DISPLAY} mt-4 text-[15px] font-medium text-[#16345A]`}
          >
            {HOME.platform.byok}
          </p>
        </div>

        <div className="mt-16 overflow-x-auto pb-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ul className="flex w-max gap-5 px-[max(1.25rem,calc((100vw-80%)/2))]">
            {HOME.platform.features.map((f, i) => (
              <motion.li
                key={f.title}
                initial={reduce ? false : { opacity: 0, x: 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "0px -10% 0px 0px" }}
                transition={{
                  duration: 0.55,
                  ease: EASE_OUT,
                  delay: reduce ? 0 : i * 0.05,
                }}
                className="flex h-[22rem] w-[min(85vw,22rem)] shrink-0 flex-col justify-between rounded-[1.75rem] border border-slate-200/80 bg-white p-8 shadow-[0_1px_2px_rgba(11,31,58,0.04),0_20px_50px_rgba(11,31,58,0.05)] sm:h-[24rem] sm:w-[24rem] sm:p-10"
              >
                <div>
                  <p
                    className={`${FONT_DISPLAY} text-[3rem] font-bold leading-none tracking-[-0.05em] text-[#3B6D8C]/25`}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </p>
                  <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#3B6D8C]">
                    {f.lane}
                  </p>
                </div>
                <div>
                  <h3
                    className={`${FONT_DISPLAY} text-[1.45rem] font-semibold tracking-[-0.025em] text-[#0B1F3A]`}
                  >
                    {f.title}
                  </h3>
                  <p className="mt-4 text-[15px] leading-[1.7] text-slate-600">
                    {f.body}
                  </p>
                </div>
              </motion.li>
            ))}
          </ul>
        </div>
        <p className="mt-4 text-center text-[12px] text-slate-400">
          Scroll sideways to explore capabilities
        </p>
      </section>

      {/* ── DAMAGE: giant initials ── */}
      <section className="bg-white py-28 sm:py-36">
        <div className={CONTAINER}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.36em] text-[#3B6D8C]">
            {HOME.damage.eyebrow}
          </p>
          <h2
            className={`${FONT_DISPLAY} mt-5 max-w-[20ch] text-[clamp(2rem,4.5vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.04em] text-[#0B1F3A]`}
          >
            {HOME.damage.title}
          </h2>
          <p className="mt-6 max-w-[36rem] text-[16px] leading-[1.75] text-slate-600">
            {HOME.damage.body}
          </p>

          <ul className="mt-20 grid gap-px overflow-hidden rounded-3xl bg-slate-200/70 sm:grid-cols-2">
            {HOME.damage.types.map((t) => (
              <li
                key={t.title}
                className="relative bg-white p-8 sm:p-10 lg:min-h-[16rem]"
              >
                <span
                  className={`${FONT_DISPLAY} pointer-events-none absolute top-4 right-6 select-none text-[5rem] font-bold leading-none text-[#F0F3F6] sm:text-[6.5rem]`}
                  aria-hidden
                >
                  {t.title.charAt(0)}
                </span>
                <h3
                  className={`${FONT_DISPLAY} relative text-xl font-semibold tracking-[-0.02em] text-[#0B1F3A]`}
                >
                  {t.title}
                </h3>
                <p className="relative mt-4 max-w-[28rem] text-[15px] leading-[1.75] text-slate-600">
                  {t.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── COVERAGE: marquee + detail ── */}
      <section className="overflow-hidden bg-[#0B1F3A] py-28 text-white sm:py-36">
        <div className={CONTAINER}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.36em] text-[#7BA3BD]">
            {HOME.coverage.eyebrow}
          </p>
          <h2
            className={`${FONT_DISPLAY} mt-5 text-[clamp(2rem,4.5vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.04em]`}
          >
            {HOME.coverage.title}
            <span className="mt-4 block text-[1.25rem] font-medium text-white/55 sm:text-[1.5rem]">
              {HOME.coverage.titleAside}
            </span>
          </h2>
          <p className="mt-6 max-w-[36rem] text-[16px] leading-[1.75] text-white/60">
            {HOME.coverage.body}
          </p>
          <div className="mt-10 flex flex-wrap gap-8">
            {HOME.coverage.builtIn.map((b) => (
              <div key={b.label}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7BA3BD]">
                  {b.label}
                </p>
                <p className={`${FONT_DISPLAY} mt-1 text-lg font-semibold`}>
                  {b.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative mt-20 overflow-hidden">
          <motion.div
            className="flex w-max gap-16 px-8"
            animate={reduce ? undefined : { x: ["0%", "-50%"] }}
            transition={{
              duration: 45,
              ease: "linear",
              repeat: Infinity,
            }}
          >
            {[...HOME.coverage.regions, ...HOME.coverage.regions].map(
              (r, i) => (
                <div key={`${r.code}-${i}`} className="w-36 shrink-0">
                  <p
                    className={`${FONT_DISPLAY} text-[3rem] font-bold tracking-tight text-white/90`}
                  >
                    {r.code}
                  </p>
                  <p className="mt-2 text-sm text-white/50">{r.name}</p>
                </div>
              ),
            )}
          </motion.div>
        </div>

        <ul
          className={`${CONTAINER} mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3`}
        >
          {HOME.coverage.regions.map((r) => (
            <li key={r.code} className="border-t border-white/15 pt-5">
              <p
                className={`${FONT_DISPLAY} text-sm font-bold tracking-[0.14em] text-[#7BA3BD]`}
              >
                {r.code}
              </p>
              <p className="mt-1 font-semibold">{r.name}</p>
              <p className="mt-1 text-[13px] text-white/45">{r.note}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── FAQ: spotlight ── */}
      <section className="bg-[#FAFBFC] py-28 sm:py-36">
        <div className={CONTAINER}>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.36em] text-[#3B6D8C]">
              {HOME.faq.eyebrow}
            </p>
            <h2
              className={`${FONT_DISPLAY} mt-5 text-[clamp(2rem,4vw,3.25rem)] font-semibold tracking-[-0.04em] text-[#0B1F3A]`}
            >
              {HOME.faq.title}
            </h2>
            <p className="mx-auto mt-6 text-[16px] leading-[1.75] text-slate-600">
              {HOME.faq.body}
            </p>
          </div>

          <div className="mt-16 grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
            <ol className="space-y-2">
              {faqs.map((item, i) => (
                <li key={item.q}>
                  <button
                    type="button"
                    onClick={() => setFaqIndex(i)}
                    aria-current={faqIndex === i ? "true" : undefined}
                    className={`w-full rounded-2xl px-5 py-4 text-left text-[14px] transition-all duration-200 ${
                      faqIndex === i
                        ? "bg-[#0B1F3A] font-semibold text-white shadow-[0_16px_40px_rgba(11,31,58,0.2)]"
                        : "bg-white text-slate-600 shadow-sm hover:text-[#0B1F3A]"
                    }`}
                  >
                    {item.q}
                  </button>
                </li>
              ))}
            </ol>

            <AnimatePresence mode="wait">
              <motion.div
                key={faq.q}
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.35, ease: EASE_OUT }}
                className="relative overflow-hidden rounded-[2rem] bg-white p-9 shadow-[0_20px_60px_rgba(11,31,58,0.07)] sm:p-12"
              >
                <div
                  className="pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full bg-[#3B6D8C]/10 blur-3xl"
                  aria-hidden
                />
                <p className="relative text-[10px] font-semibold uppercase tracking-[0.24em] text-[#3B6D8C]">
                  {faq.cat}
                </p>
                <h3
                  className={`${FONT_DISPLAY} relative mt-4 text-[1.65rem] font-semibold tracking-[-0.03em] text-[#0B1F3A] sm:text-[2rem]`}
                >
                  {faq.q}
                </h3>
                <p className="relative mt-6 text-[16px] leading-[1.8] text-slate-600">
                  {faq.a}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* ── CLOSE: quiet title card ── */}
      <section className="relative min-h-[80dvh] overflow-hidden">
        <Image
          src="/landing/hero-workshop.jpg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-[center_50%] opacity-40"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-[#FAFBFC] via-[#FAFBFC]/90 to-[#FAFBFC]/70"
          aria-hidden
        />
        <div
          className={`${CONTAINER} relative flex min-h-[80dvh] flex-col items-center justify-center py-28 text-center`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.36em] text-[#3B6D8C]">
            {HOME.cta.eyebrow}
          </p>
          <h2
            className={`${FONT_DISPLAY} mt-6 max-w-[16ch] text-[clamp(2.5rem,6vw,4.5rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-[#0B1F3A]`}
          >
            {HOME.cta.title}
          </h2>
          <p
            className={`${FONT_DISPLAY} mt-8 text-[1.2rem] font-semibold tracking-[-0.02em] text-[#16345A]`}
          >
            {HOME.cta.slogan}
          </p>
          <p className="mx-auto mt-5 max-w-lg text-[16px] leading-[1.75] text-slate-600">
            {HOME.cta.body}
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
            <Link href={BRAND.cta.primary.href} className={CTA_PRIMARY}>
              {HOME.cta.primaryCta}
            </Link>
            <Link href="/pricing" className={CTA_SECONDARY}>
              {HOME.cta.secondaryCta}
            </Link>
          </div>
          <ul className="mt-12 flex flex-wrap justify-center gap-x-10 gap-y-3">
            {HOME.cta.reassurances.map((r) => (
              <li
                key={r}
                className={`${FONT_DISPLAY} text-[12px] font-medium tracking-[0.08em] text-slate-500`}
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
