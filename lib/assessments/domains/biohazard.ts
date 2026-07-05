/**
 * BIOHAZARD domain plug-in — RA-1717.
 *
 * Third concrete domain. Reads an Inspection plus a domain-options
 * payload (`biohazardType` and optional state override) and produces:
 *
 *   - report  — IICRC S540:2023 (trauma) / S500:2021 §6.3 (Cat-3
 *               sewage) grounded sections (situation, classification,
 *               PPE rationale, controlled-waste pathway, clearance)
 *   - scope   — ScopeItem[] from lib/scope-biohazard::generateBiohazardScope
 *               (PPE + cleaning protocol + clearance testing + AU
 *               EPA waste manifest, all with compliance refs inline)
 *   - estimate — line items × default AU rates × 10% GST
 */

import { prisma } from "@/lib/prisma";
import { gstForInspection } from "@/lib/assessments/gst";
import type { GstTreatment } from "@/lib/gst-rules";
import {
  generateBiohazardScope,
  type AustralianState,
  type BiohazardType,
} from "@/lib/scope-biohazard";
import { detectStateFromPostcode } from "@/lib/state-detection";
import type {
  AssessmentEstimate,
  AssessmentReport,
  DomainGenerateInput,
  DomainGenerateResult,
  DomainPlugin,
  EstimateLine,
  ReportSection,
  ScopeCategory,
  ScopeItem,
  StandardCitation,
} from "../types";

// ─── Pricing defaults (AU mid-2026 ex GST) ────────────────────────────────────

const DEFAULT_AU_PRICING = {
  masterQualifiedNormalHours: 130, // biohazard premium over standard
  qualifiedTechnicianNormalHours: 105,
  labourerNormalHours: 70,
  airMoverAxialDailyRate: 35,
  airMoverCentrifugalDailyRate: 45,
  dehumidifierLGRDailyRate: 110,
  dehumidifierDesiccantDailyRate: 250,
  afdUnitLargeDailyRate: 95,
  extractionTruckMountedHourlyRate: 220,
  extractionElectricHourlyRate: 90,
  injectionDryingSystemDailyRate: 180,
  antimicrobialTreatmentRate: 6.5, // per m² — biohazard rate higher than water
  // RA-7001: floor of the NRPG $65-145/m² range (founder-approved 2026-07-06).
  mouldRemediationTreatmentRate: 65,
  biohazardTreatmentRate: 65, // per m²
  administrationFee: 220, // higher for biohazard documentation
  callOutFee: 320,
  thermalCameraUseCostPerAssessment: 95,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function categoryFromItemType(itemType: string): ScopeCategory {
  const t = itemType.toLowerCase();
  if (t.includes("ppe")) return "PROTECTIVE";
  if (
    t.includes("waste") ||
    t.includes("manifest") ||
    t.includes("disposal") ||
    t.includes("transport")
  ) {
    return "DISPOSAL";
  }
  if (
    t.includes("clearance") ||
    t.includes("test") ||
    t.includes("verification") ||
    t.includes("atp")
  ) {
    return "TESTING";
  }
  if (t.includes("hours") || t.includes("labour") || t.includes("technician")) {
    return "LABOUR";
  }
  if (t.includes("admin") || t.includes("call_out")) return "ADMIN";
  if (
    t.includes("antimicrobial") ||
    t.includes("disinfect") ||
    t.includes("sanitis") ||
    t.includes("clean")
  ) {
    return "MATERIALS";
  }
  return "MATERIALS";
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

// ─── Options narrowing ──────────────────────────────────────────────────────

const VALID_BIOHAZARD_TYPES: readonly BiohazardType[] = [
  "sewage_overflow",
  "decomposition",
  "chemical_spill",
  "blood_trauma",
];

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

interface BiohazardOptions {
  biohazardType: BiohazardType;
  /** Explicit state override; otherwise resolved from inspection postcode. */
  state?: AustralianState;
}

function narrowOptions(
  options: Record<string, unknown> | null | undefined,
): BiohazardOptions | null {
  if (!options || typeof options !== "object") return null;
  const t = options.biohazardType;
  if (
    typeof t !== "string" ||
    !VALID_BIOHAZARD_TYPES.includes(t as BiohazardType)
  ) {
    return null;
  }
  const s = options.state;
  const state =
    typeof s === "string" && VALID_STATES.includes(s as AustralianState)
      ? (s as AustralianState)
      : undefined;
  return { biohazardType: t as BiohazardType, state };
}

function resolveState(
  optionsState: AustralianState | undefined,
  postcode: string | null | undefined,
): AustralianState {
  if (optionsState) return optionsState;
  const detected = postcode ? detectStateFromPostcode(postcode) : null;
  if (detected && VALID_STATES.includes(detected as AustralianState)) {
    return detected as AustralianState;
  }
  // NSW is a sensible AU default when nothing else is known; the EPA
  // manifest reference still surfaces in the report so a pilot can
  // override before submitting to the real regulator.
  return "NSW";
}

// ─── Report ──────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<BiohazardType, string> = {
  sewage_overflow: "Category 3 sewage (Cat-3)",
  decomposition: "Decomposition / unattended-death",
  chemical_spill: "Chemical spill",
  blood_trauma: "Blood + trauma",
};

const TYPE_PRIMARY_STANDARD: Record<BiohazardType, StandardCitation> = {
  sewage_overflow: {
    standard: "IICRC S500:2021",
    section: "§6.3",
    note: "Category 3 (grossly contaminated) water treatment",
  },
  decomposition: {
    standard: "IICRC S540:2023",
    section: "§5",
    note: "Trauma, decomposition + crime-scene cleanup",
  },
  chemical_spill: {
    standard: "AS/NZS 4360:2004",
    section: "§3.2",
    note: "Risk controls for hazardous-substance response",
  },
  blood_trauma: {
    standard: "IICRC S540:2023",
    section: "§5",
    note: "Trauma + bloodborne-pathogen cleanup",
  },
};

function buildReport(args: {
  propertyAddress: string;
  affectedAreaM2: number;
  biohazardType: BiohazardType;
  state: AustralianState;
}): { report: AssessmentReport; citations: StandardCitation[] } {
  const sections: ReportSection[] = [];
  const primary = TYPE_PRIMARY_STANDARD[args.biohazardType];
  const ppeFootnote: StandardCitation = {
    standard: "Safe Work Australia",
    section: "PPE Model Code of Practice",
  };
  const wastePolicy: StandardCitation = {
    standard: `${args.state} EPA`,
    section: "Controlled / clinical waste",
    note: "Manifest required for transport off-site",
  };

  sections.push({
    heading: "Situation",
    body:
      `Inspection of ${args.propertyAddress} identified ` +
      `${TYPE_LABEL[args.biohazardType]} contamination across ` +
      `${args.affectedAreaM2.toFixed(1)} m². Remediation pathway is ` +
      `governed by ${primary.standard} ${primary.section} and the ` +
      `${args.state} EPA controlled-waste regulations.`,
    citations: [primary, wastePolicy],
  });

  sections.push({
    heading: "PPE rationale",
    body:
      args.biohazardType === "decomposition" ||
      args.biohazardType === "blood_trauma"
        ? `Premium PPE (Level-C suits, respirator cartridges, double-glove ` +
          `protocol) is required for decomposition and blood/trauma exposures ` +
          `under Safe Work Australia's Biological Hazards CoP. Don/doff ` +
          `procedures must be observed by a designated safety officer; ` +
          `single-pass entry per operator.`
        : `Standard PPE (coveralls, P3 respirator, gloves, boot covers) is ` +
          `required for sewage and chemical-spill exposures under Safe Work ` +
          `Australia's Biological Hazards CoP. Where airborne pathogens are ` +
          `suspected, upgrade to Level-C and document in the site's daily ` +
          `WHS log.`,
    citations: [ppeFootnote],
  });

  sections.push({
    heading: "Cleaning + decontamination protocol",
    body:
      args.biohazardType === "sewage_overflow"
        ? `Category 3 contamination requires removal of porous materials ` +
          `that contacted sewage (S500:2021 §6.3). Hard surfaces: detergent ` +
          `wash → rinse → quaternary ammonium or hypochlorite disinfection ` +
          `(EPA-registered tuberculocide). HVAC must be inspected (S520:2024 ` +
          `§6.1) — replace porous insulation. Anti-microbial application ` +
          `at conclusion before drying restoration begins.`
        : args.biohazardType === "decomposition" ||
            args.biohazardType === "blood_trauma"
          ? `Bulk debris removal under controlled-access containment per ` +
            `S540:2023 §5. Visible biological material must be packaged in ` +
            `red biohazard bags (UN 3291 packaging Group II for transport). ` +
            `Surfaces undergo three-pass clean: enzymatic detergent → ` +
            `oxidising disinfectant (e.g. peroxide-based) → ATP verification.`
          : `Hazardous substance protocol per AS/NZS 4360:2004 §3.2. ` +
            `Identify spill agent, neutralise with appropriate sorbent, ` +
            `package per Dangerous Goods (Road and Rail) Regulations. ` +
            `Surfaces undergo solvent wash + rinse + ATP verification.`,
    citations:
      args.biohazardType === "sewage_overflow"
        ? [primary, { standard: "IICRC S520:2024", section: "§6.1" }]
        : [primary],
  });

  sections.push({
    heading: "Controlled waste pathway",
    body:
      `All waste classified as clinical / controlled per ${args.state} EPA ` +
      `regulations. Manifest required prior to transport off-site; manifest ` +
      `numbers retained on file for 7 years (matches AU NDB record-retention ` +
      `floor). Transport must be by a licensed clinical-waste operator.`,
    citations: [wastePolicy],
  });

  sections.push({
    heading: "Clearance criteria",
    body:
      args.biohazardType === "sewage_overflow"
        ? `Clearance: visual inspection (no residual debris), ATP ` +
          `verification on representative surfaces (target < 30 RLU on ` +
          `AccuPoint or equivalent meter), and microbial sampling per ` +
          `AS 4276 if requested by an Indoor Environmental Professional ` +
          `(IEP). Drying restoration follows S500:2021 §13 thereafter.`
        : args.biohazardType === "decomposition" ||
            args.biohazardType === "blood_trauma"
          ? `Clearance: visual inspection per S540:2023 §5, ATP testing ` +
            `(target < 30 RLU on representative surfaces), and bloodborne-` +
            `pathogen verification using rapid strip tests where exposure ` +
            `is suspected. Document with photographs + meter readings.`
          : `Clearance: visual confirmation of full neutralisation, pH ` +
            `verification on cleaned surfaces (target 6.5-7.5), and air ` +
            `quality monitoring per the SDS where airborne residue is a ` +
            `concern. Document with meter readings + spill log.`,
    citations: [
      primary,
      {
        standard: "AS 4276",
        section: "Microbiological standards (where applicable)",
      },
    ],
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

export const biohazardDomain: DomainPlugin = {
  domain: "BIOHAZARD",
  label: "Biohazard remediation (IICRC S540 / S500 §6.3)",

  async generate(input: DomainGenerateInput): Promise<DomainGenerateResult> {
    const start = Date.now();
    try {
      const opts = narrowOptions(input.options);
      if (!opts) {
        return {
          ok: false,
          code: "INSUFFICIENT_DATA",
          message:
            "BIOHAZARD generation requires options: { biohazardType: 'sewage_overflow' | 'decomposition' | 'chemical_spill' | 'blood_trauma', state?: 'NSW'|'VIC'|'QLD'|'WA'|'SA'|'TAS'|'ACT'|'NT' }",
        };
      }

      const inspection = await prisma.inspection.findUnique({
        where: { id: input.inspectionId },
        select: {
          id: true,
          propertyAddress: true,
          propertyPostcode: true,
          affectedAreas: { select: { affectedSquareFootage: true } },
        },
      });
      if (!inspection) {
        return {
          ok: false,
          code: "NOT_FOUND",
          message: "Inspection not found",
        };
      }

      const affectedAreaM2 = inspection.affectedAreas.reduce(
        (sum, a) => sum + (a.affectedSquareFootage ?? 0),
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

      const state = resolveState(opts.state, inspection.propertyPostcode);

      const drafts = generateBiohazardScope({
        biohazardType: opts.biohazardType,
        affectedAreaM2,
        state,
        pricingConfig: DEFAULT_AU_PRICING,
      });

      const scope: ScopeItem[] = drafts.map((d) => ({
        description: d.description,
        category: categoryFromItemType(d.itemType),
        quantity: d.quantity ?? 1,
        unit: d.unit ?? "ea",
        iicrcRef:
          d.iicrcReference?.trim() ||
          `${TYPE_PRIMARY_STANDARD[opts.biohazardType].standard} ${TYPE_PRIMARY_STANDARD[opts.biohazardType].section}`,
        notes: d.justification,
      }));

      const rateByDescription = new Map<string, number>(
        drafts
          .filter((d) => typeof d.unitCostAud === "number")
          .map((d) => [d.description, d.unitCostAud as number]),
      );
      const gst = await gstForInspection(input.inspectionId);
      const estimate = buildEstimate(scope, rateByDescription, gst);

      const { report, citations } = buildReport({
        propertyAddress: inspection.propertyAddress,
        affectedAreaM2,
        biohazardType: opts.biohazardType,
        state,
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
      console.error("[assessments.biohazard] generate failed", err);
      return {
        ok: false,
        code: "INTERNAL",
        message: "Biohazard assessment generation failed",
      };
    }
  },
};
