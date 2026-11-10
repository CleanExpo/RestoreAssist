/**
 * FIRE_SMOKE domain plug-in — RA-1717.
 *
 * Fourth concrete domain. Reads an Inspection plus a domain-options
 * payload (`smokeType` + `charLevel`) and produces:
 *
 *   - report  — IICRC S700:2025 grounded sections (situation,
 *               smoke classification, structural assessment,
 *               cleaning protocol, odour control, clearance)
 *   - scope   — ScopeItem[] from lib/scope-fire::generateFireScope
 *               (smoke-type-specific cleaning items + char-level
 *               structural items, all with S700 clause refs inline)
 *   - estimate — priced by lib/scope-fire::priceFireScope from the
 *               contractor's OWN price list (resolveInspectionPriceList),
 *               GST from lib/gst-rules. RA-8275: no default rates; an unset
 *               rate blocks the total instead of pricing at $0.
 *
 * Rule-based + deterministic; AI prose is a follow-up under same ticket.
 */

import { prisma } from "@/lib/prisma";
import { gstForInspection } from "@/lib/assessments/gst";
import { resolveInspectionPriceList } from "@/lib/assessments/inspection-price-list";
import { resolveAreaSqm } from "@/lib/units";
import {
  generateFireScope,
  priceFireScope,
  type FireJobInputs,
  type FireSeverity,
  type SmokeType,
} from "@/lib/scope-fire";
import type {
  AssessmentEstimate,
  AssessmentReport,
  DomainGenerateInput,
  DomainGenerateResult,
  DomainPlugin,
  ReportSection,
  ScopeCategory,
  ScopeItem,
  StandardCitation,
} from "../types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function categoryFromItemType(itemType: string): ScopeCategory {
  const t = itemType.toLowerCase();
  if (t.includes("ppe") || t.includes("protective")) return "PROTECTIVE";
  if (
    t.includes("disposal") ||
    t.includes("waste") ||
    t.includes("debris") ||
    t.includes("demolition")
  ) {
    return "DISPOSAL";
  }
  if (
    t.includes("test") ||
    t.includes("verification") ||
    t.includes("monitor") ||
    t.includes("clearance")
  ) {
    return "TESTING";
  }
  if (t.includes("hours") || t.includes("labour") || t.includes("technician")) {
    return "LABOUR";
  }
  if (
    t.includes("equipment") ||
    t.includes("hepa_vacuum") ||
    t.includes("scrubber") ||
    t.includes("ozone") ||
    t.includes("hydroxyl") ||
    t.includes("thermal_fog")
  ) {
    return "EQUIPMENT";
  }
  if (t.includes("admin") || t.includes("call_out")) return "ADMIN";
  return "MATERIALS";
}

// RA-8275: the estimate is priced only by lib/scope-fire::priceFireScope.
// This domain maps its result onto the shared AssessmentEstimate shape.

// ─── Options narrowing ──────────────────────────────────────────────────────

const VALID_SMOKE_TYPES: readonly SmokeType[] = [
  "wet",
  "dry",
  "protein",
  "fuel_oil",
];

interface FireSmokeOptions {
  smokeType: SmokeType;
  charLevel: 1 | 2 | 3 | 4;
  job: FireJobInputs;
}

const VALID_SEVERITIES: readonly FireSeverity[] = ["light", "medium", "heavy"];

/** RA-8275: optional job counts a technician may supply with the options. */
const JOB_COUNT_KEYS = [
  "contentsItemCount",
  "windowCount",
  "cupboardBenchAreaM2",
  "carpetAreaM2",
  "softFurnishingCount",
  "hvacSystemCount",
  "lightFittingCount",
  "technicians",
  "supervisors",
  "buildingDays",
  "contentsDays",
  "airScrubbers",
  "hepaVacuumUnitDays",
  "ozoneUnitDays",
  "hydroxylUnitDays",
] as const satisfies readonly (keyof FireJobInputs)[];

function narrowJob(options: Record<string, unknown>): FireJobInputs {
  const job: FireJobInputs = {};
  const sev = options.severity;
  if (
    typeof sev === "string" &&
    VALID_SEVERITIES.includes(sev as FireSeverity)
  ) {
    job.severity = sev as FireSeverity;
  }
  for (const key of JOB_COUNT_KEYS) {
    const v = options[key];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) job[key] = v;
  }
  return job;
}

function narrowOptions(
  options: Record<string, unknown> | null | undefined,
): FireSmokeOptions | null {
  if (!options || typeof options !== "object") return null;
  const s = options.smokeType;
  if (typeof s !== "string" || !VALID_SMOKE_TYPES.includes(s as SmokeType)) {
    return null;
  }
  const c = options.charLevel;
  if (typeof c !== "number" || ![1, 2, 3, 4].includes(c)) return null;
  return {
    smokeType: s as SmokeType,
    charLevel: c as 1 | 2 | 3 | 4,
    job: narrowJob(options),
  };
}

// ─── Report ──────────────────────────────────────────────────────────────────

const SMOKE_LABEL: Record<SmokeType, string> = {
  wet: "Wet smoke (low-temp slow-burn — oily residue, strong odour)",
  dry: "Dry smoke (high-temp fast-burn — fine powder residue)",
  protein:
    "Protein smoke (kitchen / organic combustion — invisible film, strong odour)",
  fuel_oil: "Fuel-oil smoke (puffback / heating-system — petroleum residue)",
};

const CHAR_LABEL: Record<1 | 2 | 3 | 4, string> = {
  1: "Char 1 — surface scorching, no structural impact",
  2: "Char 2 — superficial burn, minor coating loss",
  3: "Char 3 — significant burn, structural review required",
  4: "Char 4 — heavy structural damage, demolition pathway",
};

function buildReport(args: {
  propertyAddress: string;
  affectedAreaM2: number;
  smokeType: SmokeType;
  charLevel: 1 | 2 | 3 | 4;
}): { report: AssessmentReport; citations: StandardCitation[] } {
  const cite = (section: string, note?: string): StandardCitation => ({
    standard: "IICRC S700:2025",
    section,
    note,
  });
  const sections: ReportSection[] = [];

  sections.push({
    heading: "Situation",
    body:
      `Inspection of ${args.propertyAddress} identified ` +
      `${SMOKE_LABEL[args.smokeType]} affecting ` +
      `${args.affectedAreaM2.toFixed(1)} m². Smoke classification per IICRC ` +
      `S700:2025 §4.3 governs the cleaning pathway: wet residues require ` +
      `degreaser + HEPA + odour neutralisation; dry residues require ` +
      `mechanical removal first to avoid smearing; protein films require ` +
      `enzymatic cleaners; fuel-oil residues require petroleum-specific ` +
      `solvents.`,
    citations: [cite("§4.3")],
  });

  sections.push({
    heading: "Structural assessment",
    body:
      `${CHAR_LABEL[args.charLevel]}. Char-level classification under ` +
      `S700:2025 §5 drives structural removal/replacement decisions: ` +
      `Char 1-2 are typically restorable; Char 3 requires engineer ` +
      `assessment of load-bearing elements; Char 4 frames the demolition ` +
      `pathway and typically triggers builder involvement under the ` +
      `insurer's reinstatement policy.`,
    citations: [cite("§5")],
  });

  const cleaningBody =
    args.smokeType === "wet"
      ? `Wet residue protocol per S700 §6.4: degreaser application → ` +
        `HEPA vacuum extraction → ozone treatment for oxidative odour ` +
        `neutralisation (S700 §7.1). Where ozone is contraindicated ` +
        `(e.g. occupied building, sensitive electronics) substitute ` +
        `hydroxyl generation.`
      : args.smokeType === "dry"
        ? `Dry residue protocol per S700 §6.2: dry chemical sponge ` +
          `removal → HEPA vacuum → hydroxyl odour control (S700 §7.1). ` +
          `Wet cleaning before mechanical removal smears dry residue ` +
          `into porous surfaces and is contraindicated.`
        : args.smokeType === "protein"
          ? `Protein residue protocol per S700 §6.5: enzymatic cleaner ` +
            `to break down organic film → wipe → thermal fog with ` +
            `odour-counteracting agent. Protein smoke is invisible — ` +
            `walls and ceilings appear clean but odour persists; ` +
            `cleaning extent is governed by olfactory verification ` +
            `not visual.`
          : `Fuel-oil residue protocol per S700 §6.6: petroleum-specific ` +
            `solvent application → multiple HEPA passes → activated-` +
            `carbon filtration during work. Surfaces typically require ` +
            `multiple passes and may need refinishing where residue ` +
            `has penetrated porous substrates.`;

  sections.push({
    heading: "Cleaning + decontamination protocol",
    body: cleaningBody,
    citations: [cite("§6"), cite("§7.1")],
  });

  sections.push({
    heading: "Odour control",
    body:
      `Odour neutralisation per S700:2025 §7. Method selection follows ` +
      `the smoke type: oxidising agents (ozone, hydroxyl) for ` +
      `combustion-byproduct VOCs; thermal fogging with odour-counteractant ` +
      `for protein; encapsulant sealers on substrates that cannot be ` +
      `replaced. Verification is olfactory (post-airing) plus, where ` +
      `disputed, GC-MS sampling against an outdoor baseline.`,
    citations: [cite("§7"), cite("§7.1"), cite("§7.3")],
  });

  sections.push({
    heading: "Clearance criteria",
    body:
      `Clearance per S700 §8: (1) visual inspection — no visible residue ` +
      `on cleaned surfaces; (2) UV-fluorescence sweep for residual ` +
      `protein where applicable; (3) olfactory verification by an ` +
      `independent assessor 24 hours after the last odour treatment; ` +
      `(4) where occupants are returning, post-restoration airborne ` +
      `particulate count comparable to a pre-loss / outdoor baseline.`,
    citations: [cite("§8")],
  });

  const citations: StandardCitation[] = sections
    .flatMap((s) => s.citations ?? [])
    .filter(
      (c, i, arr) =>
        arr.findIndex(
          (d) => d.standard === c.standard && d.section === c.section,
        ) === i,
    );

  return { report: { sections }, citations };
}

// ─── Plug-in ─────────────────────────────────────────────────────────────────

export const fireSmokeDomain: DomainPlugin = {
  domain: "FIRE_SMOKE",
  label: "Fire + smoke restoration (IICRC S700)",

  async generate(input: DomainGenerateInput): Promise<DomainGenerateResult> {
    const start = Date.now();
    try {
      const opts = narrowOptions(input.options);
      if (!opts) {
        return {
          ok: false,
          code: "INSUFFICIENT_DATA",
          message:
            "FIRE_SMOKE generation requires options: { smokeType: 'wet'|'dry'|'protein'|'fuel_oil', charLevel: 1|2|3|4 }",
        };
      }

      const inspection = await prisma.inspection.findUnique({
        where: { id: input.inspectionId },
        select: {
          id: true,
          userId: true,
          createdAt: true,
          propertyAddress: true,
          affectedAreas: {
            select: { affectedAreaSqm: true, affectedSquareFootage: true },
          },
          _count: { select: { contentsPackOutItems: true } },
        },
      });
      if (!inspection) {
        return {
          ok: false,
          code: "NOT_FOUND",
          message: "Inspection not found",
        };
      }

      // RA-8275: affectedSquareFootage is sq ft. resolveAreaSqm prefers the
      // m² column and converts a legacy sq ft value exactly once.
      const affectedAreaM2 = inspection.affectedAreas.reduce(
        (sum, a) => sum + resolveAreaSqm(a),
        0,
      );
      if (affectedAreaM2 <= 0) {
        return {
          ok: false,
          code: "INSUFFICIENT_DATA",
          message:
            "Inspection has no affected-area data. Capture at least one AffectedArea row before generating.",
        };
      }

      // Contents count from the inspection's pack-out register unless the
      // technician supplied one.
      const packOutCount = inspection._count?.contentsPackOutItems;
      const job: FireJobInputs = {
        ...opts.job,
        contentsItemCount:
          opts.job.contentsItemCount ??
          (packOutCount && packOutCount > 0 ? packOutCount : undefined),
      };

      // RA-8275: price only from the contractor's own price list. No
      // default rates: an unset field shows as "rate not set".
      const pricingConfig =
        (await resolveInspectionPriceList(inspection)) ?? {};

      const drafts = generateFireScope({
        smokeType: opts.smokeType,
        charLevel: opts.charLevel,
        affectedAreaM2,
        pricingConfig,
        job,
      });

      const scope: ScopeItem[] = drafts.map((d) => ({
        description: d.description,
        category: categoryFromItemType(d.itemType),
        quantity: d.quantity ?? null,
        unit: d.unit ?? "ea",
        iicrcRef: d.iicrcReference?.trim() || "IICRC S700:2025",
        notes: d.justification,
      }));

      const gst = await gstForInspection(input.inspectionId);
      const priced = priceFireScope(drafts, gst);
      const estimate: AssessmentEstimate = {
        lines: priced.lines.map((l, i) => ({
          description: l.description,
          category: scope[i].category,
          quantity: l.quantity,
          unit: l.unit ?? "ea",
          rate: l.rate,
          lineTotalExGst: l.lineTotalExGst,
          gstAmount: l.gstAmount,
          lineTotalIncGst: l.lineTotalIncGst,
          pricingStatus: l.pricingStatus,
          pricingNote: l.pricingNote,
        })),
        totals: {
          subtotalExGst: priced.subtotalExGst,
          gstTotal: priced.gstTotal,
          totalIncGst: priced.totalIncGst,
          gstRate: priced.gstRate,
          currency: priced.currency,
          status: priced.status,
          missing: priced.missing.map((m) => ({
            description: m.description,
            note: m.note,
          })),
          basis: priced.basis,
        },
      };

      const { report, citations } = buildReport({
        propertyAddress: inspection.propertyAddress,
        affectedAreaM2,
        smokeType: opts.smokeType,
        charLevel: opts.charLevel,
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
      console.error("[assessments.fire-smoke] generate failed", err);
      return {
        ok: false,
        code: "INTERNAL",
        message: "Fire/smoke assessment generation failed",
      };
    }
  },
};
