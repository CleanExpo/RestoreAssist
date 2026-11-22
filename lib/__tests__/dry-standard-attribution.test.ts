/**
 * RA-8508: the fixed moisture thresholds have no cited source, so nothing that
 * shows or sends them may present them as IICRC S500 (or any IICRC standard).
 *
 * Two layers:
 *  1. A line rule over every file that reads the guide values (found by import,
 *     so a new reader is covered automatically) plus the known renderers and
 *     prompt builders that pair drying-goal wording with the numbers.
 *  2. Built output: the scope prompt's moisture lines, the water assessment
 *     report sections, the drying-goal messages and the completion email.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MOISTURE_GUIDE_LABEL,
  MOISTURE_GUIDE_VALUES,
  dryingGoalAchievedMessage,
  dryingGoalCertificate,
  dryingGoalProgressMessage,
} from "@/lib/iicrc-dry-standards";
import { buildScopeUserMessage } from "@/lib/scope-narrative-prompts";
import { dryingGoalAchievedEmail } from "@/lib/email-templates";
import { buildWaterReport } from "@/lib/assessments/domains/water";
import { getClaimTypePrompt } from "@/lib/ai/claim-type-prompts";

const ROOT = join(__dirname, "..", "..");
const STANDARD_LABEL = /IICRC|S500/i;
/** Wording that ties a line to a moisture drying goal or its numbers. */
const GOAL_TERMS =
  /dry[ -]?standard|dry ?threshold|wet ?threshold|target EMC|EMC target|drying goal|target curve|finalMC|DRY_STANDARD|MOISTURE_GUIDE/i;

/**
 * Built-output rule (RA-8508 review round): wording that names a moisture goal
 * or threshold, on the same line as a standard name or a bare section number.
 * Broader than GOAL_TERMS: it also catches "target thresholds per §11.4".
 */
const BUILT_GOAL =
  /EMC|moisture (target|goal|threshold)|drying (goal|target)|dry[ -]?standard|target thresholds?|final MC|MC target/i;
const CITATION = /§\s*\d|IICRC|S500/;
export function citesStandardForMoistureGoal(line: string): boolean {
  return BUILT_GOAL.test(line) && CITATION.test(line);
}

/** Flags a source line that puts a standard's name beside drying-goal wording. */
export function labelsGoalAsStandard(line: string): boolean {
  if (/^\s*import\s|from\s+["']@?\/?.*iicrc-dry-standards["']/.test(line)) return false;
  return GOAL_TERMS.test(line) && STANDARD_LABEL.test(line.replace(/iicrc-dry-standards/g, ""));
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "__tests__") continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
}

function readerFiles(): string[] {
  const all: string[] = [];
  for (const d of ["app", "lib", "components"]) walk(join(ROOT, d), all);
  const importers = all.filter((f) =>
    /from\s+["']@\/lib\/iicrc-dry-standards["']/.test(readFileSync(f, "utf8")),
  );
  const known = [
    "lib/iicrc-dry-standards.ts",
    "lib/drying/material-mc-targets.ts",
    "lib/drying/target-curve.ts",
    "lib/email-templates.ts",
    "lib/scope-narrative-prompts.ts",
    "lib/ai/claim-type-prompts.ts",
    "lib/ai/constants.ts",
    "lib/generate-iicrc-report-pdf.ts",
    "lib/assessments/domains/mould.ts",
    "components/sketch/SketchMoistureLayer.tsx",
    "app/api/inspections/[id]/monitoring-report/route.ts",
  ].map((p) => join(ROOT, p));
  return [...new Set([...importers, ...known])];
}

describe("line rule (positive and negative controls)", () => {
  it("flags the label beside the numbers and passes the guide wording", () => {
    expect(labelsGoalAsStandard('IICRC S500 dry standard for {std.label}:')).toBe(true);
    expect(labelsGoalAsStandard("message: `still above IICRC S500 target EMC`")).toBe(true);
    expect(labelsGoalAsStandard(`${MOISTURE_GUIDE_LABEL} for {std.label}`)).toBe(false);
    expect(labelsGoalAsStandard('import { getDryStandard } from "@/lib/iicrc-dry-standards";')).toBe(false);
  });

  it("built-output rule catches a bare section beside threshold wording", () => {
    expect(citesStandardForMoistureGoal("psychrometric logs, target thresholds per §11.4.")).toBe(true);
    expect(citesStandardForMoistureGoal("Drying target is EMC for the material. IICRC S500:2021 §7.5.")).toBe(true);
    expect(citesStandardForMoistureGoal("Confirm whether removal area exceeds 10 m² bonded threshold")).toBe(false);
    expect(citesStandardForMoistureGoal("Water category determination → cite S500:2021 §3")).toBe(false);
  });
});

describe("no reader labels the moisture goal as IICRC S500", () => {
  const files = readerFiles();

  it("found the readers (positive control on discovery)", () => {
    const rel = files.map((f) => relative(ROOT, f));
    expect(rel).toContain("app/api/inspections/[id]/drying-goal/route.ts");
    expect(rel).toContain("components/inspection/MoistureReadingEntryForm.tsx");
    expect(rel).toContain("lib/assessments/domains/water.ts");
    expect(files.length).toBeGreaterThanOrEqual(15);
  });

  it("has no line pairing a standard's name with drying-goal wording", () => {
    const hits: string[] = [];
    for (const f of files) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (labelsGoalAsStandard(line)) hits.push(`${relative(ROOT, f)}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(hits).toEqual([]);
  });
});

describe("built output carries no standard label on the moisture goal", () => {
  it("guide rows carry no standard name", () => {
    for (const row of MOISTURE_GUIDE_VALUES) {
      expect(JSON.stringify(row)).not.toMatch(STANDARD_LABEL);
    }
  });

  it("scope prompt moisture lines state their basis and name no standard", () => {
    const msg = buildScopeUserMessage({
      propertyAddress: "1 Test St",
      inspectionDate: null,
      damageCategory: "CAT_1",
      damageClass: "CLASS_2",
      lossSourceIdentified: true,
      affectedAreaM2: 12,
      moistureReadings: [
        { location: "Lounge", surfaceType: "timber", moistureLevel: 22, target: 12.5, targetBasis: "reference", status: "WET" },
        { location: "Hall", surfaceType: "carpet", moistureLevel: 9, target: 3, targetBasis: "guide", status: "DRYING" },
      ],
      equipment: [],
      totalEstimatedAmps: 0,
    } as unknown as Parameters<typeof buildScopeUserMessage>[0]);
    const start = msg.indexOf("**Moisture Readings:**");
    expect(start).toBeGreaterThan(-1);
    const block = msg.slice(start, msg.indexOf("\n\n", start + 1) === -1 ? undefined : msg.indexOf("\n\n", start + 1));
    expect(block).not.toMatch(STANDARD_LABEL);
    expect(block).toMatch(/reference reading/i);
    expect(block).toMatch(/guide/i);
  });

  it("drying-goal messages, certificate and email name no standard", () => {
    const texts = [
      dryingGoalProgressMessage(2),
      dryingGoalAchievedMessage(4, 6, ["reference", "guide"]),
      dryingGoalCertificate("2026-11-21T00:00:00.000Z", 6, ["guide"]),
      dryingGoalAchievedEmail({ inspectionNumber: "INS-1", address: "1 Test St", completionDate: "21/11/2026" } as never),
    ];
    for (const t of texts) expect(t).not.toMatch(STANDARD_LABEL);
    expect(dryingGoalCertificate("2026-11-21T00:00:00.000Z", 6, ["guide"])).toMatch(/guide/i);
  });

  it("water assessment report: moisture sections name no standard and cite none", () => {
    const { report } = buildWaterReport({
      propertyAddress: "1 Test St",
      category: 1,
      damageClass: 2,
      affectedAreaM2: 12,
      estimatedDays: 4,
      moistureSummary: { wet: 1, drying: 1, dry: 1, total: 3 },
      referenceMaterials: 1,
    } as never);
    const moisture = report.sections.filter((s) => /moisture|drying goal|dry-standard/i.test(s.heading));
    expect(moisture.length).toBeGreaterThanOrEqual(2);
    for (const s of moisture) {
      expect(s.body).not.toMatch(STANDARD_LABEL);
      expect(s.citations ?? []).toEqual([]);
    }
    // Every section, whatever its heading: a body that names a moisture goal
    // carries no standard citation (RA-8508 review: "Estimated duration").
    for (const s of report.sections) {
      if (BUILT_GOAL.test(s.body)) {
        expect(s.body, s.heading).not.toMatch(CITATION);
        expect(s.citations ?? [], s.heading).toEqual([]);
      }
    }
  });

  it("claim-type prompts do not tie moisture targets to a standard", () => {
    const types = [
      "water_damage", "fire_smoke", "storm", "mould", "contents",
      "biohazard", "odour", "carpet", "hvac", "asbestos",
    ] as const;
    for (const type of types) {
      for (const damageClass of [1, 2, 3, 4]) {
        for (const damageCategory of [1, 2, 3]) {
          const prompt = getClaimTypePrompt(type, { damageCategory, damageClass });
          expect(prompt.length).toBeGreaterThan(100);
          for (const line of prompt.split("\n")) {
            expect(labelsGoalAsStandard(line), line).toBe(false);
            expect(citesStandardForMoistureGoal(line), line).toBe(false);
          }
        }
      }
    }
  });

  it("AI system prompts do not tie moisture goals to a standard", async () => {
    const constants = await import("@/lib/ai/constants");
    const prompts = Object.values(constants).filter((v): v is string => typeof v === "string");
    expect(prompts.length).toBeGreaterThanOrEqual(3);
    for (const p of prompts) {
      for (const line of p.split("\n")) {
        expect(citesStandardForMoistureGoal(line), line).toBe(false);
      }
    }
  });
});
