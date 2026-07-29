"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
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
} from "@/components/landing/home/motion";

const trialDays = PRICING_CONFIG.free.trialDays;
const trialReports = PRICING_CONFIG.free.trialReportCredits;

const JOURNEY = [
  {
    number: "01",
    phase: "Setup",
    title: "Open the job in one workspace",
    body: `Create your account and land in a ${trialDays}-day trial with ${trialReports} report credits. Add your Anthropic or OpenAI key once — RestoreAssist drafts with your workspace key, not a hidden platform meter. Then open an inspection for the property and claim type (water, fire, mould, storm, and more).`,
    tags: ["Account", "AI key", "Business details", "First inspection"],
  },
  {
    number: "02",
    phase: "Field",
    title: "Capture once on site",
    body: "On the driveway or inside the property, record what the claim needs: photos, moisture readings, sketches, notes, and hazards. Field mode is built for the job site — including offline capture that syncs when you are back online — so evidence stays tied to the inspection instead of living in a camera roll.",
    tags: ["Photos", "Moisture", "Sketches", "Voice notes", "Offline sync"],
  },
  {
    number: "03",
    phase: "Desk",
    title: "Draft the report — then own the words",
    body: "From what you captured, RestoreAssist helps produce an IICRC S500-aligned report draft in minutes. Completeness and weakness checks surface gaps before you send. You review, rewrite, and acknowledge ownership before a clean export — professional judgement stays with the holder on every claim.",
    tags: ["IICRC S500 draft", "Gap checks", "You own the export"],
  },
  {
    number: "04",
    phase: "Office",
    title: "Invoice with GST confidence",
    body: "Raise GST-ready invoices from the desk — or seed lines from the report — with Australian 10% or New Zealand 15% rules built in. Connect Xero, QuickBooks, MYOB, ServiceM8, or Ascora when your office already runs those systems.",
    tags: ["AU & NZ GST", "Accounting sync", "Credit notes"],
  },
  {
    number: "05",
    phase: "Approval",
    title: "Get sign-off without retyping",
    body: "Share the job through the client portal so homeowners can review status, upload, and approve scope or cost estimates. Send insurers a read-only link when they need visibility. Authority forms can be signed remotely — so approval does not mean another round of copy-paste.",
    tags: ["Client portal", "Insurer link", "E-sign"],
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

export default function HowItWorksPage() {
  const reduce = useReducedMotion();

  return (
    <MarketingShell>
      <MarketingPageHero
        eyebrow="The workflow"
        title="From site capture to signed report — without rebuilding the job twice"
        description={`${BRAND.tagline} Capture on site, finish IICRC-aligned reports at the desk, invoice with GST confidence, and collect approvals in one restoration CRM — so field and office stop double-handling the same claim.`}
      />

      {/* Journey */}
      <section
        className={`relative overflow-hidden bg-[#F3F5F7] ${HAIRLINE} ${SECTION_PAD}`}
        aria-labelledby="journey-heading"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_0%_0%,rgba(59,109,140,0.07),transparent_55%)]"
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
              One path from driveway capture to signed approval — so field and
              office stop rebuilding the same paperwork on every claim.
            </motion.p>
          </motion.div>

          {/* Scannable phase rail */}
          <motion.ol
            variants={staggerFast}
            initial={reduce ? false : "hidden"}
            whileInView="visible"
            viewport={VIEWPORT}
            className="relative mt-12 flex gap-2 overflow-x-auto pb-2 sm:mt-14 sm:gap-0 lg:mt-16"
            aria-label="Claim journey overview"
          >
            <div
              className="pointer-events-none absolute top-5 right-0 left-0 hidden h-px bg-slate-200/90 sm:block"
              aria-hidden
            />
            {JOURNEY.map((step) => (
              <motion.li
                key={`rail-${step.number}`}
                variants={fadeUpSoft}
                className="relative z-10 flex min-w-[7.5rem] flex-1 flex-col items-center px-1 text-center sm:min-w-0"
              >
                <span
                  className={`${FONT_DISPLAY} flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/90 bg-white text-xs font-bold tabular-nums tracking-tight text-[#3B6D8C] shadow-[0_1px_2px_rgba(15,23,42,0.04)]`}
                >
                  {step.number}
                </span>
                <span
                  className={`${FONT_DISPLAY} mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3B6D8C]`}
                >
                  {step.phase}
                </span>
              </motion.li>
            ))}
          </motion.ol>

          {/* Timeline detail */}
          <motion.ol
            variants={staggerContainer}
            initial={reduce ? false : "hidden"}
            whileInView="visible"
            viewport={VIEWPORT}
            className="relative mt-14 space-y-0 sm:mt-16"
          >
            <div
              className="pointer-events-none absolute top-3 bottom-3 left-[1.15rem] hidden w-px bg-gradient-to-b from-slate-200 via-slate-200 to-transparent sm:left-[1.35rem] lg:block"
              aria-hidden
            />
            {JOURNEY.map((step, index) => (
              <motion.li
                key={step.number}
                variants={fadeUp}
                className="relative grid gap-5 py-8 sm:grid-cols-[4.5rem_1fr] sm:gap-8 sm:py-10 lg:grid-cols-[5.5rem_minmax(0,1fr)] lg:gap-12"
              >
                {index > 0 ? (
                  <div
                    className="absolute inset-x-0 top-0 border-t border-slate-200/80 lg:border-slate-200/60"
                    aria-hidden
                  />
                ) : null}
                <div className="flex items-start gap-4 sm:flex-col sm:items-start sm:gap-3">
                  <span
                    className={`${FONT_DISPLAY} relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#3B6D8C]/25 bg-white text-xs font-bold tabular-nums text-[#3B6D8C] sm:h-11 sm:w-11 sm:text-sm`}
                  >
                    {step.number}
                  </span>
                  <span
                    className={`${FONT_DISPLAY} pt-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#3B6D8C] sm:pt-0`}
                  >
                    {step.phase}
                  </span>
                </div>
                <div className="min-w-0 max-w-3xl">
                  <h3
                    className={`${FONT_DISPLAY} text-[1.35rem] font-semibold leading-snug tracking-[-0.02em] text-[#0B1F3A] sm:text-2xl sm:leading-tight`}
                  >
                    {step.title}
                  </h3>
                  <p className="mt-3 max-w-2xl text-[15px] leading-[1.75] text-slate-600 sm:mt-4 sm:text-base sm:leading-[1.72]">
                    {step.body}
                  </p>
                  <ul className="mt-5 flex flex-wrap gap-2">
                    {step.tags.map((tag) => (
                      <li
                        key={tag}
                        className={`${FONT_DISPLAY} rounded-lg border border-slate-200/90 bg-white/80 px-2.5 py-1 text-[12px] font-medium tracking-[-0.01em] text-[#16345A]`}
                      >
                        {tag}
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.li>
            ))}
          </motion.ol>
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
