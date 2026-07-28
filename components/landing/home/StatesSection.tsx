"use client";

import { motion, useReducedMotion } from "framer-motion";
import { fadeUp, staggerContainer, GLASS_CARD } from "./motion";

const STATES = [
  "NSW",
  "VIC",
  "QLD",
  "WA",
  "SA",
  "TAS",
  "ACT",
  "NT",
  "NZ",
] as const;

export function StatesSection() {
  const reduce = useReducedMotion();

  return (
    <section className="relative border-t border-slate-800/50 py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
        <motion.div
          variants={staggerContainer}
          initial={reduce ? false : "hidden"}
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className={`${GLASS_CARD} overflow-hidden p-8 sm:p-10 lg:p-12`}
        >
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-400">
                Coverage
              </p>
              <h2 className="mt-3 text-3xl font-medium tracking-tight text-white sm:text-4xl">
                Designed in Australia.
                <span className="mt-1 block text-slate-300">
                  Deployed across Australia and New Zealand.
                </span>
              </h2>
              <p className="mt-4 max-w-lg text-base leading-relaxed text-slate-400">
                State codes, GST, and jurisdictional references are built into
                the workflow — so restoration software for Queensland works the
                same way as New South Wales, without rewriting your process.
              </p>
            </div>
            <motion.ul
              variants={staggerContainer}
              className="grid grid-cols-3 gap-2 sm:grid-cols-3"
            >
              {STATES.map((s) => (
                <motion.li
                  key={s}
                  variants={fadeUp}
                  className="flex items-center justify-center rounded-lg border border-slate-600/30 bg-slate-700/30 py-3 text-sm font-medium tabular-nums text-slate-200"
                >
                  {s}
                </motion.li>
              ))}
            </motion.ul>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
