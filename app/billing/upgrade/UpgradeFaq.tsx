"use client";

import { motion, useReducedMotion } from "framer-motion";

const FAQ_ITEMS = [
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from your billing portal — access continues through the end of the paid period.",
  },
  {
    q: "What happens to my data?",
    a: "Your inspections, reports, and account data stay in place when you subscribe or cancel.",
  },
  {
    q: "What about reports and credits?",
    a: "The Monthly Plan includes 50 inspection reports per month, plus a +10 signup bonus in the first month.",
  },
] as const;

/** Short reassurance block — one job, three answers, no accordion clutter. */
export default function UpgradeFaq() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      className="mx-auto mt-12 w-full max-w-lg sm:mt-14"
      aria-labelledby="upgrade-faq-heading"
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
    >
      <h2
        id="upgrade-faq-heading"
        className="text-center text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground"
      >
        Good to know
      </h2>
      <dl className="mt-5 space-y-5 border-t border-border pt-6">
        {FAQ_ITEMS.map((item) => (
          <div key={item.q}>
            <dt className="text-sm font-medium text-foreground">{item.q}</dt>
            <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {item.a}
            </dd>
          </div>
        ))}
      </dl>
    </motion.section>
  );
}
