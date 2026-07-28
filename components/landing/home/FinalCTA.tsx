"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { BRAND } from "@/lib/brand";
import { CTA_PRIMARY, CTA_SECONDARY, fadeUp, staggerContainer } from "./motion";

const REASSURANCES = [
  "3 complimentary trial reports",
  "Instant setup",
  "24/7 support",
] as const;

export function FinalCTA() {
  const reduce = useReducedMotion();

  return (
    <section className="relative border-t border-slate-800/50 py-24 sm:py-28">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute bottom-0 left-1/2 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-600/25 to-cyan-600/20 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-6 lg:px-8">
        <motion.div
          variants={staggerContainer}
          initial={reduce ? false : "hidden"}
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
        >
          <motion.p
            variants={fadeUp}
            className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-400"
          >
            Get started
          </motion.p>
          <motion.h2
            variants={fadeUp}
            className="mt-3 text-3xl font-medium tracking-tight text-white sm:text-4xl"
          >
            {BRAND.slogan}
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-400"
          >
            Start with three trial reports. Bring your AI key. Generate your
            first IICRC-aligned report without rewriting the same job twice.
          </motion.p>
          <motion.div
            variants={fadeUp}
            className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Link href={BRAND.cta.primary.href} className={CTA_PRIMARY}>
              Start free — 3 trial reports
            </Link>
            <Link href="/pricing" className={CTA_SECONDARY}>
              View pricing
            </Link>
          </motion.div>
          <motion.ul
            variants={fadeUp}
            className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-slate-500"
          >
            {REASSURANCES.map((r) => (
              <li key={r} className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-cyan-400" />
                {r}
              </li>
            ))}
          </motion.ul>
        </motion.div>
      </div>
    </section>
  );
}
