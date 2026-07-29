import type { Variants } from "framer-motion";

/** Premium daylight easing — smooth, decisive, never bouncy. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const VIEWPORT = { once: true, margin: "-10% 0px -8% 0px" } as const;

/** Shared entrance — calm rise + fade. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.62, ease: EASE_OUT },
  },
};

export const fadeUpSoft: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: EASE_OUT },
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
    transition: { staggerChildren: 0.075, delayChildren: 0.06 },
  },
};

export const staggerFast: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.055, delayChildren: 0.04 },
  },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.985 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.75, ease: EASE_OUT },
  },
};

/** Soft clip reveal for photography — modern, not theatrical. */
export const revealImage: Variants = {
  hidden: { opacity: 0, scale: 1.03 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.9, ease: EASE_OUT },
  },
};

/** Daylight workshop tokens. */
export const LAND = {
  canvas: "bg-[#F3F5F7]",
  surface: "bg-white",
  ink: "text-[#0B1F3A]",
  muted: "text-slate-600",
  faint: "text-slate-500",
  border: "border-slate-200/90",
  navy: "bg-[#0B1F3A]",
  navyText: "text-[#0B1F3A]",
  accent: "text-[#3B6D8C]",
} as const;

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6D8C]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F3F5F7]";

export const CTA_PRIMARY = [
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl",
  "bg-[#0B1F3A] px-7 py-3.5 text-[15px] font-semibold tracking-tight text-white",
  "shadow-[0_1px_2px_rgba(11,31,58,0.1),0_4px_16px_rgba(11,31,58,0.08)]",
  "transition-[background-color,box-shadow,transform] duration-200 ease-out",
  "hover:bg-[#16345A] hover:shadow-[0_2px_4px_rgba(11,31,58,0.1),0_10px_28px_rgba(11,31,58,0.12)]",
  "active:scale-[0.985]",
  FOCUS,
].join(" ");

export const CTA_SECONDARY = [
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl",
  "border border-slate-300/90 bg-white/90 px-7 py-3.5",
  "text-[15px] font-semibold tracking-tight text-[#0B1F3A]",
  "shadow-[0_1px_1px_rgba(15,23,42,0.03)]",
  "transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out",
  "hover:border-slate-400 hover:bg-white hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)]",
  "active:scale-[0.985]",
  FOCUS,
].join(" ");

export const SURFACE =
  "rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

export const FONT_DISPLAY = "font-[family-name:var(--font-landing-display)]";

export const SECTION_EYEBROW =
  "text-[11px] font-semibold uppercase tracking-[0.2em] text-[#3B6D8C]";

export const SECTION_TITLE = [
  FONT_DISPLAY,
  "mt-4 text-[1.9rem] font-semibold leading-[1.12] tracking-[-0.02em] text-[#0B1F3A]",
  "sm:text-[2.35rem] sm:leading-[1.1] lg:text-[2.85rem] lg:leading-[1.08]",
].join(" ");

export const SECTION_BODY =
  "mt-5 max-w-[38rem] text-[15px] leading-[1.72] text-slate-600 sm:text-[17px] sm:leading-[1.72]";

export const SECTION_PAD = "py-24 sm:py-28 lg:py-[7.5rem]";

/** Public content rail — 80% viewport width, shared across marketing pages. */
export const CONTAINER = "mx-auto w-[80%] px-5 sm:px-6 lg:px-8";

export const HAIRLINE = "border-t border-slate-200/90";
