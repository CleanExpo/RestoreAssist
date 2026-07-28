"use client";

import { motion, useReducedMotion } from "framer-motion";
import { fadeUp, staggerContainer, GLASS_CARD } from "./motion";

const STEPS = [
  {
    step: "01",
    title: "Capture on site",
    body: "Photos, moisture readings, voice notes, and LiDAR floor plans — offline-ready on the job.",
  },
  {
    step: "02",
    title: "AI drafts the report",
    body: "IICRC S500:2021-aligned drafts in minutes. You review, edit, and own every decision.",
  },
  {
    step: "03",
    title: "Client approves",
    body: "Share professional PDFs, invoices, and approvals through the client portal — no retyping.",
  },
] as const;

export function WorkflowSection() {
  const reduce = useReducedMotion();

  return (
    <section className="relative border-t border-slate-800/50 py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-6 lg:px-8">
        <motion.div
          variants={staggerContainer}
          initial={reduce ? false : "hidden"}
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mx-auto max-w-2xl text-center"
        >
          <motion.p
            variants={fadeUp}
            className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-400"
          >
            Remove double-handling
          </motion.p>
          <motion.h2
            variants={fadeUp}
            className="mt-3 text-3xl font-medium tracking-tight text-white sm:text-4xl"
          >
            Field, office, and client — connected
          </motion.h2>
          <motion.p
            variants={fadeUp}
            className="mt-4 text-base leading-relaxed text-slate-400"
          >
            Inspection to scope to report to invoice. One system so nothing gets
            lost between the driveway and the desk.
          </motion.p>
        </motion.div>

        <motion.ol
          variants={staggerContainer}
          initial={reduce ? false : "hidden"}
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          className="mt-14 grid gap-4 md:grid-cols-3"
        >
          {STEPS.map((item) => (
            <motion.li
              key={item.step}
              variants={fadeUp}
              className={`${GLASS_CARD} relative p-6 sm:p-7`}
            >
              <span className="text-xs font-semibold tabular-nums text-cyan-400/80">
                {item.step}
              </span>
              <h3 className="mt-3 text-lg font-medium text-white">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {item.body}
              </p>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  );
}
