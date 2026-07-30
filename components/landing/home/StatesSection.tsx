"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  EASE_OUT,
} from "./motion";

const REGIONS = [
  {
    code: "NSW",
    name: "New South Wales",
    note: "SafeWork NSW · Fair Trading · EPA NSW",
  },
  {
    code: "VIC",
    name: "Victoria",
    note: "WorkSafe VIC · building & EPA pathways",
  },
  {
    code: "QLD",
    name: "Queensland",
    note: "WorkSafe QLD · QBCC-ready workflows",
  },
  {
    code: "WA",
    name: "Western Australia",
    note: "WorkSafe WA · state building references",
  },
  {
    code: "SA",
    name: "South Australia",
    note: "SafeWork SA · jurisdictional codes",
  },
  {
    code: "TAS",
    name: "Tasmania",
    note: "WorkSafe TAS · island logistics, same system",
  },
  {
    code: "ACT",
    name: "Australian Capital Territory",
    note: "WorkSafe ACT · Territory building rules",
  },
  {
    code: "NT",
    name: "Northern Territory",
    note: "WorkSafe NT · remote-job ready capture",
  },
  {
    code: "NZ",
    name: "New Zealand",
    note: "GST 15% · AS/NZS moisture & standards paths",
    overseas: true,
  },
] as const;

// REGIONS is `as const`, so only the NZ member carries `overseas` and a bare
// `r.overseas` does not type-check against the union. Narrow with `in` rather
// than adding `overseas: false` to all eight AU entries.
type Region = (typeof REGIONS)[number];
const isOverseas = (r: Region): boolean => "overseas" in r && r.overseas;

const BUILT_IN = [
  { label: "GST", value: "AU 10% · NZ 15%" },
  { label: "Codes", value: "NCC 2022 · IICRC" },
  { label: "WHS", value: "State regulators in-flow" },
] as const;

/**
 * Coverage — "jurisdictional meridian" pattern.
 * A shared workflow rail with AU state stations + NZ branch.
 * Not a chip grid, not a map illustration, not a card wall.
 */
export function StatesSection() {
  const reduce = useLandingReduceMotion();
  const [active, setActive] = useState(0);
  const region = REGIONS[active];

  return (
    <section
      className={`relative overflow-hidden bg-[#F3F5F7] ${HAIRLINE} ${SECTION_PAD}`}
      aria-labelledby="coverage-heading"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_80%_20%,rgba(59,109,140,0.08),transparent_60%)]"
        aria-hidden
      />

      <div className={`${CONTAINER} relative`}>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-end lg:gap-16">
          <motion.div
            variants={staggerContainer}
            initial={reduce ? false : "hidden"}
            whileInView="visible"
            viewport={VIEWPORT}
          >
            <motion.p variants={fadeUp} className={SECTION_EYEBROW}>
              Australia &amp; New Zealand
            </motion.p>
            <motion.h2
              id="coverage-heading"
              variants={fadeUp}
              className={SECTION_TITLE}
            >
              Designed in Australia.
              <span
                className={`${FONT_DISPLAY} mt-3 block text-[1.35rem] font-medium leading-snug tracking-[-0.015em] text-slate-600 sm:text-2xl`}
              >
                Deployed across Australia and New Zealand.
              </span>
            </motion.h2>
            <motion.p variants={fadeUp} className={SECTION_BODY}>
              State codes, GST, and jurisdictional references are built into the
              workflow — so restoration software for Queensland works the same
              way as New South Wales, without rewriting your process for every
              border you cross.
            </motion.p>
          </motion.div>

          {/* Hemisphere mark */}
          <motion.div
            variants={fadeUp}
            initial={reduce ? false : "hidden"}
            whileInView="visible"
            viewport={VIEWPORT}
            className="flex items-end justify-start gap-6 lg:justify-end"
            aria-hidden
          >
            <div className="text-left lg:text-right">
              <p
                className={`${FONT_DISPLAY} text-[4.5rem] font-semibold leading-none tracking-[-0.07em] text-[#0B1F3A] sm:text-[5.5rem]`}
              >
                AU
              </p>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#3B6D8C]">
                Designed here
              </p>
            </div>
            <div className="mb-3 h-16 w-px bg-slate-300 sm:h-20" />
            <div className="text-left">
              <p
                className={`${FONT_DISPLAY} text-[4.5rem] font-semibold leading-none tracking-[-0.07em] text-[#3B6D8C] sm:text-[5.5rem]`}
              >
                NZ
              </p>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Same system
              </p>
            </div>
          </motion.div>
        </div>

        {/* Meridian rail */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.65, ease: EASE_OUT }}
          className="mt-14 sm:mt-16 lg:mt-20"
        >
          <div className="flex items-center justify-between gap-4">
            <p
              className={`${FONT_DISPLAY} text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400`}
            >
              Jurisdictional meridian
            </p>
            <p className="text-xs text-slate-400">
              Select a region — same claim workflow
            </p>
          </div>

          <div
            role="listbox"
            aria-label="States and regions covered"
            aria-activedescendant={`region-${region.code}`}
            className="relative mt-8"
          >
            {/* Rail line */}
            <div
              className="pointer-events-none absolute top-[1.35rem] right-4 left-4 hidden h-px bg-slate-300/90 sm:block"
              aria-hidden
            />

            <ul className="flex gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:grid sm:grid-cols-9 sm:gap-0 sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden">
              {REGIONS.map((r, i) => {
                const selected = i === active;
                return (
                  <li key={r.code} className="relative min-w-[4.5rem] flex-1 sm:min-w-0">
                    <button
                      type="button"
                      role="option"
                      id={`region-${r.code}`}
                      aria-selected={selected}
                      onClick={() => setActive(i)}
                      onMouseEnter={() => setActive(i)}
                      onFocus={() => setActive(i)}
                      className={[
                        FONT_DISPLAY,
                        "group relative z-10 flex w-full flex-col items-center gap-3 rounded-xl px-1 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6D8C]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F3F5F7]",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "flex h-7 w-7 items-center justify-center rounded-full border-2 bg-[#F3F5F7] transition-all duration-200",
                          selected
                            ? "border-[#3B6D8C] scale-110 shadow-[0_0_0_4px_rgba(59,109,140,0.12)]"
                            : isOverseas(r)
                              ? "border-[#3B6D8C]/45"
                              : "border-slate-300 group-hover:border-[#3B6D8C]/60",
                        ].join(" ")}
                        aria-hidden
                      >
                        <span
                          className={[
                            "h-2 w-2 rounded-full transition-colors",
                            selected ? "bg-[#3B6D8C]" : "bg-transparent",
                          ].join(" ")}
                        />
                      </span>
                      <span
                        className={[
                          "text-sm font-bold tracking-wide transition-colors sm:text-[15px]",
                          selected
                            ? "text-[#0B1F3A]"
                            : "text-slate-500 group-hover:text-[#16345A]",
                        ].join(" ")}
                      >
                        {r.code}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Active jurisdiction readout */}
          <div className="relative mt-8 overflow-hidden border-y border-slate-200/90 bg-white/70 px-5 py-6 sm:mt-10 sm:px-8 sm:py-7">
            <AnimatePresence mode="wait">
              <motion.div
                key={region.code}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
                className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
              >
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#3B6D8C]">
                    {isOverseas(region)
                      ? "Across the ditch"
                      : "Australian jurisdiction"}
                  </p>
                  <p
                    className={`${FONT_DISPLAY} mt-2 text-2xl font-semibold tracking-[-0.025em] text-[#0B1F3A] sm:text-3xl`}
                  >
                    <span className="tabular-nums text-[#3B6D8C]">
                      {region.code}
                    </span>
                    <span className="mx-3 text-slate-300">·</span>
                    {region.name}
                  </p>
                  <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
                    {region.note}
                  </p>
                </div>
                <p
                  className={`${FONT_DISPLAY} text-sm font-semibold tracking-[-0.01em] text-[#16345A]`}
                >
                  Same claim spine. Local rules in the flow.
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Built-in facts — open strip, not cards */}
        <motion.ul
          variants={staggerContainer}
          initial={reduce ? false : "hidden"}
          whileInView="visible"
          viewport={VIEWPORT}
          className="mt-10 grid gap-6 border-t border-slate-200/80 pt-8 sm:mt-12 sm:grid-cols-3 sm:gap-8"
        >
          {BUILT_IN.map((item) => (
            <motion.li key={item.label} variants={fadeUp}>
              <p
                className={`${FONT_DISPLAY} text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400`}
              >
                {item.label}
              </p>
              <p
                className={`${FONT_DISPLAY} mt-2 text-base font-semibold tracking-[-0.015em] text-[#0B1F3A]`}
              >
                {item.value}
              </p>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
