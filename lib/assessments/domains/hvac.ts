/**
 * HVAC domain plug-in — RA-1717.
 *
 * Sixth concrete domain. HVAC inspection + cleaning scopes for AU
 * air-handling systems, grounded against NADCA ACR 2021 (Assessment,
 * Cleaning and Restoration of HVAC Systems) and AS/NZS 3666.1/2/3
 * (microbial control in air-handling and water systems — the AU
 * regulatory equivalent applying to mechanical ventilation in
 * commercial / multi-residential buildings).
 *
 * Input options:
 *   {
 *     systemType: 'split' | 'ducted_residential' | 'commercial_cav' |
 *                 'commercial_vav' | 'evaporative',
 *     condition:  'CLEAN' | 'DUST_ACCUMULATION' | 'MICROBIAL_GROWTH' |
 *                 'FIRE_SMOKE_RESIDUE',
 *     ductLinearMetres?: number,    // for ducted systems
 *     areaServedM2?: number,         // fallback driver when no duct measure
 *   }
 *
 * Output domains:
 *   - report   — NADCA + AS/NZS 3666 grounded sections (situation,
 *                inspection findings, cleaning protocol, sanitisation,
 *                clearance verification)
 *   - scope    — coil clean, blower clean, ductwork clean, condensate
 *                pan sanitise, filter replacement, ATP verification —
 *                each with a ref inline (NADCA ACR + AS/NZS 3666)
 *   - estimate — line items × default AU rates × 10% GST → totals (AUD)
 *
 * Note: HVAC has no upstream "scope-hvac.ts" library yet, so this
 * plug-in builds the line items inline. The same shape can be lifted
 * into a shared lib/scope-hvac.ts later if other surfaces need it.
 */

import { prisma } from "@/lib/prisma";
import { gstForInspection } from "@/lib/assessments/gst";
import type { GstTreatment } from "@/lib/gst-rules";
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

// ─── Pricing defaults (AU mid-2026 ex GST) ────────────────────────────────────

const COIL_CLEAN_PER_UNIT_AUD = 320;
const BLOWER_CLEAN_PER_UNIT_AUD = 280;
const DUCT_CLEAN_PER_LINEAR_METRE_AUD = 28;
const CONDENSATE_SANITISE_PER_UNIT_AUD = 95;
const FILTER_REPLACE_PER_UNIT_AUD = 120;
const ATP_TEST_PER_SAMPLE_AUD = 45;
const SANITISER_FOG_PER_M2_SERVED_AUD = 2.5;

// ─── Options narrowing ──────────────────────────────────────────────────────

type SystemType =
  | "split"
  | "ducted_residential"
  | "commercial_cav"
  | "commercial_vav"
  | "evaporative";

type Condition =
  | "CLEAN"
  | "DUST_ACCUMULATION"
  | "MICROBIAL_GROWTH"
  | "FIRE_SMOKE_RESIDUE";

const VALID_SYSTEMS: readonly SystemType[] = [
  "split",
  "ducted_residential",
  "commercial_cav",
  "commercial_vav",
  "evaporative",
];

const VALID_CONDITIONS: readonly Condition[] = [
  "CLEAN",
  "DUST_ACCUMULATION",
  "MICROBIAL_GROWTH",
  "FIRE_SMOKE_RESIDUE",
];

interface HvacOptions {
  systemType: SystemType;
  condition: Condition;
  ductLinearMetres?: number;
  areaServedM2?: number;
}

function narrowOptions(
  options: Record<string, unknown> | null | undefined,
): HvacOptions | null {
  if (!options || typeof options !== "object") return null;
  const s = options.systemType;
  if (typeof s !== "string" || !VALID_SYSTEMS.includes(s as SystemType)) {
    return null;
  }
  const c = options.condition;
  if (typeof c !== "string" || !VALID_CONDITIONS.includes(c as Condition)) {
    return null;
  }
  const d = options.ductLinearMetres;
  const ductLinearMetres =
    typeof d === "number" && Number.isFinite(d) && d >= 0 ? d : undefined;
  const a = options.areaServedM2;
  const areaServedM2 =
    typeof a === "number" && Number.isFinite(a) && a >= 0 ? a : undefined;
  return {
    systemType: s as SystemType,
    condition: c as Condition,
    ductLinearMetres,
    areaServedM2,
  };
}

// ─── Scope construction ─────────────────────────────────────────────────────

const NADCA_ACR_2021_SECTION_5 = "NADCA ACR 2021 §5 (Cleaning methods)";
const NADCA_ACR_2021_SECTION_6 = "NADCA ACR 2021 §6 (Sanitisation)";
const NADCA_ACR_2021_SECTION_7 = "NADCA ACR 2021 §7 (Verification)";
const AS_NZS_3666_1 =
  "AS/NZS 3666.1:2011 (Microbial control in building water systems)";
const AS_NZS_3666_2 =
  "AS/NZS 3666.2:2011 (Operation + maintenance of air-handling systems)";
const S520_HVAC = "IICRC S520:2024 §6 (HVAC involvement in mould)";
const S700_HVAC = "IICRC S700:2025 §6.3 (HVAC after fire/smoke)";

interface BuiltScope {
  items: ScopeItem[];
  rateByDescription: Map<string, number>;
}

function buildScope(opts: HvacOptions): BuiltScope {
  const items: ScopeItem[] = [];
  const rates = new Map<string, number>();

  // Coil clean — every system
  const coilDesc = "Cooling/heating coil clean (de-greaser + rinse)";
  items.push({
    description: coilDesc,
    category: "MATERIALS",
    quantity: 1,
    unit: "unit",
    iicrcRef: NADCA_ACR_2021_SECTION_5,
    notes:
      "Coil clean is mandatory irrespective of condition — NADCA ACR §5 baseline.",
  });
  rates.set(coilDesc, COIL_CLEAN_PER_UNIT_AUD);

  // Blower / fan-coil clean — every system
  const blowerDesc = "Blower / fan-coil clean (HEPA vacuum + wipe)";
  items.push({
    description: blowerDesc,
    category: "MATERIALS",
    quantity: 1,
    unit: "unit",
    iicrcRef: NADCA_ACR_2021_SECTION_5,
    notes:
      "Blower wheel + housing accumulates particulate; clean before air-handler is restarted.",
  });
  rates.set(blowerDesc, BLOWER_CLEAN_PER_UNIT_AUD);

  // Ductwork clean — when ducted system + non-CLEAN condition
  if (
    opts.systemType !== "split" &&
    opts.systemType !== "evaporative" &&
    opts.condition !== "CLEAN"
  ) {
    const ductLm =
      opts.ductLinearMetres ?? Math.max(20, opts.areaServedM2 ?? 0);
    const ductDesc =
      "Ductwork clean (mechanical agitation + HEPA negative-air)";
    items.push({
      description: ductDesc,
      category: "MATERIALS",
      quantity: ductLm,
      unit: "lin·m",
      iicrcRef: NADCA_ACR_2021_SECTION_5,
      notes:
        "NADCA mechanical-agitation cleaning under HEPA negative pressure to capture dislodged debris.",
    });
    rates.set(ductDesc, DUCT_CLEAN_PER_LINEAR_METRE_AUD);
  }

  // Condensate pan sanitise — every system except evaporative
  if (opts.systemType !== "evaporative") {
    const conDesc = "Condensate pan + drain sanitise (biocide + flush)";
    items.push({
      description: conDesc,
      category: "MATERIALS",
      quantity: 1,
      unit: "unit",
      iicrcRef: AS_NZS_3666_1,
      notes:
        "Condensate pan is the most common biofilm reservoir; AS/NZS 3666.1 requires periodic sanitise.",
    });
    rates.set(conDesc, CONDENSATE_SANITISE_PER_UNIT_AUD);
  }

  // Filter replacement — every system
  const filterDesc =
    "Filter replacement (HEPA / MERV-13 as system rating allows)";
  items.push({
    description: filterDesc,
    category: "MATERIALS",
    quantity: 1,
    unit: "unit",
    iicrcRef: AS_NZS_3666_2,
    notes:
      "Replace at conclusion to prevent re-distribution of dislodged contaminants.",
  });
  rates.set(filterDesc, FILTER_REPLACE_PER_UNIT_AUD);

  // Sanitisation fog — for microbial / fire-smoke conditions
  if (
    opts.condition === "MICROBIAL_GROWTH" ||
    opts.condition === "FIRE_SMOKE_RESIDUE"
  ) {
    const fogDesc = "EPA-registered sanitiser fog through ductwork";
    const fogQty = Math.max(50, opts.areaServedM2 ?? 0);
    items.push({
      description: fogDesc,
      category: "MATERIALS",
      quantity: fogQty,
      unit: "m² served",
      iicrcRef: NADCA_ACR_2021_SECTION_6,
      notes:
        "Fog distribution after mechanical cleaning per NADCA ACR §6; agent selection per condition.",
    });
    rates.set(fogDesc, SANITISER_FOG_PER_M2_SERVED_AUD);
  }

  // ATP verification — always 3 samples (return, supply, near-coil)
  const atpDesc = "ATP verification (return / supply / near-coil)";
  items.push({
    description: atpDesc,
    category: "TESTING",
    quantity: 3,
    unit: "sample",
    iicrcRef: NADCA_ACR_2021_SECTION_7,
    notes:
      "Target < 30 RLU on AccuPoint or equivalent meter; document with photographs of meter readings.",
  });
  rates.set(atpDesc, ATP_TEST_PER_SAMPLE_AUD);

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

const SYSTEM_LABEL: Record<SystemType, string> = {
  split: "Split-system air conditioner (residential)",
  ducted_residential: "Ducted residential HVAC",
  commercial_cav: "Commercial CAV (constant-air-volume)",
  commercial_vav: "Commercial VAV (variable-air-volume)",
  evaporative: "Evaporative / direct-cooler system",
};

const CONDITION_LABEL: Record<Condition, string> = {
  CLEAN: "Clean — routine maintenance only",
  DUST_ACCUMULATION: "Dust accumulation",
  MICROBIAL_GROWTH: "Microbial growth (mould / bacteria reservoir)",
  FIRE_SMOKE_RESIDUE: "Fire / smoke residue",
};

function buildReport(args: {
  propertyAddress: string;
  systemType: SystemType;
  condition: Condition;
}): { report: AssessmentReport; citations: StandardCitation[] } {
  const sections: ReportSection[] = [];
  const cites: StandardCitation[] = [];

  const cite = (s: string, sec: string, note?: string): StandardCitation => {
    const c = { standard: s, section: sec, note };
    cites.push(c);
    return c;
  };

  const nadca5 = cite("NADCA ACR 2021", "§5", "Cleaning methods");
  const nadca6 = cite("NADCA ACR 2021", "§6", "Sanitisation");
  const nadca7 = cite("NADCA ACR 2021", "§7", "Verification");
  const as3666_1 = cite(
    "AS/NZS 3666.1:2011",
    "Microbial control in building water systems",
  );
  const as3666_2 = cite(
    "AS/NZS 3666.2:2011",
    "Operation + maintenance of air-handling systems",
  );

  sections.push({
    heading: "Situation",
    body:
      `Inspection of ${args.propertyAddress} HVAC: ` +
      `${SYSTEM_LABEL[args.systemType]}, current condition ` +
      `${CONDITION_LABEL[args.condition]}. Cleaning + sanitisation ` +
      `pathway is governed by NADCA ACR 2021 plus AS/NZS 3666.1/2 ` +
      `for the AU regulatory framework.`,
    citations: [nadca5, as3666_1, as3666_2],
  });

  sections.push({
    heading: "Inspection findings",
    body:
      args.condition === "CLEAN"
        ? `No visible accumulation, no microbial indicators, no smoke ` +
          `residue. Routine maintenance scope (coil + blower clean, ` +
          `condensate pan sanitise, filter replacement, ATP verification).`
        : args.condition === "DUST_ACCUMULATION"
          ? `Visible dust accumulation observed on coil, blower, and / or ` +
            `interior duct surfaces. Mechanical cleaning required to ` +
            `prevent IAQ degradation and downstream filter loading.`
          : args.condition === "MICROBIAL_GROWTH"
            ? `Microbial growth observed (visible amplification or ` +
              `confirmed sampling). Cross-reference with IICRC S520:2024 ` +
              `§6 — HVAC involvement in mould remediation. System must be ` +
              `isolated from occupied space during cleaning + sanitisation.`
            : `Fire / smoke residue identified in HVAC. Cross-reference ` +
              `with IICRC S700:2025 §6.3. Filters must be removed and ` +
              `disposed pre-cleaning to prevent residue re-distribution.`,
    citations:
      args.condition === "MICROBIAL_GROWTH"
        ? [
            {
              standard: "IICRC S520:2024",
              section: S520_HVAC.replace(/^IICRC S520:2024\s*/, ""),
            },
          ]
        : args.condition === "FIRE_SMOKE_RESIDUE"
          ? [
              {
                standard: "IICRC S700:2025",
                section: S700_HVAC.replace(/^IICRC S700:2025\s*/, ""),
              },
            ]
          : undefined,
  });

  sections.push({
    heading: "Cleaning protocol",
    body:
      `NADCA ACR 2021 §5 mechanical-agitation cleaning under HEPA ` +
      `negative pressure to capture dislodged debris. Coil de-greaser ` +
      `wash + rinse → blower HEPA vacuum + wipe → ductwork mechanical ` +
      `agitation + HEPA negative-air capture` +
      (args.systemType === "evaporative"
        ? ` (not applicable to evaporative coolers — these have no ` +
          `closed ductwork; clean pad / sump / drain instead)`
        : ``) +
      `. Condensate pan + drain sanitised with EPA-registered biocide ` +
      `per AS/NZS 3666.1.`,
    citations: [nadca5, as3666_1],
  });

  if (
    args.condition === "MICROBIAL_GROWTH" ||
    args.condition === "FIRE_SMOKE_RESIDUE"
  ) {
    sections.push({
      heading: "Sanitisation",
      body:
        `Post-cleaning sanitisation per NADCA ACR §6 — EPA-registered ` +
        `agent fogged through ductwork at the manufacturer's recommended ` +
        `dilution. Agent selection follows the condition: oxidising ` +
        `agents (peroxide / chlorine dioxide) for microbial growth; ` +
        `odour-counteractant fog for fire/smoke residue. Operate the ` +
        `air-handler at low speed during application to ensure full ` +
        `distribution.`,
      citations: [nadca6],
    });
  }

  sections.push({
    heading: "Clearance verification",
    body:
      `Verification per NADCA ACR §7: (1) visual inspection of cleaned ` +
      `surfaces (no residual debris, no biofilm staining); (2) ATP ` +
      `swab samples at 3 positions (return-air grille, supply-air ` +
      `register, near-coil) — target < 30 RLU on AccuPoint or ` +
      `equivalent; (3) where the condition was MICROBIAL or FIRE_SMOKE, ` +
      `airborne particulate count comparable to outdoor baseline. ` +
      `Document with photographs + meter readings retained on file.`,
    citations: [nadca7],
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

export const hvacDomain: DomainPlugin = {
  domain: "HVAC",
  label: "HVAC inspection + cleaning (NADCA ACR + AS/NZS 3666)",

  async generate(input: DomainGenerateInput): Promise<DomainGenerateResult> {
    const start = Date.now();
    try {
      const opts = narrowOptions(input.options);
      if (!opts) {
        return {
          ok: false,
          code: "INSUFFICIENT_DATA",
          message:
            "HVAC generation requires options: { systemType: 'split'|'ducted_residential'|'commercial_cav'|'commercial_vav'|'evaporative', condition: 'CLEAN'|'DUST_ACCUMULATION'|'MICROBIAL_GROWTH'|'FIRE_SMOKE_RESIDUE', ductLinearMetres?: number, areaServedM2?: number }",
        };
      }

      const inspection = await prisma.inspection.findUnique({
        where: { id: input.inspectionId },
        select: { id: true, propertyAddress: true },
      });
      if (!inspection) {
        return {
          ok: false,
          code: "NOT_FOUND",
          message: "Inspection not found",
        };
      }

      const { items: scope, rateByDescription } = buildScope(opts);
      const gst = await gstForInspection(input.inspectionId);
      const estimate = buildEstimate(scope, rateByDescription, gst);
      const { report, citations } = buildReport({
        propertyAddress: inspection.propertyAddress,
        systemType: opts.systemType,
        condition: opts.condition,
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
      console.error("[assessments.hvac] generate failed", err);
      return {
        ok: false,
        code: "INTERNAL",
        message: "HVAC assessment generation failed",
      };
    }
  },
};
