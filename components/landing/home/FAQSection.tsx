"use client";

import { useState } from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { fadeUp, staggerContainer, GLASS_CARD } from "./motion";

const FAQS = [
  {
    q: "What is RestoreAssist?",
    a: "RestoreAssist is Australia's first Australian-designed full CRM — an Office and Field Management System for the Australian Restoration Industry. It connects field capture, IICRC-aligned reporting, invoicing, and client approvals in one system.",
  },
  {
    q: "Does it create IICRC S500 reports?",
    a: "Yes. AI assists with S500:2021-aligned draft reports so writing time drops from hours to minutes. The operator always reviews and owns the final document — AI assists, never replaces.",
  },
  {
    q: "Is it compliant with Australian building codes?",
    a: "RestoreAssist includes inbuilt IICRC frameworks, WHS policies, and Australian Building Code / NCC 2022 references so compliance is part of the workflow, not an afterthought.",
  },
  {
    q: "Can I use it offline on site?",
    a: "Field capture is designed for real job sites — evidence, moisture, and sketches can be captured offline and sync when you're back online.",
  },
  {
    q: "Do I need my own AI key?",
    a: "Yes. You bring your own Anthropic or OpenAI key. Costs stay transparent and your workspace stays under your control.",
  },
] as const;

export function FAQSection() {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="relative border-t border-slate-800/50 py-24 sm:py-28">
      <div className="mx-auto max-w-3xl px-5 sm:px-6 lg:px-8">
        <motion.div
          variants={staggerContainer}
          initial={reduce ? false : "hidden"}
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="text-center"
        >
          <motion.p
            variants={fadeUp}
            className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-400"
          >
            FAQ
          </motion.p>
          <motion.h2
            variants={fadeUp}
            className="mt-3 text-3xl font-medium tracking-tight text-white sm:text-4xl"
          >
            Straight answers
          </motion.h2>
        </motion.div>

        <div className="mt-10 space-y-2">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q} className={`${GLASS_CARD} overflow-hidden`}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left min-h-11"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                >
                  <span className="text-sm font-medium text-white sm:text-[15px]">
                    {item.q}
                  </span>
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-600/50 text-slate-400 transition-transform duration-200 ${
                      isOpen ? "rotate-45 text-cyan-400" : ""
                    }`}
                    aria-hidden="true"
                  >
                    +
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={reduce ? false : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <p className="border-t border-slate-700/50 px-5 py-4 text-sm leading-relaxed text-slate-400">
                        {item.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQS.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        }}
      />
    </section>
  );
}
