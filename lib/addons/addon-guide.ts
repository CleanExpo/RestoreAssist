/**
 * RA-8466 — the words of the Simple walkthrough: one ordinary job through the
 * core CRM, then what each Field Add-On is for.
 *
 * Only words live here. Price, currency, billing period and whether a card
 * can be bought come from GET /api/addons/catalog (the billing registry and
 * lib/billing/addon-access.ts), so this file never states a price or a rule
 * that the server decides. A test keeps the keys of ADDON_GUIDE equal to the
 * registry's, so a new pack cannot ship without its explanation.
 *
 * Provider claims are limited to what the code enforces today (RA-8414): the
 * Voice pack refuses to run without the business's own ElevenLabs key; the
 * bookkeeping and Ascora packs sign in to the business's own account. No card
 * promises that RestoreAssist runs only on the customer's own keys.
 */

import {
  bookkeepingAddonDescription,
} from "@/lib/billing/bookkeeping-addon";
import { isMyobEnabled, isQuickBooksEnabled } from "@/lib/flags/one-crm-flags";
import { isUnderlayUrlImportEnabled } from "@/lib/sketch/underlay-import-flag";
import { PRICING_CONFIG } from "@/lib/pricing";

export interface CoreCrmStep {
  key: "job" | "evidence" | "report" | "invoice";
  title: string;
  /** What happens at this step, in the example job. */
  body: string;
  /** Where the step lives, offered only outside setup (setup links bounce). */
  href: string;
  hrefLabel: string;
}

/** The example job the core steps follow. Fictional. */
export const EXAMPLE_JOB =
  "Example: a burst pipe has flooded the kitchen of a house in Parramatta.";

export const CORE_CRM_STEPS: readonly CoreCrmStep[] = [
  {
    key: "job",
    title: "Open the job",
    body: "Add the client and the property, and the job is created. Everyone on your team sees it in My Jobs.",
    href: "/dashboard/inspections/new",
    hrefLabel: "Start a job",
  },
  {
    key: "evidence",
    title: "Capture field evidence",
    body: "On site, take photos, moisture readings and notes against the room they belong to.",
    href: "/dashboard/inspections",
    hrefLabel: "Open My Jobs",
  },
  {
    key: "report",
    title: "Write the report",
    body: "Turn what you captured into a written report you can download and send to the client or insurer.",
    href: "/dashboard/reports/new",
    hrefLabel: "Make a report",
  },
  {
    key: "invoice",
    title: "Invoice or get approval",
    body: "Bill the client from your rate card. Where a client must approve the work first, send it for their signature.",
    href: "/dashboard/invoices/new",
    hrefLabel: "Get a bill out",
  },
] as const;

export const CRM_WORKS_ALONE =
  "Your CRM works without any add-on. Every step above is part of your plan.";

/** The plan facts the walkthrough states, read from the pricing owner. */
export function planFacts(): {
  trialDays: number;
  planAmount: number;
  planCurrency: string;
} {
  return {
    trialDays: PRICING_CONFIG.free.trialDays,
    planAmount: PRICING_CONFIG.pricing.monthly.amount,
    planCurrency: PRICING_CONFIG.pricing.monthly.currency,
  };
}

export interface AddonGuideEntry {
  /** What it is for, in one sentence. */
  purpose: string;
  /** A real-world example. */
  example: string;
  /** What it does not do, so nobody buys it for the wrong job. */
  doesNotDo: string;
  /** Any outside account or key it needs, and who pays for that. */
  needs: string;
  /** Anything listed as coming soon, or null. */
  comingSoon: string | null;
}

function bookkeepingComingSoon(): string | null {
  const later: string[] = [];
  if (!isQuickBooksEnabled()) later.push("QuickBooks");
  if (!isMyobEnabled()) later.push("MYOB");
  if (later.length === 0) return null;
  return `${later.join(" and ")}: coming soon.`;
}

/** Keyed by AddonSku. A test keeps these keys equal to RECURRING_ADDONS. */
export const ADDON_GUIDE: Readonly<Record<string, AddonGuideEntry>> = {
  FLOORPLAN_UNDERLAY: {
    purpose:
      "Fetch a property's floor plan from REA, Domain or OnTheHouse and trace your sketch over it.",
    example:
      "For the Parramatta kitchen, pull the listing plan and trace the wet rooms instead of measuring every wall.",
    doesNotDo:
      "It does not measure the property for you, and not every address has a plan online. Uploading your own plan image works without this pack.",
    needs: "No separate account needed.",
    comingSoon: isUnderlayUrlImportEnabled()
      ? null
      : "Fetching plans from listing sites is not switched on yet.",
  },
  BOOKKEEPING: {
    purpose: bookkeepingAddonDescription({
      quickbooks: isQuickBooksEnabled(),
      myob: isMyobEnabled(),
    }),
    example:
      "Send the finished job's invoice to Xero, so nobody types it in twice.",
    doesNotDo: "It does not do your bookkeeping or lodge your BAS.",
    needs:
      "Your own bookkeeping account, which your business pays for. You sign in once to connect it.",
    comingSoon: bookkeepingComingSoon(),
  },
  SERVICE_CRM: {
    purpose:
      "Sign in to Ascora once and bring your clients, jobs, history and pricing into RestoreAssist.",
    example:
      "Moving from Ascora: your existing clients and price list arrive without retyping.",
    doesNotDo:
      "It is a move into RestoreAssist, not a two-way link that keeps Ascora running alongside.",
    needs:
      "Your own Ascora account, which your business pays for, to sign in and bring the data across.",
    comingSoon: null,
  },
  PAYMENTS: {
    purpose: "Record client payments against your invoices when they pay by bank deposit.",
    example:
      "The client pays the Parramatta invoice by bank transfer; you mark it paid against that invoice.",
    doesNotDo: "It does not take card payments online.",
    needs: "No separate account needed.",
    comingSoon: null,
  },
  CLIENT_COMMS: {
    purpose: "Send clients automatic Restoration Pulse emails about where their job is up to.",
    example:
      "The homeowner gets an email when drying starts and another when the report is ready.",
    doesNotDo: "It does not send text messages, and it does not reply to clients for you.",
    needs: "No separate account needed.",
    comingSoon: null,
  },
  VOICE: {
    purpose: "Generate voiceovers and sound effects.",
    example: "Add a spoken walk-through to a client update video.",
    doesNotDo: "It does not answer phone calls or transcribe them.",
    needs:
      "Your own ElevenLabs key, which your business pays ElevenLabs for. It will not run without one.",
    comingSoon: null,
  },
  TECHNICIAN_SEATS: {
    purpose: "Add a field technician to your team so they can sign in and work on jobs.",
    example: "Your second technician starts Monday; add a seat and send them an invite.",
    doesNotDo: "It does not add an office manager or another business owner.",
    needs: "No separate account needed. Priced per technician seat.",
    comingSoon: null,
  },
  CLIENT_EDUCATION: {
    purpose:
      "Give clients an on-site video and guide library that explains the restoration process.",
    example:
      "Show the homeowner why the dehumidifiers must stay on for several days.",
    doesNotDo: "It does not replace your own advice to the client.",
    needs: "No separate account needed. One price for the whole business.",
    comingSoon: null,
  },
  AI_COPILOT: {
    purpose:
      "On-site standards answers, voice capture and findings written straight into the job.",
    example:
      "Ask what the drying goal is for the kitchen floor, and the answer is saved to the job.",
    doesNotDo: "It does not sign off the job or replace your technician's judgement.",
    needs:
      "Uses an AI service account. Check Settings, AI providers for whose account is used. One price for the whole business.",
    comingSoon: null,
  },
};

/** Who may switch a pack on, in plain words. */
export const WHO_CAN_ENABLE =
  "Only the business owner can add, change or cancel a pack. Team members see packs but cannot buy them.";
