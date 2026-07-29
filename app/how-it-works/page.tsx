"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  MarketingShell,
  MarketingPageHero,
} from "@/components/landing/home";
import {
  fadeUp,
  staggerContainer,
  FONT_DISPLAY,
  CONTAINER,
  SECTION_PAD,
  VIEWPORT,
} from "@/components/landing/home/motion";

const steps = [
  {
    number: "01",
    title: "Inspection",
    description:
      "Capture site data including photos, measurements, and damage details using our mobile-friendly interface.",
  },
  {
    number: "02",
    title: "AI Analysis",
    description:
      "Our AI-powered system analyses the captured data and identifies damage patterns, compliance requirements, and scope of work.",
  },
  {
    number: "03",
    title: "Scoping",
    description:
      "Generate detailed scope of work documents with compliance auto-insertion and real-time cost calculations.",
  },
  {
    number: "04",
    title: "Estimating",
    description:
      "Create accurate cost estimates with regional pricing libraries, equipment rates, and labour calculations.",
  },
  {
    number: "05",
    title: "Reporting",
    description:
      "Export professional reports in PDF or Excel format, ready for submission to insurers and clients.",
  },
] as const;

export default function HowItWorksPage() {
  const reduce = useReducedMotion();

  return (
    <MarketingShell>
      <MarketingPageHero
        align="center"
        eyebrow="Process"
        title="How It Works"
        description="A simple, streamlined process from inspection to final report."
      />

      <section className={`bg-white border-t border-slate-200/90 ${SECTION_PAD}`}>
        <div className={CONTAINER}>
          <motion.ol
            variants={staggerContainer}
            initial={reduce ? false : "hidden"}
            whileInView="visible"
            viewport={VIEWPORT}
            className="mx-auto max-w-3xl divide-y divide-slate-200/90 border-y border-slate-200/90"
          >
            {steps.map((step) => (
              <motion.li
                key={step.number}
                variants={fadeUp}
                className="grid grid-cols-[3.5rem_1fr] gap-5 py-8 sm:gap-8"
              >
                <span
                  className={`${FONT_DISPLAY} pt-1 text-sm font-bold tabular-nums tracking-tight text-[#3B6D8C]`}
                >
                  {step.number}
                </span>
                <div>
                  <h2
                    className={`${FONT_DISPLAY} text-xl font-semibold tracking-[-0.015em] text-[#0B1F3A] sm:text-2xl`}
                  >
                    {step.title}
                  </h2>
                  <p className="mt-3 text-[15px] leading-[1.72] text-slate-600 sm:text-base">
                    {step.description}
                  </p>
                </div>
              </motion.li>
            ))}
          </motion.ol>
        </div>
      </section>
    </MarketingShell>
  );
}
