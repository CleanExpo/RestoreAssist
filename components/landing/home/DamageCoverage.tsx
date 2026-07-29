"use client";

import { motion } from "framer-motion";
import { useLandingReduceMotion } from "./useLandingReduceMotion";
import {
  fadeUp,
  staggerContainer,
  SECTION_EYEBROW,
  SECTION_TITLE,
  SECTION_BODY,
  SECTION_PAD,
  CONTAINER,
  FONT_DISPLAY,
  VIEWPORT,
  HAIRLINE,
} from "./motion";

const TYPES = [
  {
    title: "Water damage restoration",
    body: "Category and class workflows with moisture documentation structured for audit, insurer review, and clear homeowner communication.",
  },
  {
    title: "Fire & smoke remediation",
    body: "Structured scoping for soot, odour, and contents — so estimates and reports stay consistent for claims teams and clients.",
  },
  {
    title: "Storm & flood response",
    body: "Rapid field capture when volume spikes. Keep reporting quality high when the phone never stops and crews are stretched thin.",
  },
  {
    title: "Mould remediation",
    body: "Containment and remediation notes tied to recognised standards — documentation that supports decisions, not guesswork.",
  },
] as const;

export function DamageCoverage() {
  const reduce = useLandingReduceMotion();

  return (
    <section
      className={`relative bg-white ${HAIRLINE} ${SECTION_PAD}`}
      aria-labelledby="damage-heading"
    >
      <div className={CONTAINER}>
        <div className="grid items-end gap-12 lg:grid-cols-[1fr_1.3fr] lg:gap-20">
          <motion.div
            variants={staggerContainer}
            initial={reduce ? false : "hidden"}
            whileInView="visible"
            viewport={VIEWPORT}
          >
            <motion.p variants={fadeUp} className={SECTION_EYEBROW}>
              Damage types covered
            </motion.p>
            <motion.h2
              id="damage-heading"
              variants={fadeUp}
              className={SECTION_TITLE}
            >
              Built for the jobs you actually get called to
            </motion.h2>
            <motion.p variants={fadeUp} className={SECTION_BODY}>
              Water, fire, storm, flood, and mould — one reporting system so
              your team is not reinventing the process on every claim.
              Consistent structure. Clearer handoffs. Stronger confidence at
              sign-off.
            </motion.p>
          </motion.div>

          <motion.div
            variants={staggerContainer}
            initial={reduce ? false : "hidden"}
            whileInView="visible"
            viewport={VIEWPORT}
            className="grid sm:grid-cols-2 sm:gap-x-10"
          >
            {TYPES.map((t) => (
              <motion.article
                key={t.title}
                variants={fadeUp}
                className="group border-t border-[#0B1F3A]/10 py-7 transition-colors hover:border-[#3B6D8C]/40"
              >
                <h3
                  className={`${FONT_DISPLAY} text-[1.05rem] font-semibold tracking-[-0.015em] text-[#0B1F3A] transition-colors group-hover:text-[#16345A]`}
                >
                  {t.title}
                </h3>
                <p className="mt-3 text-[15px] leading-[1.72] text-slate-600">
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
