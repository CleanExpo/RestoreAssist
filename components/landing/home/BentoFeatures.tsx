"use client";

import { motion, useReducedMotion } from "framer-motion";
import { fadeUp, staggerContainer, GLASS_CARD } from "./motion";

const FEATURES = [
  {
    title: "AI-assisted IICRC reports",
    body: "S500:2021-aligned drafts that cut hours of writing. AI assists — you approve.",
    span: "md:col-span-2",
    accent: true,
  },
  {
    title: "GST-correct invoicing",
    body: "Variations, discounts, and professional PDFs that reconcile cleanly.",
    span: "",
    accent: false,
  },
  {
    title: "Offline field capture",
    body: "Evidence, moisture, and LiDAR sketches sync when you're back online.",
    span: "",
    accent: false,
  },
  {
    title: "Client portal",
    body: "Homeowners track progress, approve scopes, and download documents.",
    span: "",
    accent: false,
  },
  {
    title: "Compliance library",
    body: "IICRC, WHS, and NCC 2022 references built into the workflow.",
    span: "md:col-span-2",
    accent: false,
  },
] as const;

export function BentoFeatures() {
  const reduce = useReducedMotion();

  return (
    <section className="relative border-t border-slate-800/50 py-24 sm:py-28">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute top-1/2 left-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/10 blur-[140px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
        <motion.div
          variants={staggerContainer}
          initial={reduce ? false : "hidden"}
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="max-w-2xl"
        >
          <motion.p
            variants={fadeUp}
            className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-400"
          >
            Platform
          </motion.p>
          <motion.h2
            variants={fadeUp}
            className="mt-3 text-3xl font-medium tracking-tight text-white sm:text-4xl"
          >
            Everything the job needs — without the gaps
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-4 text-base text-slate-400">
            Built for Australian restorers who need compliance depth and field
            speed in the same product.
          </motion.p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial={reduce ? false : "hidden"}
          whileInView="visible"
          viewport={{ once: true, margin: "-40px" }}
          className="mt-12 grid gap-4 md:grid-cols-3"
        >
          {FEATURES.map((f) => (
            <motion.article
              key={f.title}
              variants={fadeUp}
              className={[
                GLASS_CARD,
                "group p-6 sm:p-7",
                f.span,
                f.accent
                  ? "md:bg-gradient-to-br md:from-slate-800/80 md:via-slate-800/50 md:to-cyan-950/30"
                  : "",
              ].join(" ")}
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/20 transition-transform duration-300 group-hover:scale-110">
                <span className="h-2 w-2 rounded-full bg-white" />
              </div>
              <h3 className="text-lg font-medium text-white group-hover:text-cyan-300 transition-colors">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {f.body}
              </p>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
