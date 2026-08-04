"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { BRAND } from "@/lib/brand";
import { PRICING_CONFIG } from "@/lib/pricing";
import {
  MarketingShell,
  MarketingPageHero,
} from "@/components/landing/home";
import {
  fadeUp,
  fadeUpSoft,
  staggerContainer,
  staggerFast,
  revealImage,
  FONT_DISPLAY,
  CONTAINER,
  SECTION_PAD,
  SECTION_EYEBROW,
  SECTION_TITLE,
  SECTION_BODY,
  VIEWPORT,
  HAIRLINE,
  CTA_PRIMARY,
  CTA_SECONDARY,
  EASE_OUT,
} from "@/components/landing/home/motion";
import { useLandingReduceMotion } from "@/components/landing/home/useLandingReduceMotion";

const trialDays = PRICING_CONFIG.free.trialDays;
const trialReports = PRICING_CONFIG.free.trialReportCredits;

const JOURNEY = [
    {
      number: "01",
    phase: "Setup",
    title: "Open the job in one workspace",
    body: `Create your account and land in a ${trialDays}-day trial with ${trialReports} report credits. Add your Anthropic or OpenAI key once — RestoreAssist drafts with your workspace key, not a hidden platform meter. Then open an inspection for the property and claim type (water, fire, mould, storm, and more).`,
    tags: ["Account", "AI key", "Business details", "First inspection"],
    carries: "Inspection opened on the claim",
    },
    {
      number: "02",
    phase: "Field",
    title: "Capture once on site",
    body: "On the driveway or inside the property, record what the claim needs: photos, moisture readings, sketches, notes, and hazards. Field mode is built for the job site — including offline capture that syncs when you are back online — so evidence stays tied to the inspection instead of living in a camera roll.",
    tags: ["Photos", "Moisture", "Sketches", "Voice notes", "Offline sync"],
    carries: "Evidence attached to the same job",
    },
    {
      number: "03",
    phase: "Desk",
    title: "Draft the report — then own the words",
    body: "From what you captured, RestoreAssist helps produce an IICRC S500-aligned report draft in minutes. Completeness and weakness checks surface gaps before you send. You review, rewrite, and acknowledge ownership before a clean export — professional judgement stays with the holder on every claim.",
    tags: ["IICRC S500 draft", "Gap checks", "You own the export"],
    carries: "Owned report ready for billing",
    },
    {
      number: "04",
    phase: "Office",
    title: "Invoice with GST confidence",
    body: "Raise GST-ready invoices from the desk — or seed lines from the report — with Australian 10% or New Zealand 15% rules built in. Connect Xero, QuickBooks, MYOB, ServiceM8, or Ascora when your office already runs those systems.",
    tags: ["AU & NZ GST", "Accounting sync", "Credit notes"],
    carries: "Invoice linked to the report",
    },
    {
      number: "05",
    phase: "Approval",
    title: "Get sign-off without retyping",
    body: "Share the job through the client portal so homeowners can review status, upload, and approve scope or cost estimates. Send insurers a read-only link when they need visibility. Authority forms can be signed remotely — so approval does not mean another round of copy-paste.",
    tags: ["Client portal", "Insurer link", "E-sign"],
    carries: "Signed off — claim closed cleanly",
  },
] as const;

const GUARDS = [
  {
    title: "You own the report",
    body: "AI drafts are watermarked until you rewrite and confirm ownership. Nothing leaves as “the system said so.”",
  },
  {
    title: "Your AI key, your cost control",
    body: "Workspace Anthropic or OpenAI keys power drafting and Quick Fill. No surprise spend against a shared platform pool.",
  },
  {
    title: "Standards stay in the workflow",
    body: "IICRC frameworks, WHS gates, and Australian Building Code / NCC references sit inside daily capture and reporting — not a separate binder after the job.",
  },
] as const;

const ROLES = [
  {
    role: "Field technicians",
    body: "Capture evidence, moisture, and notes on site — including offline — then hand the same job to the desk without rebuilding it.",
  },
  {
    role: "Managers & admins",
    body: "Invite the team, review drafts, clear WHS holds, manage billing and AI settings, and keep the workspace aligned.",
  },
  {
    role: "Clients & insurers",
    body: "Clients approve scope and cost in the portal. Insurers get a secure read-only view when they need to see the report.",
  },
] as const;

/**
 * Claim dossier — unique pattern for How It Works.
 * File-tab navigation + one active sheet, so the journey reads like
 * flipping a claim packet rather than another vertical step list.
 */
function ClaimDossier() {
  const reduce = useLandingReduceMotion();
  const labelId = useId();
  const [active, setActive] = useState(0);
  const step = JOURNEY[active];
  const total = JOURNEY.length;

  const go = useCallback(
    (next: number) => {
      setActive(((next % total) + total) % total);
    },
    [total],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        go(active + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(active - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, go]);

  return (
    <div className="mt-12 sm:mt-14 lg:mt-16">
      {/* Folder tabs */}
      <div
        role="tablist"
        aria-labelledby={labelId}
        className="flex gap-1 overflow-x-auto pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <span id={labelId} className="sr-only">
          Claim stages
        </span>
        {JOURNEY.map((item, i) => {
          const selected = i === active;
          return (
            <button
              key={item.number}
              type="button"
              role="tab"
              id={`claim-tab-${item.number}`}
              aria-selected={selected}
              aria-controls="claim-dossier-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              className={[
                FONT_DISPLAY,
                "relative shrink-0 rounded-t-xl border px-4 py-3 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6D8C]/50 focus-visible:ring-offset-2 sm:px-5",
                selected
                  ? "z-10 border-slate-200/90 border-b-white bg-white text-[#0B1F3A]"
                  : "border-transparent bg-slate-200/40 text-slate-500 hover:bg-slate-200/70 hover:text-[#16345A]",
              ].join(" ")}
            >
              <span className="block text-[10px] font-bold tabular-nums tracking-[0.14em] text-[#3B6D8C]">
                {item.number}
              </span>
              <span className="mt-0.5 block text-[13px] font-semibold tracking-[-0.01em] sm:text-sm">
                {item.phase}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active sheet */}
      <div
        id="claim-dossier-panel"
        role="tabpanel"
        aria-labelledby={`claim-tab-${step.number}`}
        className="relative overflow-hidden rounded-b-2xl rounded-tr-2xl border border-slate-200/90 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.05)]"
      >
        {/* Progress ink line — claim completeness metaphor */}
        <div
          className="absolute inset-x-0 top-0 h-0.5 bg-slate-100"
          aria-hidden
        >
          <motion.div
            className="h-full bg-[#3B6D8C]"
            initial={false}
            animate={{ width: `${((active + 1) / total) * 100}%` }}
            transition={
              reduce
                ? { duration: 0 }
                : { duration: 0.45, ease: EASE_OUT }
            }
          />
        </div>

        <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
          {/* Typographic folio */}
          <div className="relative flex flex-col justify-between border-b border-slate-200/80 bg-[#F8FAFB] px-6 py-8 sm:px-8 sm:py-10 lg:border-r lg:border-b-0 lg:px-10 lg:py-12">
            <div>
              <p
                className={`${FONT_DISPLAY} text-[11px] font-semibold uppercase tracking-[0.2em] text-[#3B6D8C]`}
              >
                Claim stage
              </p>
              <p
                className={`${FONT_DISPLAY} mt-4 text-[4.5rem] font-semibold leading-none tracking-[-0.06em] text-[#0B1F3A] sm:text-[5.5rem] lg:text-[6.5rem]`}
                aria-hidden
              >
                {step.number}
              </p>
              <p
                className={`${FONT_DISPLAY} mt-4 text-xl font-semibold tracking-[-0.02em] text-[#16345A] sm:text-2xl`}
              >
                {step.phase}
              </p>
            </div>
            <div className="mt-10 border-t border-slate-200/90 pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                Carries forward
              </p>
              <p
                className={`${FONT_DISPLAY} mt-2 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-[#0B1F3A]`}
              >
                {step.carries}
              </p>
            </div>
          </div>

          {/* Narrative */}
          <div className="relative min-h-[22rem] px-6 py-8 sm:min-h-[24rem] sm:px-8 sm:py-10 lg:px-12 lg:py-12">
            <AnimatePresence mode="wait">
              <motion.div
                key={step.number}
                initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: 0.35, ease: EASE_OUT }}
              >
                <h3
                  className={`${FONT_DISPLAY} text-[1.45rem] font-semibold leading-[1.15] tracking-[-0.025em] text-[#0B1F3A] sm:text-[1.85rem] sm:leading-[1.12]`}
                >
                  {step.title}
                </h3>
                <p className="mt-4 max-w-xl text-[15px] leading-[1.75] text-slate-600 sm:mt-5 sm:text-base sm:leading-[1.72]">
                  {step.body}
                </p>
                <ul className="mt-6 flex flex-wrap gap-2 sm:mt-7">
                  {step.tags.map((tag) => (
                    <li
                      key={tag}
                      className={`${FONT_DISPLAY} rounded-md border border-slate-200/90 bg-[#F3F5F7] px-2.5 py-1 text-[12px] font-medium tracking-[-0.01em] text-[#16345A]`}
                    >
                      {tag}
                    </li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>

            {/* Pager */}
            <div className="mt-10 flex items-center justify-between gap-4 border-t border-slate-200/80 pt-5">
              <p className="text-sm text-slate-500">
                <span className={`${FONT_DISPLAY} font-semibold text-[#0B1F3A]`}>
                  {active + 1}
                </span>
                <span className="mx-1.5 text-slate-300">/</span>
                <span>{total}</span>
                <span className="ml-2 hidden text-slate-400 sm:inline">
                  Use ← → to flip stages
                </span>
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => go(active - 1)}
                  className={`${FONT_DISPLAY} inline-flex h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200/90 bg-white px-3 text-sm font-semibold text-[#0B1F3A] transition-colors hover:border-slate-300 hover:bg-[#F3F5F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6D8C]/50`}
                  aria-label="Previous claim stage"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => go(active + 1)}
                  className={`${FONT_DISPLAY} inline-flex h-11 min-w-11 items-center justify-center rounded-xl bg-[#0B1F3A] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#16345A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6D8C]/50`}
                  aria-label="Next claim stage"
                >
                  →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HowItWorksPage() {
  const reduce = useLandingReduceMotion();

  return (
    <MarketingShell>
      <MarketingPageHero
        eyebrow="The workflow"
        title="From site capture to signed report — without rebuilding the job twice"
        description={`${BRAND.tagline} Capture on site, finish IICRC-aligned reports at the desk, invoice with GST confidence, and collect approvals in one restoration CRM — so field and office stop double-handling the same claim.`}
      />

      {/* Journey — claim dossier pattern */}
      <section
        className={`relative overflow-hidden bg-[#F3F5F7] ${HAIRLINE} ${SECTION_PAD}`}
        aria-labelledby="journey-heading"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_45%_at_100%_0%,rgba(59,109,140,0.08),transparent_60%)]"
          aria-hidden
        />
        <div className={`${CONTAINER} relative`}>
          <motion.div
            variants={staggerContainer}
            initial={reduce ? false : "hidden"}
            whileInView="visible"
            viewport={VIEWPORT}
            className="max-w-[40rem]"
          >
            <motion.p variants={fadeUp} className={SECTION_EYEBROW}>
              Remove double-handling
            </motion.p>
            <motion.h2
              id="journey-heading"
              variants={fadeUp}
              className={SECTION_TITLE}
            >
              How a claim moves through RestoreAssist
            </motion.h2>
            <motion.p variants={fadeUp} className={SECTION_BODY}>
              Flip through the claim packet — each stage builds on the last, so
              field evidence, desk review, invoicing, and approval stay on one
              record.
            </motion.p>
          </motion.div>

          <ClaimDossier />
        </div>
      </section>

      {/* Field visual */}
      <section className={`bg-white ${HAIRLINE} ${SECTION_PAD}`}>
        <div className={CONTAINER}>
          <motion.div
            variants={staggerContainer}
            initial={reduce ? false : "hidden"}
            whileInView="visible"
            viewport={VIEWPORT}
            className="mx-auto max-w-2xl text-center"
          >
            <motion.p variants={fadeUp} className={SECTION_EYEBROW}>
              Built for the driveway
            </motion.p>
            <motion.h2
              variants={fadeUp}
              className={SECTION_TITLE}
            >
              Evidence captured once stays with the job
            </motion.h2>
          <motion.p
              variants={fadeUp}
              className={`${SECTION_BODY} mx-auto text-center`}
            >
              Photos, moisture, and sketches feed the same inspection the office
              finishes — so the report is not a second draft from memory.
            </motion.p>
          </motion.div>

          <motion.div
            variants={revealImage}
            initial={reduce ? false : "hidden"}
            whileInView="visible"
            viewport={VIEWPORT}
            className="relative mt-12 aspect-[21/9] min-h-[14rem] overflow-hidden rounded-2xl border border-slate-200/90 shadow-[0_12px_40px_rgba(15,23,42,0.06)] sm:mt-16 sm:min-h-[16rem]"
          >
            <Image
              src="/landing/field-capture.jpg"
              alt="Restoration technician documenting site conditions for a claim"
              fill
              className="object-cover"
              sizes="80vw"
            />
          </motion.div>
        </div>
      </section>

      {/* Trust / ownership */}
      <section
        className={`bg-[#F3F5F7] ${HAIRLINE} ${SECTION_PAD}`}
        aria-labelledby="guards-heading"
      >
        <div className={CONTAINER}>
          <motion.div
            variants={staggerContainer}
            initial={reduce ? false : "hidden"}
            whileInView="visible"
            viewport={VIEWPORT}
            className="max-w-[38rem]"
          >
            <motion.p variants={fadeUp} className={SECTION_EYEBROW}>
              Designed for operators
            </motion.p>
            <motion.h2
              id="guards-heading"
              variants={fadeUp}
              className={SECTION_TITLE}
            >
              Assistance without handing over the claim
            </motion.h2>
            <motion.p variants={fadeUp} className={SECTION_BODY}>
              RestoreAssist speeds the paperwork path. Liability and professional
              opinion stay with your company — the way restoration work actually
              requires.
            </motion.p>
          </motion.div>

          <motion.ul
            variants={staggerFast}
            initial={reduce ? false : "hidden"}
            whileInView="visible"
            viewport={VIEWPORT}
            className="mt-14 grid gap-10 sm:mt-16 lg:grid-cols-3 lg:gap-12"
          >
            {GUARDS.map((item) => (
              <motion.li key={item.title} variants={fadeUpSoft}>
                <h3
                  className={`${FONT_DISPLAY} text-lg font-semibold tracking-[-0.015em] text-[#0B1F3A]`}
                >
                  {item.title}
                </h3>
                <p className="mt-3 text-[15px] leading-[1.72] text-slate-600">
                  {item.body}
                </p>
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </section>

      {/* Roles */}
      <section
        className={`bg-white ${HAIRLINE} ${SECTION_PAD}`}
        aria-labelledby="roles-heading"
      >
        <div className={CONTAINER}>
              <motion.div
            variants={staggerContainer}
            initial={reduce ? false : "hidden"}
            whileInView="visible"
            viewport={VIEWPORT}
            className="mx-auto max-w-2xl text-center"
          >
            <motion.p variants={fadeUp} className={SECTION_EYEBROW}>
              One system, clear roles
            </motion.p>
            <motion.h2
              id="roles-heading"
              variants={fadeUp}
              className={SECTION_TITLE}
            >
              Field, office, and client on the same claim
            </motion.h2>
            <motion.p
              variants={fadeUp}
              className={`${SECTION_BODY} mx-auto text-center`}
            >
              {BRAND.slogan}
            </motion.p>
          </motion.div>

          <motion.ul
            variants={staggerContainer}
            initial={reduce ? false : "hidden"}
            whileInView="visible"
            viewport={VIEWPORT}
            className="mt-14 grid gap-10 sm:mt-16 lg:grid-cols-3 lg:gap-8"
          >
            {ROLES.map((item) => (
              <motion.li
                key={item.role}
                variants={fadeUp}
                className="border-t border-slate-200/90 pt-6"
              >
                <h3
                  className={`${FONT_DISPLAY} text-lg font-semibold tracking-[-0.015em] text-[#0B1F3A]`}
                >
                  {item.role}
                </h3>
                <p className="mt-3 text-[15px] leading-[1.72] text-slate-600">
                  {item.body}
                </p>
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </section>

      {/* Closing CTA */}
      <section
        className={`relative overflow-hidden bg-[#F3F5F7] ${HAIRLINE} ${SECTION_PAD}`}
        aria-labelledby="hiw-cta-heading"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(59,109,140,0.09),transparent_70%)]"
          aria-hidden
        />
        <div className={`${CONTAINER} relative text-center`}>
          <div className="mx-auto max-w-3xl">
            <motion.div
              variants={staggerContainer}
              initial={reduce ? false : "hidden"}
              whileInView="visible"
              viewport={VIEWPORT}
            >
              <motion.p variants={fadeUp} className={SECTION_EYEBROW}>
                Start with real work
              </motion.p>
              <motion.h2
                id="hiw-cta-heading"
                variants={fadeUp}
                className={`${FONT_DISPLAY} mt-4 text-[1.9rem] font-semibold leading-[1.12] tracking-[-0.02em] text-[#0B1F3A] sm:text-[2.35rem] lg:text-[2.85rem] lg:leading-[1.08]`}
              >
                Prove it on your next claim
              </motion.h2>
              <motion.p
                variants={fadeUp}
                className="mx-auto mt-4 max-w-xl text-[15px] leading-[1.72] text-slate-600 sm:text-[17px]"
              >
                {trialDays}-day trial · {trialReports} report credits · no
                credit card required. Capture once, finish the report, invoice,
                and get approval — in one Australian-designed restoration CRM.
              </motion.p>
              <motion.div
                variants={fadeUp}
                className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
              >
                <Link href={BRAND.cta.primary.href} className={CTA_PRIMARY}>
                  Start free trial
                </Link>
                <Link href="/pricing" className={CTA_SECONDARY}>
                  View pricing
                </Link>
              </motion.div>
              <motion.p
                variants={fadeUp}
                className={`${FONT_DISPLAY} mt-8 text-sm font-semibold tracking-[-0.01em] text-[#16345A]`}
              >
                {BRAND.slogan}
              </motion.p>
            </motion.div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
