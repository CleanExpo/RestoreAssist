import { BRAND } from "@/lib/brand";
import { PRICING_CONFIG } from "@/lib/pricing";

const trialDays = PRICING_CONFIG.free.trialDays;
const trialReports = PRICING_CONFIG.free.trialReportCredits;

/** Shared marketing home copy — same words on Home 1 / 2 / 3; only layout changes. */
export const HOME = {
  trust: [
    "IICRC S500:2021",
    "NCC 2022",
    "WHS built-in",
    "Australian-designed",
    "Australia + New Zealand",
  ] as const,

  hero: {
    eyebrow: BRAND.tagline,
    headline:
      "What you captured on site shouldn't need a second draft at the desk.",
    brand: BRAND.name,
    valueLine: "From site to signed report. One system.",
    support:
      "The Australian restoration CRM that keeps field evidence, IICRC-aligned paperwork, and client approvals on the same record — so the office builds on the job, not beside it.",
    primaryCta: `Start free — ${trialDays}-day trial`,
    secondaryCta: "See how it works",
  },

  workflow: {
    eyebrow: "Remove double-handling",
    title: "Field, office, and client — connected end to end",
    body: "Inspection to scope to report to invoice. One restoration CRM so nothing gets lost between the driveway and the desk — and your team stops rebuilding the same paperwork on every claim.",
    steps: [
      {
        step: "01",
        title: "Capture on site",
        body: "Photos, moisture readings, voice notes, and floor plans — structured for the driveway, not the desktop. Evidence stays tied to the job from the first visit.",
      },
      {
        step: "02",
        title: "Finish the report",
        body: "IICRC S500:2021-aligned report drafts take shape in minutes from what you captured. You review, edit, and own every decision before it leaves your company.",
      },
      {
        step: "03",
        title: "Client approves",
        body: "Share professional PDFs, GST-ready invoices, and approvals through the client portal — so homeowners and insurers get clarity without retyping.",
      },
    ] as const,
  },

  beforeAfter: {
    eyebrow: "The double-handling problem",
    title: "Same job. Two systems. Too many gaps.",
    body: "Most restoration teams still move work from the driveway to the desk by hand. RestoreAssist keeps one record from capture to client approval — so nothing gets rewritten along the way.",
    beforeTitle: "Scattered tools. Repeated work.",
    afterTitle: "One record. One handoff.",
    before: [
      "Field notes on paper or phone",
      "Office retypes the same details",
      "Reports rebuilt from scratch",
      "Invoices and approvals chase by email",
    ] as const,
    after: [
      "Capture once on site",
      "Evidence stays on the job",
      "IICRC-aligned reports from the same record",
      "Client approvals in one portal",
    ] as const,
  },

  platform: {
    eyebrow: "Restoration CRM platform",
    title: "Everything the job needs — without the gaps",
    body: "Built for Australian restoration companies that need compliance depth and field speed in the same product. From moisture logs to insurer-ready paperwork, RestoreAssist keeps office and field on one system.",
    byok: "Drafting runs on your workspace Anthropic or OpenAI key — your spend, your control.",
    continuumLabel: "Where capability sits",
    continuumLeft: "Field",
    continuumRight: "Office",
    continuumNote:
      "Each capability stitches onto the same claim spine — nothing orphans between the driveway and the desk.",
    features: [
      {
        lane: "Desk",
        title: "Reports that hold up at audit",
        body: "Produce S500:2021-aligned report drafts that cut hours of writing. Every document stays under your review — professional judgement never leaves the operator.",
      },
      {
        lane: "Field",
        title: "Capture on site — even offline",
        body: "Evidence, moisture readings, sketches, and voice notes capture on site even without signal — then sync when you are back online.",
      },
      {
        lane: "Office",
        title: "Invoices that reconcile cleanly",
        body: "Variations, discounts, and professional PDF invoices that reconcile cleanly for Australian and New Zealand jobs — without spreadsheet rework.",
      },
      {
        lane: "Client",
        title: "Fewer chase-ups with homeowners",
        body: "Give homeowners a clear path to track progress, approve scopes, and download documents — fewer phone chases, faster sign-off.",
      },
      {
        lane: "Standards",
        title: "Compliance inside the workflow",
        body: "IICRC, WHS, and NCC 2022 references live inside the workflow so standards guide the job instead of living in a separate folder.",
      },
      {
        lane: "Team",
        title: "Office and field on the same job",
        body: "Roles, handoffs, and shared jobs keep field technicians and the office aligned on the same claim — from first visit to final invoice.",
      },
    ] as const,
  },

  damage: {
    eyebrow: "Damage types covered",
    title: "Built for the jobs you actually get called to",
    body: "Water, fire, storm, flood, and mould — one reporting system so your team is not reinventing the process on every claim. Consistent structure. Clearer handoffs. Stronger confidence at sign-off.",
    types: [
      {
        title: "Water damage restoration",
        body: "Category and class workflows with moisture documentation structured for audit, insurer review, and clear homeowner communication.",
      },
      {
        title: "Fire & smoke remediation",
        body: "Structured scoping for soot, odour, and contents — so estimates and reports stay consistent for claims teams and clients.",
      },
      {
        title: "Storm & flood response",
        body: "Rapid field capture when volume spikes. Keep reporting quality high when the phone never stops and crews are stretched thin.",
      },
      {
        title: "Mould remediation",
        body: "Containment and remediation notes tied to recognised standards — documentation that supports decisions, not guesswork.",
      },
    ] as const,
  },

  coverage: {
    eyebrow: "Australia & New Zealand",
    title: "Designed in Australia.",
    titleAside: "Deployed across Australia and New Zealand.",
    body: "State codes, GST, and jurisdictional references are built into the workflow — so restoration software for Queensland works the same way as New South Wales, without rewriting your process for every border you cross.",
    regions: [
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
    ] as const,
    builtIn: [
      { label: "GST", value: "AU 10% · NZ 15%" },
      { label: "Codes", value: "NCC 2022 · IICRC" },
      { label: "WHS", value: "State regulators in-flow" },
    ] as const,
  },

  faq: {
    eyebrow: "Frequently asked questions",
    title: "Straight answers for restoration teams",
    body: "Clear detail on trial, pricing, team use, compliance, and field work — so you can decide with confidence.",
  },

  cta: {
    eyebrow: "Start with real work",
    title: "Prove it on your next claim",
    slogan: BRAND.slogan,
    body: `Start with a ${trialDays}-day trial and ${trialReports} inspection report credits. Produce your first IICRC-aligned restoration report without rewriting the same job twice — then see how office and field stay aligned from capture to client approval.`,
    primaryCta: `Start free — ${trialDays}-day trial`,
    secondaryCta: "View pricing",
    reassurances: [
      `${trialDays}-day trial · ${trialReports} report credits`,
      "Instant setup",
      "24/7 support",
    ] as const,
  },
} as const;

export function getHomeFaqs() {
  const trialDays = PRICING_CONFIG.free.trialDays;
  const trialReports = PRICING_CONFIG.free.trialReportCredits;
  return [
    {
      cat: "Product",
      q: "What is RestoreAssist?",
      a: "RestoreAssist is Australia's first Australian-designed full CRM — an Office and Field Management System for the Australian Restoration Industry. It connects field capture, IICRC-aligned reporting, GST invoicing, and client approvals in one system so teams remove double-handling between the driveway and the desk.",
    },
    {
      cat: "Trial",
      q: "What's included in the free trial?",
      a: `${trialDays}-day trial with ${trialReports} inspection report credits and instant setup. Field capture, reporting, invoicing, and the client portal are ready from day one — so you can prove value on real work without rewriting your process.`,
    },
    {
      cat: "Pricing",
      q: "How does pricing work?",
      a: `Start free for ${trialDays} days with ${trialReports} report credits, then choose a plan that fits your team. See current options on the pricing page — clear packages, no need to rebuild your process just to evaluate the product.`,
    },
    {
      cat: "Team",
      q: "Can my whole team use it?",
      a: "Yes. Roles, handoffs, and shared jobs keep owners, office managers, and field technicians aligned on the same claim — from first visit to final invoice.",
    },
    {
      cat: "Reports",
      q: "Does RestoreAssist create IICRC S500 reports?",
      a: "Yes. RestoreAssist helps produce S500:2021-aligned report drafts so writing time drops from hours to minutes. You review, edit, and own the final document — professional judgement stays with the operator on every claim.",
    },
    {
      cat: "Setup",
      q: "Do I need my own AI key?",
      a: "Yes for drafting and Quick Fill. You add your Anthropic or OpenAI key once in workspace settings — RestoreAssist uses your key, not a shared platform meter. That keeps spend under your control. You still review and own every report before it leaves your company.",
    },
    {
      cat: "Compliance",
      q: "Is it compliant with Australian building codes and WHS?",
      a: "RestoreAssist includes inbuilt IICRC frameworks, WHS policies, and Australian Building Code / NCC 2022 references so compliance is part of the daily workflow — not a separate checklist after the job.",
    },
    {
      cat: "Field",
      q: "Can field technicians use it offline on site?",
      a: "Yes. Field capture is designed for real job sites — evidence, moisture readings, and sketches can be captured offline and sync when you are back online, so poor reception does not stall the job.",
    },
    {
      cat: "Office",
      q: "Does this replace our accounting tools?",
      a: "RestoreAssist is built for restoration operations — field capture, reporting, invoicing workflows, and client approvals. It sits alongside the tools your office already uses for bookkeeping rather than forcing a full finance rip-and-replace.",
    },
  ] as const;
}
