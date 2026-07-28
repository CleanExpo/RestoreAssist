"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { BRAND } from "@/lib/brand";
import {
  CTA_PRIMARY,
  CTA_SECONDARY,
  GLASS_CARD,
  fadeUp,
  scaleIn,
  staggerContainer,
} from "./motion";

const TRUST = [
  "IICRC S500:2021",
  "NCC 2022",
  "WHS built-in",
  "Australian-designed",
  "AU + NZ",
] as const;

function DashboardPreview() {
  return (
    <div
      className={`${GLASS_CARD} relative overflow-hidden p-4 shadow-2xl shadow-blue-500/10 sm:p-5`}
      aria-hidden="true"
    >
      {/* Window chrome */}
      <div className="mb-4 flex items-center gap-2 border-b border-slate-700/50 pb-3">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
        <span className="ml-2 text-[11px] font-medium text-slate-500">
          RestoreAssist — Report draft
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Category", value: "Cat 2", tone: "text-cyan-400" },
          { label: "Class", value: "Class 3", tone: "text-blue-400" },
          { label: "Status", value: "Drafting", tone: "text-emerald-400" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-slate-600/30 bg-slate-700/30 p-3"
          >
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
              {stat.label}
            </p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${stat.tone}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700/50">
          <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-blue-600 to-cyan-600" />
        </div>
        <p className="text-[11px] text-slate-500">
          AI drafting S500-aligned scope · operator review required
        </p>
      </div>

      <div className="mt-4 space-y-2">
        {["Moisture mapping", "Material schedule", "Equipment plan"].map(
          (row, i) => (
            <div
              key={row}
              className="flex items-center justify-between rounded-lg border border-slate-600/30 bg-slate-700/30 px-3 py-2.5"
            >
              <span className="text-xs font-medium text-slate-300">{row}</span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  i < 2 ? "bg-emerald-400" : "animate-pulse bg-cyan-400"
                }`}
              />
            </div>
          ),
        )}
      </div>
    </div>
  );
}

export function LandingHero() {
  const reduce = useReducedMotion();

  return (
    <section className="relative min-h-[100dvh] overflow-hidden pt-32 pb-16 sm:pt-36 sm:pb-20">
      {/* Ambient depth — blue/cyan, matching dashboard accents */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute top-24 left-1/4 h-[380px] w-[380px] rounded-full bg-blue-600/20 blur-[120px]" />
        <div className="absolute top-1/3 -right-20 h-[380px] w-[380px] rounded-full bg-cyan-500/15 blur-[100px]" />
        <div className="absolute bottom-0 left-0 h-px w-full bg-gradient-to-r from-transparent via-slate-700/60 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 px-5 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
        <motion.div
          variants={staggerContainer}
          initial={reduce ? false : "hidden"}
          animate="visible"
          className="max-w-xl"
        >
          <motion.p
            variants={fadeUp}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-slate-700/50 bg-slate-800/50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-cyan-400"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
            {BRAND.tagline}
          </motion.p>

          <motion.h1
            variants={fadeUp}
            className="text-4xl font-medium tracking-tight text-white sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]"
          >
            From site to signed report.
            <span className="mt-1 block bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
              One system.
            </span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mt-5 text-lg font-medium tracking-tight text-slate-200 sm:text-xl"
          >
            {BRAND.slogan}
          </motion.p>

          <motion.p
            variants={fadeUp}
            className="mt-4 text-[15px] leading-relaxed text-slate-400 sm:text-base"
          >
            {BRAND.shortDescription} AI assists administration and field
            technicians — the decisions stay with the operator.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <Link href={BRAND.cta.primary.href} className={CTA_PRIMARY}>
              Start free — 3 trial reports
            </Link>
            <Link href={BRAND.cta.secondary.href} className={CTA_SECONDARY}>
              {BRAND.cta.secondary.label}
            </Link>
          </motion.div>

          <motion.ul
            variants={fadeUp}
            className="mt-8 flex flex-wrap gap-2"
            aria-label="Compliance and coverage"
          >
            {TRUST.map((item) => (
              <li
                key={item}
                className="rounded-lg border border-slate-700/50 bg-slate-800/40 px-2.5 py-1 text-[11px] font-medium text-slate-400"
              >
                {item}
              </li>
            ))}
          </motion.ul>
        </motion.div>

        <motion.div
          variants={scaleIn}
          initial={reduce ? false : "hidden"}
          animate="visible"
          className="relative lg:pl-4"
        >
          {!reduce && (
            <motion.div
              className="absolute -inset-4 rounded-2xl bg-gradient-to-r from-blue-600/20 to-cyan-600/20 blur-2xl"
              animate={{ opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              aria-hidden="true"
            />
          )}
          <div className="relative">
            <DashboardPreview />
            {/* Floating accent card */}
            <motion.div
              className={`${GLASS_CARD} absolute -bottom-4 -left-2 hidden p-3 shadow-xl sm:block sm:-left-6`}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55, duration: 0.5 }}
            >
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                Field → Office
              </p>
              <p className="mt-0.5 text-sm font-medium text-white">
                Double-handling removed
              </p>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
