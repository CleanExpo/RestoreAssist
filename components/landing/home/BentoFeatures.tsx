"use client";

import { motion } from "framer-motion";
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
import { useLandingReduceMotion } from "./useLandingReduceMotion";

const FEATURES = [
  {
    lane: "Desk",
    side: "left" as const,
    title: "Reports that hold up at audit",
    body: "Produce S500:2021-aligned report drafts that cut hours of writing. Every document stays under your review — professional judgement never leaves the operator.",
  },
  {
    lane: "Field",
    side: "right" as const,
    title: "Capture on site — even offline",
    body: "Evidence, moisture readings, sketches, and voice notes capture on site even without signal — then sync when you are back online.",
  },
  {
    lane: "Office",
    side: "left" as const,
    title: "Invoices that reconcile cleanly",
    body: "Variations, discounts, and professional PDF invoices that reconcile cleanly for Australian and New Zealand jobs — without spreadsheet rework.",
  },
  {
    lane: "Client",
    side: "right" as const,
    title: "Fewer chase-ups with homeowners",
    body: "Give homeowners a clear path to track progress, approve scopes, and download documents — fewer phone chases, faster sign-off.",
  },
  {
    lane: "Standards",
    side: "left" as const,
    title: "Compliance inside the workflow",
    body: "IICRC, WHS, and NCC 2022 references live inside the workflow so standards guide the job instead of living in a separate folder.",
  },
  {
    lane: "Team",
    side: "right" as const,
    title: "Office and field on the same job",
    body: "Roles, handoffs, and shared jobs keep field technicians and the office aligned on the same claim — from first visit to final invoice.",
  },
] as const;

/**
 * Platform capabilities — "gap stitch" pattern.
 * A central system spine with capabilities branching left/right,
 * like stitching field and office onto one claim record.
 * Intentionally not a bento grid or card wall.
 */
export function BentoFeatures() {
  const reduce = useLandingReduceMotion();

  return (
    <section
      className={`relative overflow-hidden bg-white ${HAIRLINE} ${SECTION_PAD}`}
      aria-labelledby="platform-heading"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_50%_0%,rgba(59,109,140,0.06),transparent_65%)]"
        aria-hidden
      />

      <div className={`${CONTAINER} relative`}>
        {/* Intro + continuum legend */}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)] lg:items-end lg:gap-16">
          <motion.div
            variants={staggerContainer}
            initial={reduce ? false : "hidden"}
            whileInView="visible"
            viewport={VIEWPORT}
            className="max-w-[38rem]"
          >
            <motion.p variants={fadeUp} className={SECTION_EYEBROW}>
              Restoration CRM platform
            </motion.p>
            <motion.h2
              id="platform-heading"
              variants={fadeUp}
              className={SECTION_TITLE}
            >
              Everything the job needs — without the gaps
            </motion.h2>
            <motion.p variants={fadeUp} className={SECTION_BODY}>
              Built for Australian restoration companies that need compliance
              depth and field speed in the same product. From moisture logs to
              insurer-ready paperwork, RestoreAssist keeps office and field on
              one system.
            </motion.p>
          </motion.div>

          <motion.div
            variants={fadeUp}
            initial={reduce ? false : "hidden"}
            whileInView="visible"
            viewport={VIEWPORT}
            className="lg:pb-2"
          >
            <p
              className={`${FONT_DISPLAY} text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400`}
            >
              Where capability sits
            </p>
            <div className="mt-4 flex items-center gap-3">
              <span
                className={`${FONT_DISPLAY} text-sm font-semibold tracking-tight text-[#0B1F3A]`}
              >
                Field
              </span>
              <div className="relative h-px flex-1 bg-slate-300" aria-hidden>
                <span className="absolute top-1/2 left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#3B6D8C] bg-white" />
              </div>
              <span
                className={`${FONT_DISPLAY} text-sm font-semibold tracking-tight text-[#0B1F3A]`}
              >
                Office
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              Each capability stitches onto the same claim spine — nothing
              orphans between the driveway and the desk.
            </p>
          </motion.div>
        </div>

        {/* Gap-stitch spine */}
        <motion.ol
          variants={staggerContainer}
          initial={reduce ? false : "hidden"}
          whileInView="visible"
          viewport={VIEWPORT}
          className="relative mt-16 sm:mt-20 lg:mt-24"
        >
          {/* Desktop system spine */}
          <div
            className="pointer-events-none absolute top-0 bottom-0 left-1/2 hidden w-px -translate-x-1/2 bg-gradient-to-b from-[#3B6D8C]/50 via-slate-300 to-transparent lg:block"
            aria-hidden
          />
          <div
            className={`${FONT_DISPLAY} pointer-events-none absolute top-0 left-1/2 z-20 hidden -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#3B6D8C]/30 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#3B6D8C] lg:block`}
            aria-hidden
          >
            One system
          </div>

          {/* Mobile spine */}
          <div
            className="pointer-events-none absolute top-2 bottom-2 left-[0.7rem] w-px bg-gradient-to-b from-[#3B6D8C]/45 via-slate-300 to-transparent lg:hidden"
            aria-hidden
          />

          {FEATURES.map((f, i) => {
            const isLeft = f.side === "left";
            return (
              <motion.li
                key={f.title}
                variants={fadeUp}
                className="relative py-7 sm:py-8 lg:py-10"
              >
                {/* Spine node */}
                <span
                  className="absolute top-10 left-[0.45rem] z-10 h-3 w-3 rounded-full border-2 border-[#3B6D8C] bg-white lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2"
                  aria-hidden
                />
                {/* Stitch tick toward content — desktop */}
                <span
                  className={[
                    "pointer-events-none absolute top-1/2 hidden h-px w-8 -translate-y-1/2 bg-[#3B6D8C]/45 lg:block",
                    isLeft ? "right-1/2 mr-1.5" : "left-1/2 ml-1.5",
                  ].join(" ")}
                  aria-hidden
                />

                <div
                  className={[
                    "pl-8 lg:grid lg:grid-cols-2 lg:gap-16 lg:pl-0",
                    isLeft ? "" : "",
                  ].join(" ")}
                >
                  <article
                    className={[
                      "max-w-md",
                      isLeft
                        ? "lg:col-start-1 lg:justify-self-end lg:pr-10 lg:text-right"
                        : "lg:col-start-2 lg:justify-self-start lg:pl-10",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "flex items-baseline gap-3",
                        isLeft ? "lg:flex-row-reverse" : "",
                      ].join(" ")}
                    >
                      <span
                        className={`${FONT_DISPLAY} text-[11px] font-bold tabular-nums tracking-[0.16em] text-[#3B6D8C]`}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span
                        className={`${FONT_DISPLAY} text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400`}
                      >
                        {f.lane}
                      </span>
                    </div>
                    <h3
                      className={`${FONT_DISPLAY} mt-3 text-xl font-semibold tracking-[-0.02em] text-[#0B1F3A] sm:text-[1.35rem]`}
                    >
                      {f.title}
                    </h3>
                    <p
                      className={[
                        "mt-3 text-[15px] leading-[1.72] text-slate-600",
                        isLeft ? "lg:ml-auto" : "",
                      ].join(" ")}
                    >
                      {f.body}
                    </p>
                  </article>
                </div>
              </motion.li>
            );
          })}
        </motion.ol>

        {/* Closing stitch line */}
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT}
          transition={{ duration: 0.55, ease: EASE_OUT }}
          className={`${FONT_DISPLAY} mx-auto mt-6 max-w-lg text-center text-sm font-semibold tracking-[-0.01em] text-[#16345A] sm:mt-8`}
        >
          Field speed and compliance depth — stitched into one claim record.
        </motion.p>
      </div>
    </section>
  );
}
