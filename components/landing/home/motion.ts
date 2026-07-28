import type { Variants } from "framer-motion";

/** Shared entrance — mirrors dashboard home page stagger. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.5, ease: "easeOut" },
  },
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1, delayChildren: 0.05 },
  },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  },
};

/** Primary CTA — exact dashboard signature. */
export const CTA_PRIMARY =
  "inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium text-white bg-gradient-to-r from-blue-600 to-cyan-600 hover:shadow-lg hover:shadow-blue-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200";

export const CTA_SECONDARY =
  "inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium text-slate-200 border border-slate-700/50 bg-slate-800/50 hover:border-slate-600/50 hover:bg-slate-700/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200";

export const GLASS_CARD =
  "bg-slate-800/50 border border-slate-700/50 rounded-xl hover:border-slate-600/50 transition-all duration-300";
