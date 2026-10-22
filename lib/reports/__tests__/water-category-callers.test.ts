import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Wrap the real classifier so each report generator can be shown to call it.
vi.mock("@/lib/reports/extract-report-data", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/reports/extract-report-data")>();
  return { ...actual, extractWaterCategory: vi.fn(actual.extractWaterCategory) };
});

import { extractWaterCategory } from "@/lib/reports/extract-report-data";
import { generateAssessmentReportPDF } from "@/lib/generate-assessment-report-pdf";
import { generateForensicReportPDF } from "@/lib/generate-forensic-report-pdf";
import { buildScopeOfWorksData } from "@/lib/restoration/scope-of-works-builder";

/**
 * The assessment PDF, the forensic PDF and the scope-of-works builder each
 * carried a private copy of the water-category classifier, and the copies
 * disagreed with the shared extractWaterCategory and with each other. They now
 * call the shared function. This file proves that, and pins every place the
 * result differs from what the old copy returned.
 */

const CALLERS = [
  "lib/generate-assessment-report-pdf.ts",
  "lib/generate-forensic-report-pdf.ts",
  "lib/restoration/scope-of-works-builder.ts",
];

describe("report generators use the shared water-category classifier", () => {
  it.each(CALLERS)("%s has no private copy and imports the shared one", (rel) => {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    expect(src).not.toMatch(/function\s+extractWaterCategory\b/);
    expect(src).toMatch(
      /import\s*\{[^}]*\bextractWaterCategory\b[^}]*\}\s*from\s*"@\/lib\/reports\/extract-report-data"/,
    );
  });

  const SOURCE = "Dishwasher supply line burst";

  afterEach(() => {
    vi.mocked(extractWaterCategory).mockClear();
    vi.unstubAllGlobals();
  });

  it("scope of works: classifies the Tier 1 source with the shared rules", () => {
    const s = buildScopeOfWorksData({
      report: { id: "rep_1", reportNumber: "RA-1", inspection: null },
      analysis: null,
      tier1: {
        T1_Q3_waterSource: "Sewage backup (Category 3 — biohazard)",
        T1_Q7_hazards: ["None identified"],
      },
      tier2: null,
      tier3: null,
      pricingConfig: {},
      stateInfo: null,
    }) as { waterCategory: string };
    expect(extractWaterCategory).toHaveBeenCalledWith(
      "Sewage backup (Category 3 — biohazard)",
    );
    expect(s.waterCategory).toBe("Category 3");
  });

  it.each([
    ["assessment PDF", generateAssessmentReportPDF],
    ["forensic PDF", generateForensicReportPDF],
  ] as const)("%s: classifies the Tier 1 source with the shared rules", async (_name, gen) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network not used in this test");
      }),
    );
    const bytes = await gen({
      report: { id: "abc123def", reportNumber: "R-001" },
      analysis: {},
      tier1: { T1_Q3_waterSource: SOURCE },
      tier2: {},
      tier3: {},
      stateInfo: {},
      businessInfo: { businessName: "Acme Restoration", businessLogo: "" },
    } as never);
    expect(bytes.length).toBeGreaterThan(0);
    expect(extractWaterCategory).toHaveBeenCalledWith(SOURCE);
  });
});

// ── old-versus-new table ────────────────────────────────────────────────────
// The three private copies exactly as they were at e245db235a, kept here only
// as the baseline the change is measured against.

function oldAssessment(source: string): string {
  if (!source) return "Category 1";
  const s = source.toLowerCase();
  if (
    s.includes("cat 3") ||
    s.includes("category 3") ||
    s.includes("sewage") ||
    s.includes("black")
  )
    return "Category 3";
  if (s.includes("cat 2") || s.includes("category 2") || s.includes("grey"))
    return "Category 2";
  return "Category 1";
}

function oldForensic(source: string): string {
  if (!source) return "Category 1";
  const lower = source.toLowerCase();
  if (
    lower.includes("category 3") ||
    lower.includes("cat 3") ||
    lower.includes("sewage") ||
    lower.includes("contaminated")
  ) {
    return "Category 3";
  }
  if (
    lower.includes("category 2") ||
    lower.includes("cat 2") ||
    lower.includes("grey water")
  ) {
    return "Category 2";
  }
  return "Category 1";
}

function oldScope(waterSource: string): string {
  if (!waterSource) return "Category 1";
  if (waterSource.includes("Category 2") || waterSource.includes("grey water"))
    return "Category 2";
  if (
    waterSource.includes("Category 3") ||
    waterSource.includes("contaminated") ||
    waterSource.includes("Sewage") ||
    waterSource.includes("biohazard")
  )
    return "Category 3";
  return "Category 1";
}

const TIER1_OPTIONS = [
  "Burst pipe (clean water — Category 1)",
  "Overflowing toilet (Category 2 — grey water)",
  "Flood/stormwater (Category 3 — contaminated)",
  "Sewage backup (Category 3 — biohazard)",
  "Roof leak (Category 1 — clean)",
  "Hot water service failure (Category 1)",
  "Washing machine/dishwasher (Category 1)",
  "Unknown source",
  "Other",
];

const FREE_TEXT = [
  "Burst pipe in kitchen",
  "Roof leak after storm",
  "Hot water service failure",
  "Washing machine hose",
  "Dishwasher",
  "Dishwasher supply line burst",
  "Dishwasher discharge",
  "Roof leak Flood",
  "Grey water Sewage backup",
  "Burst pipe then Overflowing toilet",
  "Overflowing toilet (urine only)",
  "Grey water discharge",
  "Flood from river",
  "Sewage backup",
  "Biohazard spill",
  "Contaminated standing water",
  "Mystery dampness",
  "sewage overflow",
  "grey water from laundry",
  "black water",
  "cat 2 water",
  "cat 3 water",
  "category 2",
  "CATEGORY 3",
  "Category 2 then Sewage backup",
  "contaminated runoff",
  "biohazard",
  "Grey carpet soaked by burst pipe",
  "Burst pipe under blackbutt flooring",
];

const CORPUS = [
  ...TIER1_OPTIONS,
  ...FREE_TEXT,
  ...FREE_TEXT.map((s) => s.toLowerCase()),
  ...FREE_TEXT.map((s) => s.toUpperCase()),
];

/**
 * Every input on which the shared function differs from an old copy, with the
 * reason. Anything not listed must match the old copy exactly. The listed
 * deltas fall into four kinds:
 *  - item 2 (dishwasher supply/discharge),
 *  - worst-source-wins over the scope-of-works copy, which checked Category 2
 *    before Category 3,
 *  - sources the shared function already knew and the copy missed (Flood,
 *    Overflowing toilet, Biohazard, Dishwasher, lower/upper-case wording), and
 *  - two narrowings of the assessment copy's bare "grey" and "black" matches
 *    to "grey water" and "black water" ("Grey carpet", "blackbutt" timber).
 */
const DELTAS: Record<"assessment" | "forensic" | "scope", Record<string, string>> = {
  assessment: {
    "Dishwasher": "Category 2", // was Category 1
    "Dishwasher discharge": "Category 2", // was Category 1
    "Roof leak Flood": "Category 3", // was Category 1
    "Burst pipe then Overflowing toilet": "Category 2", // was Category 1
    "Overflowing toilet (urine only)": "Category 2", // was Category 1
    "Flood from river": "Category 3", // was Category 1
    "Biohazard spill": "Category 3", // was Category 1
    "Contaminated standing water": "Category 3", // was Category 1
    "contaminated runoff": "Category 3", // was Category 1
    "biohazard": "Category 3", // was Category 1
    "Grey carpet soaked by burst pipe": "Category 1", // was Category 2
    "Burst pipe under blackbutt flooring": "Category 1", // was Category 3
    "dishwasher": "Category 2", // was Category 1
    "dishwasher discharge": "Category 2", // was Category 1
    "roof leak flood": "Category 3", // was Category 1
    "burst pipe then overflowing toilet": "Category 2", // was Category 1
    "overflowing toilet (urine only)": "Category 2", // was Category 1
    "flood from river": "Category 3", // was Category 1
    "biohazard spill": "Category 3", // was Category 1
    "contaminated standing water": "Category 3", // was Category 1
    "grey carpet soaked by burst pipe": "Category 1", // was Category 2
    "burst pipe under blackbutt flooring": "Category 1", // was Category 3
    "DISHWASHER": "Category 2", // was Category 1
    "DISHWASHER DISCHARGE": "Category 2", // was Category 1
    "ROOF LEAK FLOOD": "Category 3", // was Category 1
    "BURST PIPE THEN OVERFLOWING TOILET": "Category 2", // was Category 1
    "OVERFLOWING TOILET (URINE ONLY)": "Category 2", // was Category 1
    "FLOOD FROM RIVER": "Category 3", // was Category 1
    "BIOHAZARD SPILL": "Category 3", // was Category 1
    "CONTAMINATED STANDING WATER": "Category 3", // was Category 1
    "CONTAMINATED RUNOFF": "Category 3", // was Category 1
    "BIOHAZARD": "Category 3", // was Category 1
    "GREY CARPET SOAKED BY BURST PIPE": "Category 1", // was Category 2
    "BURST PIPE UNDER BLACKBUTT FLOORING": "Category 1", // was Category 3
  },
  forensic: {
    "Dishwasher": "Category 2", // was Category 1
    "Dishwasher discharge": "Category 2", // was Category 1
    "Roof leak Flood": "Category 3", // was Category 1
    "Burst pipe then Overflowing toilet": "Category 2", // was Category 1
    "Overflowing toilet (urine only)": "Category 2", // was Category 1
    "Flood from river": "Category 3", // was Category 1
    "Biohazard spill": "Category 3", // was Category 1
    "black water": "Category 3", // was Category 1
    "biohazard": "Category 3", // was Category 1
    "dishwasher": "Category 2", // was Category 1
    "dishwasher discharge": "Category 2", // was Category 1
    "roof leak flood": "Category 3", // was Category 1
    "burst pipe then overflowing toilet": "Category 2", // was Category 1
    "overflowing toilet (urine only)": "Category 2", // was Category 1
    "flood from river": "Category 3", // was Category 1
    "biohazard spill": "Category 3", // was Category 1
    "DISHWASHER": "Category 2", // was Category 1
    "DISHWASHER DISCHARGE": "Category 2", // was Category 1
    "ROOF LEAK FLOOD": "Category 3", // was Category 1
    "BURST PIPE THEN OVERFLOWING TOILET": "Category 2", // was Category 1
    "OVERFLOWING TOILET (URINE ONLY)": "Category 2", // was Category 1
    "FLOOD FROM RIVER": "Category 3", // was Category 1
    "BIOHAZARD SPILL": "Category 3", // was Category 1
    "BLACK WATER": "Category 3", // was Category 1
    "BIOHAZARD": "Category 3", // was Category 1
  },
  scope: {
    "Dishwasher": "Category 2", // was Category 1
    "Dishwasher discharge": "Category 2", // was Category 1
    "Roof leak Flood": "Category 3", // was Category 1
    "Burst pipe then Overflowing toilet": "Category 2", // was Category 1
    "Overflowing toilet (urine only)": "Category 2", // was Category 1
    "Grey water discharge": "Category 2", // was Category 1
    "Flood from river": "Category 3", // was Category 1
    "Biohazard spill": "Category 3", // was Category 1
    "Contaminated standing water": "Category 3", // was Category 1
    "sewage overflow": "Category 3", // was Category 1
    "black water": "Category 3", // was Category 1
    "cat 2 water": "Category 2", // was Category 1
    "cat 3 water": "Category 3", // was Category 1
    "category 2": "Category 2", // was Category 1
    "CATEGORY 3": "Category 3", // was Category 1
    "Category 2 then Sewage backup": "Category 3", // was Category 2
    "dishwasher": "Category 2", // was Category 1
    "dishwasher discharge": "Category 2", // was Category 1
    "roof leak flood": "Category 3", // was Category 1
    "grey water sewage backup": "Category 3", // was Category 2
    "burst pipe then overflowing toilet": "Category 2", // was Category 1
    "overflowing toilet (urine only)": "Category 2", // was Category 1
    "flood from river": "Category 3", // was Category 1
    "sewage backup": "Category 3", // was Category 1
    "category 3": "Category 3", // was Category 1
    "category 2 then sewage backup": "Category 3", // was Category 1
    "DISHWASHER": "Category 2", // was Category 1
    "DISHWASHER DISCHARGE": "Category 2", // was Category 1
    "ROOF LEAK FLOOD": "Category 3", // was Category 1
    "GREY WATER SEWAGE BACKUP": "Category 3", // was Category 1
    "BURST PIPE THEN OVERFLOWING TOILET": "Category 2", // was Category 1
    "OVERFLOWING TOILET (URINE ONLY)": "Category 2", // was Category 1
    "GREY WATER DISCHARGE": "Category 2", // was Category 1
    "FLOOD FROM RIVER": "Category 3", // was Category 1
    "SEWAGE BACKUP": "Category 3", // was Category 1
    "BIOHAZARD SPILL": "Category 3", // was Category 1
    "CONTAMINATED STANDING WATER": "Category 3", // was Category 1
    "SEWAGE OVERFLOW": "Category 3", // was Category 1
    "GREY WATER FROM LAUNDRY": "Category 2", // was Category 1
    "BLACK WATER": "Category 3", // was Category 1
    "CAT 2 WATER": "Category 2", // was Category 1
    "CAT 3 WATER": "Category 3", // was Category 1
    "CATEGORY 2": "Category 2", // was Category 1
    "CATEGORY 2 THEN SEWAGE BACKUP": "Category 3", // was Category 1
    "CONTAMINATED RUNOFF": "Category 3", // was Category 1
    "BIOHAZARD": "Category 3", // was Category 1
  },
};

describe("shared classifier versus the old private copies", () => {
  const copies = {
    assessment: oldAssessment,
    forensic: oldForensic,
    scope: oldScope,
  } as const;

  for (const [name, old] of Object.entries(copies) as Array<
    [keyof typeof copies, (s: string) => string]
  >) {
    it(`${name}: matches the old copy on every input except the listed deltas`, () => {
      const unexplained: string[] = [];
      for (const input of new Set(CORPUS)) {
        const now = extractWaterCategory(input);
        const want = DELTAS[name][input] ?? old(input);
        if (now !== want) unexplained.push(`${JSON.stringify(input)}: old ${old(input)}, now ${now}`);
      }
      expect(unexplained).toEqual([]);
    });

    it(`${name}: every listed delta is a real difference`, () => {
      for (const [input, want] of Object.entries(DELTAS[name])) {
        expect(old(input), input).not.toBe(want);
        expect(extractWaterCategory(input), input).toBe(want);
      }
    });
  }

  it("only the two bare grey/black narrowings ever lower a category", () => {
    const rank = (c: string) => Number(c.slice(-1));
    const lowered: string[] = [];
    for (const [name, old] of Object.entries(copies)) {
      for (const input of new Set(CORPUS)) {
        if (rank(extractWaterCategory(input)) < rank(old(input)))
          lowered.push(`${name}: ${input.toLowerCase()}`);
      }
    }
    expect([...new Set(lowered)].sort()).toEqual([
      "assessment: burst pipe under blackbutt flooring",
      "assessment: grey carpet soaked by burst pipe",
    ]);
  });

  it("all three Tier 1 option sets agree with their labels", () => {
    for (const option of TIER1_OPTIONS) {
      const label = option.match(/Category ([123])/)?.[1];
      expect(extractWaterCategory(option), option).toBe(
        `Category ${label ?? "1"}`,
      );
    }
  });
});
