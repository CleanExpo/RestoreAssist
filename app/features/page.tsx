"use client";

import { motion } from "framer-motion";
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
import { useLandingReduceMotion } from "@/components/landing/home/useLandingReduceMotion";

const features = [
  {
    title: "AI-Powered Damage Assessment",
    description:
      "Advanced AI technology analyses damage patterns and provides accurate assessments in real-time.",
  },
  {
    title: "IICRC S500 Compliance",
    description:
      "Fully compliant with IICRC S500 standards for water damage restoration and assessment.",
  },
  {
    title: "Multi-Hazard Support",
    description:
      "Comprehensive support for water, fire, mould, and storm damage assessments.",
  },
  {
    title: "Photo & Data Capture",
    description:
      "Seamless integration for capturing photos and essential data during inspections.",
  },
  {
    title: "Dynamic Workflow Engine",
    description:
      "Flexible workflow system that adapts to your specific restoration process.",
  },
  {
    title: "Real-Time Cost Calculation",
    description:
      "Instant cost calculations with regional pricing libraries and equipment rates.",
  },
] as const;

export default function FeaturesPage() {
  const reduce = useLandingReduceMotion();

  return (
    <MarketingShell>
      <MarketingPageHero
        eyebrow="Platform"
        title="AI Damage Assessment & IICRC S500 Compliance"
        description="Powerful tools designed to streamline your restoration workflow."
      />

      <section className={`bg-white border-t border-slate-200/90 ${SECTION_PAD}`}>
        <div className={CONTAINER}>
          <motion.div
            variants={staggerContainer}
            initial={reduce ? false : "hidden"}
            whileInView="visible"
            viewport={VIEWPORT}
            className="grid gap-px overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-200/60 sm:grid-cols-2 lg:grid-cols-3"
          >
            {features.map((feature, index) => (
              <motion.article
                key={feature.title}
                variants={fadeUp}
                className="bg-white p-7 sm:p-8"
              >
                <p className="text-[11px] font-semibold tabular-nums tracking-[0.16em] text-[#3B6D8C]/85">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h2
                  className={`${FONT_DISPLAY} mt-3 text-lg font-semibold tracking-[-0.015em] text-[#0B1F3A] sm:text-[1.2rem]`}
                >
                  {feature.title}
                </h2>
                <p className="mt-3 text-[15px] leading-[1.72] text-slate-600">
                  {feature.description}
                </p>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </section>
    </MarketingShell>
  );
}
