"use client";

import { motion, useReducedMotion } from "framer-motion";
import { upgradeBentoTile, upgradeBentoTileShine } from "@/lib/billing/upgrade-page-theme";
import { cn } from "@/lib/utils";

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

export default function UpgradeFaq() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      className="w-full"
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
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {FAQ_ITEMS.map((item) => (
          <article
            key={item.q}
            className={cn(
              upgradeBentoTile,
              "border-border/60 bg-card/90 p-5 dark:from-card dark:via-card dark:to-primary/[0.03]",
            )}
          >
            <div aria-hidden className={upgradeBentoTileShine} />
            <h3 className="relative text-sm font-semibold text-foreground">
              {item.q}
            </h3>
            <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">
              {item.a}
            </p>
          </article>
        ))}
      </div>
    </motion.section>
  );
}
