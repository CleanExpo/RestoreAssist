"use client";

import { motion, useReducedMotion } from "framer-motion";
import { fadeUp, staggerContainer, GLASS_CARD } from "./motion";

const TYPES = [
  {
    title: "Water damage",
    body: "Category and class workflows with moisture documentation that holds up at audit.",
  },
  {
    title: "Fire & smoke",
    body: "Structured scoping for soot, odour, and contents — clear for insurers and clients.",
  },
  {
    title: "Storm & flood",
    body: "Rapid capture when volume spikes — keep quality when the phone never stops.",
  },
  {
    title: "Mould remediation",
    body: "Containment and remediation notes tied to standards, not guesswork.",
  },
] as const;

export function DamageCoverage() {
  const reduce = useReducedMotion();

  return (
    <section className="relative border-t border-slate-800/50 py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
        <div className="grid items-end gap-10 lg:grid-cols-[1fr_1.2fr]">
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
              Every damage type
            </motion.p>
            <motion.h2
              variants={fadeUp}
              className="mt-3 text-3xl font-medium tracking-tight text-white sm:text-4xl"
            >
              Built for the jobs you actually get called to
            </motion.h2>
            <motion.p
              variants={fadeUp}
              className="mt-4 text-base leading-relaxed text-slate-400"
            >
              Water, fire, storm, flood, and mould — one reporting system so your
              team isn&apos;t reinventing the process every claim.
            </motion.p>
          </motion.div>

          <motion.div
            variants={staggerContainer}
            initial={reduce ? false : "hidden"}
            whileInView="visible"
            viewport={{ once: true, margin: "-40px" }}
            className="grid gap-3 sm:grid-cols-2"
          >
            {TYPES.map((t) => (
              <motion.article
                key={t.title}
                variants={fadeUp}
                className={`${GLASS_CARD} p-5`}
              >
                <h3 className="text-base font-medium text-white">{t.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {t.body}
                </p>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
