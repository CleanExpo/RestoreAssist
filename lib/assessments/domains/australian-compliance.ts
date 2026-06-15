/**
 * AUSTRALIAN_COMPLIANCE domain plug-in — RA-1717.
 *
 * Final domain in the V1.1 set. Different shape from the loss-type
 * domains (water / mould / biohazard / fire-smoke / storm / hvac):
 * this is a **compliance attestation rollup** that surfaces the AU
 * regulatory obligations attached to a restoration job.
 *
 * Input options:
 *   {
 *     state?: 'NSW'|'VIC'|'QLD'|'WA'|'SA'|'TAS'|'ACT'|'NT'  // override
 *     hasLabourHire?: boolean,        // RA-1388 labour-hire attestation
 *     hasBiohazard?: boolean,         // EPA controlled-waste manifest
 *     iicrcCertifications?: string[]  // e.g. ["WRT", "ASD", "AMRT"]
 *   }
 *
 * Output sections cover (where applicable):
 *   - WHS Act 2011 §19 — primary duty of care (officers' due diligence)
 *   - General Insurance Code of Practice 2020 §4.2 — claim notification SLAs
 *   - Fair Work + Super Guarantee 12% from 1 Jul 2025 (only when hasLabourHire)
 *   - Privacy Act 1988 (Cth) + Notifiable Data Breaches scheme
 *   - State EPA controlled-waste / clinical waste (only when hasBiohazard)
 *   - IICRC certification verification (always)
 *   - AU Consumer Law warranties on services
 *
 * Scope items here are **documentation deliverables**, not physical
 * remediation tasks. The estimate captures the admin cost of producing
 * + retaining each artefact.
 */

import { prisma } from "@/lib/prisma";
import { gstForInspection } from "@/lib/assessments/gst";
import type { GstTreatment } from "@/lib/gst-rules";
import { detectStateFromPostcode } from "@/lib/state-detection";
import type {
  AssessmentEstimate,
  AssessmentReport,
  DomainGenerateInput,
  DomainGenerateResult,
  DomainPlugin,
  EstimateLine,
  ReportSection,
  ScopeItem,
  StandardCitation,
} from "../types";

// ─── Pricing ─────────────────────────────────────────────────────────────────

const ADMIN_HOUR_AUD = 95;
// ─── Options narrowing ──────────────────────────────────────────────────────

type AustralianState =
  | "NSW"
  | "VIC"
  | "QLD"
  | "WA"
  | "SA"
  | "TAS"
  | "ACT"
  | "NT";

const VALID_STATES: readonly AustralianState[] = [
  "NSW",
  "VIC",
  "QLD",
  "WA",
  "SA",
  "TAS",
  "ACT",
  "NT",
];

const VALID_IICRC_CODES = new Set([
  "WRT", // Water Damage Restoration Technician
  "ASD", // Applied Structural Drying
  "AMRT", // Applied Microbial Remediation
  "FSRT", // Fire & Smoke Restoration
  "OCT", // Odor Control
  "CCT", // Carpet Cleaning
  "RRRP", // Lead-safe (US-aligned, sometimes referenced in AU)
  "S500",
  "S520",
  "S540",
  "S700",
]);

interface ComplianceOptions {
  state?: AustralianState;
  hasLabourHire?: boolean;
  hasBiohazard?: boolean;
  iicrcCertifications?: string[];
}

function narrowOptions(
  options: Record<string, unknown> | null | undefined,
): ComplianceOptions {
  if (!options || typeof options !== "object") return {};
  const out: ComplianceOptions = {};
  if (
    typeof options.state === "string" &&
    VALID_STATES.includes(options.state as AustralianState)
  ) {
    out.state = options.state as AustralianState;
  }
  if (typeof options.hasLabourHire === "boolean") {
    out.hasLabourHire = options.hasLabourHire;
  }
  if (typeof options.hasBiohazard === "boolean") {
    out.hasBiohazard = options.hasBiohazard;
  }
  if (Array.isArray(options.iicrcCertifications)) {
    out.iicrcCertifications = options.iicrcCertifications
      .filter((c): c is string => typeof c === "string")
      .map((c) => c.trim().toUpperCase())
      .filter((c) => VALID_IICRC_CODES.has(c));
  }
  return out;
}

function resolveState(
  override: AustralianState | undefined,
  postcode: string | null | undefined,
): AustralianState {
  if (override) return override;
  const detected = postcode ? detectStateFromPostcode(postcode) : null;
  if (detected && VALID_STATES.includes(detected as AustralianState)) {
    return detected as AustralianState;
  }
  return "NSW";
}

// ─── Scope (documentation deliverables) ─────────────────────────────────────

function buildScope(
  opts: ComplianceOptions,
  state: AustralianState,
): {
  items: ScopeItem[];
  rateByDescription: Map<string, number>;
} {
  const items: ScopeItem[] = [];
  const rates = new Map<string, number>();

  function add(
    description: string,
    iicrcRef: string,
    hours: number,
    notes?: string,
  ) {
    items.push({
      description,
      category: "ADMIN",
      quantity: hours,
      unit: "hr",
      iicrcRef,
      notes,
    });
    rates.set(description, ADMIN_HOUR_AUD);
  }

  // Always: WHS, GICOP, Privacy, IICRC, AU Consumer Law

  add(
    "WHS site safety + risk-assessment documentation",
    "WHS Act 2011 §19",
    1.5,
    "Officers' due-diligence record per primary duty of care.",
  );

  add(
    "GICOP §4.2 claim-status notification log",
    "General Insurance Code of Practice 2020 §4.2",
    1,
    "Claim acknowledgement within 1 day; first assessment update within 10 days; retention 7 years.",
  );

  add(
    "Privacy Act compliance log (Notifiable Data Breaches readiness)",
    "Privacy Act 1988 (Cth) §13A + Australian Privacy Principles",
    1,
    "Data flow log + NDB notification template; required for any claim involving personal information.",
  );

  add(
    "IICRC certification verification + retention",
    "IICRC member-firm operating standard",
    0.5,
    "Verify technician's S500 / S520 / S540 / S700 cert numbers + currency; retain on file for the claim.",
  );

  add(
    "AU Consumer Law statutory warranty disclosure",
    "Competition and Consumer Act 2010 — Schedule 2 §54-§61",
    0.5,
    "Statutory consumer guarantees — services provided with due care + skill, fit for purpose, in reasonable time.",
  );

  // Conditional: labour-hire (M-13 attestation flow already handles the
  // per-job capture; this line covers the per-claim documentation).
  if (opts.hasLabourHire) {
    add(
      "Labour-hire engagement file (Fair Work + SG 12% + portable LSL)",
      "Fair Work Act 2009 + Superannuation Guarantee (Administration) Act 1992",
      1,
      "Per-engagement: hours, award classification, super payment evidence, induction proof, portable-LSL state filing where applicable.",
    );
  }

  // Conditional: biohazard
  if (opts.hasBiohazard) {
    add(
      `${state} EPA controlled-waste manifest`,
      `${state} EPA controlled / clinical waste regulations`,
      0.5,
      "Manifest required prior to transport off-site; retention 7 years (matches NDB record-retention floor).",
    );
  }

  return { items, rateByDescription: rates };
}

function buildEstimate(
  scope: ScopeItem[],
  rateByDescription: Map<string, number>,
  gst: GstTreatment,
): AssessmentEstimate {
  const lines: EstimateLine[] = scope.map((item) => {
    const rate = rateByDescription.get(item.description) ?? 0;
    const lineTotalExGst = +(item.quantity * rate).toFixed(2);
    const gstAmount = +(lineTotalExGst * gst.rate).toFixed(2);
    const lineTotalIncGst = +(lineTotalExGst + gstAmount).toFixed(2);
    return {
      description: item.description,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      rate,
      lineTotalExGst,
      gstAmount,
      lineTotalIncGst,
    };
  });
  const subtotalExGst = +lines
    .reduce((s, l) => s + l.lineTotalExGst, 0)
    .toFixed(2);
  const gstTotal = +lines.reduce((s, l) => s + l.gstAmount, 0).toFixed(2);
  const totalIncGst = +(subtotalExGst + gstTotal).toFixed(2);
  return {
    lines,
    totals: {
      subtotalExGst,
      gstTotal,
      totalIncGst,
      gstRate: gst.rate,
      currency: gst.currency,
    },
  };
}

// ─── Report ──────────────────────────────────────────────────────────────────

function buildReport(args: {
  propertyAddress: string;
  state: AustralianState;
  hasLabourHire: boolean;
  hasBiohazard: boolean;
  iicrcCertifications: string[];
}): { report: AssessmentReport; citations: StandardCitation[] } {
  const cites: StandardCitation[] = [];
  const cite = (
    standard: string,
    section: string,
    note?: string,
  ): StandardCitation => {
    const c = { standard, section, note };
    cites.push(c);
    return c;
  };

  const sections: ReportSection[] = [];

  sections.push({
    heading: "Compliance scope",
    body:
      `Compliance attestation rollup for ${args.propertyAddress} ` +
      `(${args.state}). The pack records the AU regulatory obligations ` +
      `attached to the restoration job and surfaces the documentation ` +
      `deliverables that must accompany the claim file.`,
    citations: [],
  });

  sections.push({
    heading: "WHS Act 2011 §19 — primary duty of care",
    body:
      `Persons conducting a business or undertaking owe a primary duty ` +
      `of care to workers + others affected by the work. Officers' ` +
      `due-diligence chain requires (a) acquisition + use of risk ` +
      `controls knowledge, (b) understanding of the operations + ` +
      `hazards, (c) appropriate resources + processes, (d) compliance ` +
      `verification. Site-specific risk assessment retained on file.`,
    citations: [cite("Work Health and Safety Act 2011 (Cth)", "§19")],
  });

  sections.push({
    heading: "General Insurance Code of Practice 2020 §4.2 — claim SLAs",
    body:
      `Claim acknowledgement: within 1 business day of receipt. ` +
      `Initial assessment update: within 10 business days. ` +
      `Subsequent status updates at agreed intervals. Notification log ` +
      `is retained 7 years (matches NDB record-retention floor). ` +
      `Departures from the SLA must be recorded with rationale.`,
    citations: [cite("General Insurance Code of Practice 2020", "§4.2")],
  });

  if (args.hasLabourHire) {
    sections.push({
      heading: "Fair Work + Super Guarantee — labour-hire engagement",
      body:
        `Labour-hire workers engaged on this job: hours captured per ` +
        `job, award classification documented, Super Guarantee paid ` +
        `at minimum 12% (statutory rate from 1 Jul 2025), portable ` +
        `Long Service Leave filed with the relevant state authority ` +
        `(NSW LSC / VIC CoINVEST / QLD QLeave / ACT Authority / TAS ` +
        `TasBuild — N/A in WA / SA / NT). Induction evidence retained ` +
        `as per RA-1388 attestation flow.`,
      citations: [
        cite("Fair Work Act 2009 (Cth)", "Chapter 2 — Modern Awards"),
        cite(
          "Superannuation Guarantee (Administration) Act 1992 (Cth)",
          "§19 (12% rate from 1 Jul 2025)",
        ),
      ],
    });
  }

  sections.push({
    heading: "Privacy Act 1988 (Cth) — APP + NDB",
    body:
      `Personal information collected during the claim (claimant + ` +
      `occupant identity, contact details, photographs of damage) is ` +
      `held + used per APP 6 (use + disclosure) and APP 11 (security). ` +
      `Notifiable Data Breaches scheme: any eligible breach reported ` +
      `to OAIC + affected individuals within 30 days of discovery.`,
    citations: [
      cite("Privacy Act 1988 (Cth)", "§13A — Notifiable Data Breaches"),
      cite("Australian Privacy Principles", "APP 6 + APP 11"),
    ],
  });

  if (args.hasBiohazard) {
    sections.push({
      heading: `${args.state} EPA controlled-waste pathway`,
      body:
        `Job involves biohazard / Cat-3 contamination. All affected ` +
        `material classified as clinical / controlled waste per ` +
        `${args.state} EPA regulations. Manifest issued prior to ` +
        `transport off-site; clinical-waste-licensed transporter only. ` +
        `Manifest retained 7 years.`,
      citations: [cite(`${args.state} EPA`, "Controlled / clinical waste")],
    });
  }

  sections.push({
    heading: "IICRC certification verification",
    body:
      args.iicrcCertifications.length === 0
        ? `No IICRC certifications recorded for the technician(s) on this ` +
          `job. Capture before claim submission — assessors increasingly ` +
          `require evidence of S500 / S520 / S540 / S700 certification ` +
          `currency for the relevant loss type.`
        : `Recorded technician certifications: ` +
          `${args.iicrcCertifications.join(", ")}. Verify currency + ` +
          `member-firm status against the IICRC certifications portal ` +
          `before invoicing; retain certificate scans on file.`,
    citations: [cite("IICRC", "Member-firm operating standard")],
  });

  sections.push({
    heading: "AU Consumer Law statutory warranties",
    body:
      `Services provided with due care + skill, fit for purpose, in ` +
      `reasonable time. Statutory guarantees cannot be excluded by ` +
      `contract. Disclosed to the consumer + retained on file.`,
    citations: [
      cite("Competition and Consumer Act 2010 (Cth)", "Schedule 2 §54-§61"),
    ],
  });

  // Dedupe
  const citations: StandardCitation[] = cites.filter(
    (c, i, arr) =>
      arr.findIndex(
        (d) => d.standard === c.standard && d.section === c.section,
      ) === i,
  );

  return { report: { sections }, citations };
}

// ─── Plug-in ─────────────────────────────────────────────────────────────────

export const australianComplianceDomain: DomainPlugin = {
  domain: "AUSTRALIAN_COMPLIANCE",
  label: "AU compliance attestation (WHS / GICOP / Privacy / IICRC)",

  async generate(input: DomainGenerateInput): Promise<DomainGenerateResult> {
    const start = Date.now();
    try {
      const opts = narrowOptions(input.options);

      const inspection = await prisma.inspection.findUnique({
        where: { id: input.inspectionId },
        select: {
          id: true,
          propertyAddress: true,
          propertyPostcode: true,
        },
      });
      if (!inspection) {
        return {
          ok: false,
          code: "NOT_FOUND",
          message: "Inspection not found",
        };
      }

      const state = resolveState(opts.state, inspection.propertyPostcode);
      const hasLabourHire = opts.hasLabourHire ?? false;
      const hasBiohazard = opts.hasBiohazard ?? false;
      const iicrcCertifications = opts.iicrcCertifications ?? [];

      const { items: scope, rateByDescription } = buildScope(
        { hasLabourHire, hasBiohazard, iicrcCertifications, state },
        state,
      );
      const gst = await gstForInspection(input.inspectionId);
      const estimate = buildEstimate(scope, rateByDescription, gst);
      const { report, citations } = buildReport({
        propertyAddress: inspection.propertyAddress,
        state,
        hasLabourHire,
        hasBiohazard,
        iicrcCertifications,
      });

      return {
        ok: true,
        data: {
          report,
          scope: { items: scope },
          estimate,
          citations,
          meta: {
            modelUsed: null,
            latencyMs: Date.now() - start,
            costEstimateUsd: 0,
            workspaceId: input.workspaceId,
          },
        },
      };
    } catch (err) {
      console.error("[assessments.australian-compliance] generate failed", err);
      return {
        ok: false,
        code: "INTERNAL",
        message: "Australian compliance generation failed",
      };
    }
  },
};
