/**
 * RA-8281 B1 round 13: structural guard for stored equipment selections.
 *
 * lib/reports/stored-equipment-pricing.ts is the ONLY code allowed to look
 * inside a stored or posted equipment selection. Review rounds 10 to 12 each
 * found one more reader of the raw value in a file a fixed list had missed,
 * so this scan walks EVERY non-test .ts/.tsx file under app/, lib/ and
 * components/. It fails on:
 *
 *   A. access to the stored value: member or element access on anything named
 *      `equipmentSelection`, JSON.parse / Array.isArray / spread / iteration
 *      of it, an alias of it under another untyped name, or typing it as
 *      `any` or a list (it must be `unknown` / StoredEquipmentSelections);
 *   B. a read of `.groupId` or `.dailyRate` on any receiver the file is not
 *      listed for below;
 *   C. a read of the cached `.equipmentCostTotal`.
 *
 * Every exception is listed below with the receivers it may use and a
 * one-line reason. What the scan cannot see is said at the bottom.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(__dirname, "..", "..");
const SCAN_DIRS = ["app", "lib", "components"];
const OWNER = "lib/reports/stored-equipment-pricing.ts";

interface Exception {
  /** Receivers that may be read for .groupId / .dailyRate (rule B). */
  receivers?: string[];
  /** Rule A is waived: the file's `equipmentSelection` is a different thing. */
  ownEquipmentSelection?: boolean;
  /** Rule C is waived. */
  equipmentCostTotal?: boolean;
  reason: string;
}

const EXCEPTIONS: Record<string, Exception> = {
  // ── Typed lines returned by the one reader (never the raw value) ─────────
  "lib/reports/generate-report-ai.ts": {
    receivers: ["line", "l"],
    reason: "reads PricedEquipmentLine values returned by priceStoredEquipment",
  },
  "lib/reports/build-structured-report.ts": {
    receivers: ["line"],
    reason: "reads PricedEquipmentLine values returned by priceStoredEquipment",
  },
  "lib/excel-export.ts": {
    receivers: ["line"],
    reason: "reads PricedEquipmentLine values returned by priceStoredEquipment",
  },
  "lib/restoration/cost-estimation-builder.ts": {
    receivers: ["line", "l", "pricingConfig"],
    reason:
      "reads StoredEquipmentLine / PricedEquipmentLine values from the one reader; pricingConfig.*DailyRate is the price list itself",
  },
  "lib/restoration/scope-of-works-builder.ts": {
    receivers: ["line"],
    reason: "reads StoredEquipmentLine / PricedEquipmentLine values from the one reader",
  },
  "app/api/reports/[id]/equipment/route.ts": {
    receivers: ["line"],
    reason: "writes PricedEquipmentLine values returned by priceStoredEquipment",
  },
  "components/InitialDataEntryForm.tsx": {
    receivers: ["sel", "s"],
    reason:
      "saved lines arrive through editableStoredEquipment; sel and s are the editor's own typed in-memory EquipmentSelection state, which carries no rate",
  },

  // ── The editor's own typed in-memory state (not the stored value) ────────
  "lib/equipment-matrix.ts": {
    receivers: ["selection"],
    reason:
      "typed EquipmentSelection helpers; selectionDailyRate is the pricing rule the one reader calls",
  },
  "lib/equipment-power.ts": {
    receivers: ["selection"],
    reason: "power maths over the editor's typed EquipmentSelection state; no money",
  },
  "components/EquipmentToolsSelection.tsx": {
    receivers: ["sel", "s", "selection"],
    reason:
      "saved lines arrive through editableStoredEquipment; the rest is editor state typed EquipmentSelection[], priced from the price list through selectionDailyRateOrNull",
  },

  // ── Writers that validate a posted body strictly before pricing it ───────
  "app/api/reports/initial-entry/route.ts": {
    receivers: ["entry", "item"],
    reason:
      "validates each posted entry (plain object, known group, positive whole quantity) with a 400 before pricing from the organisation price list; never reads the stored column",
  },

  // ── Built documents and other entities that only share a field name ──────
  "app/api/reports/generate-cost-estimation/route.ts": {
    receivers: ["item"],
    reason: "formats line items of the built cost document (already priced by the builder)",
  },
  "components/RestorationInspectionReportViewer.tsx": {
    receivers: ["item"],
    reason: "renders the built structured report's equipment rows (dailyRate: number | null)",
  },
  "components/VisualCostEstimationViewer.tsx": {
    receivers: ["item"],
    reason: "renders line items of the built cost document",
  },
  "components/VisualDashboardReport.tsx": {
    receivers: ["item"],
    reason: "renders the built structured report's equipment rows",
  },
  "lib/forms/calculations/equipment-cost-calculator.ts": {
    receivers: ["item"],
    reason: "guided-interview calculator items, not stored selections; its hard-coded prices are RA-8290",
  },
  "components/forms/guided-interview/EquipmentCostCalculator.tsx": {
    receivers: ["item"],
    reason: "renders the guided-interview calculator's items (RA-8290)",
  },
  "app/api/reports/upload/route.ts": {
    receivers: ["eq"],
    reason:
      "maps equipmentDeployment rows extracted from an uploaded third-party PDF (equipmentName, not groupId); never the stored column",
  },
  "lib/nir-quick-fill-templates.ts": {
    ownEquipmentSelection: true,
    reason: "NIR quick-fill template field of the same name: { id, type, quantity }, no rate, never the Report column",
  },
  "components/NIRTechnicianInputForm.tsx": {
    ownEquipmentSelection: true,
    reason: "NIR technician form state of the same name: { id, type, quantity }, no rate, never the Report column",
  },
  "lib/restoration/reconcile-pricing-safety.ts": {
    ownEquipmentSelection: true,
    reason:
      "input.equipmentSelection is a typed PricingSafetyItem list its callers build (the builders from the one reader's lines); no rate",
  },

  // ── The cached total: copied or a different entity, never shown as money ─
  "app/api/reports/bulk-duplicate/route.ts": {
    equipmentCostTotal: true,
    reason: "copies the column to the duplicate row unchanged; no reader prices from it",
  },
  "app/api/reports/[id]/download-json/route.ts": {
    equipmentCostTotal: true,
    reason: "Scope.equipmentCostTotal, a different table (the Scoping Engine's own summary)",
  },
  "app/api/scopes/route.ts": {
    equipmentCostTotal: true,
    reason: "Scope.equipmentCostTotal, a different table (the Scoping Engine's own summary)",
  },
  "components/ScopingEngine.tsx": {
    equipmentCostTotal: true,
    reason: "the Scoping Engine's own summary state, not Report.equipmentCostTotal",
  },
};

interface Violation {
  rule: "A" | "B" | "C";
  line: number;
  text: string;
}

/** Comments out, line structure kept, so a comment can name the fields. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

const WORD = String.raw`\bequipmentSelection\b`;
const RULE_A: RegExp[] = [
  // member or element access on the stored value
  new RegExp(String.raw`${WORD}\s*(\?\.|\.(?!\.)|\[)`),
  // parsing, shape tests, spreading or iterating it
  new RegExp(String.raw`JSON\.parse\([^)\n]*${WORD}`),
  new RegExp(String.raw`Array\.isArray\([^)\n]*${WORD}`),
  new RegExp(String.raw`\.\.\.\s*[\w.?!]*${WORD}`),
  new RegExp(String.raw`\b(of|in)\s+[\w.?!]*${WORD}`),
  // typed as `any` or as a list instead of unknown / StoredEquipmentSelections
  new RegExp(String.raw`${WORD}\??\s*:\s*(any\b|Array<|ReadonlyArray<|[\w.]+\[\])`),
];
/** An alias: `<name>[: <type>] = [...]equipmentSelection`. */
const ALIAS = new RegExp(
  String.raw`(\w+)\s*(?::\s*([\w.<>\[\]| ]+?))?\s*(?<![=!<>])=(?!=)\s*[\w.?!]*${WORD}`,
  "g",
);
const RULE_B = /([\w\])]+)\??\.(groupId|dailyRate)\b/g;
const RULE_C = /\.equipmentCostTotal\b/;

export function scanSource(source: string, exception?: Exception): Violation[] {
  const violations: Violation[] = [];
  const text = stripComments(source);
  const lines = text.split("\n");
  const lineOf = (index: number) => text.slice(0, index).split("\n").length;

  lines.forEach((raw, i) => {
    if (!exception?.ownEquipmentSelection && RULE_A.some((r) => r.test(raw))) {
      violations.push({ rule: "A", line: i + 1, text: raw.trim() });
    }
    for (const m of raw.matchAll(RULE_B)) {
      if (!(exception?.receivers ?? []).includes(m[1])) {
        violations.push({ rule: "B", line: i + 1, text: raw.trim() });
      }
    }
    if (!exception?.equipmentCostTotal && RULE_C.test(raw)) {
      violations.push({ rule: "C", line: i + 1, text: raw.trim() });
    }
  });

  if (!exception?.ownEquipmentSelection) {
    for (const m of text.matchAll(ALIAS)) {
      const name = m[1];
      const type = (m[2] ?? "").trim();
      const opaque =
        name === "equipmentSelection" ||
        type === "StoredEquipmentSelections" ||
        type === "unknown";
      if (!opaque) {
        violations.push({
          rule: "A",
          line: lineOf(m.index ?? 0),
          text: m[0].replace(/\s+/g, " ").trim(),
        });
      }
    }
  }
  return violations;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name === "__mocks__") {
      continue;
    }
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (
      /\.(ts|tsx)$/.test(name) &&
      !/\.(test|spec)\.tsx?$/.test(name) &&
      !name.endsWith(".d.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

const posix = (file: string) => relative(ROOT, file).split(sep).join("/");

describe("RA-8281 B1 round 13: only stored-equipment-pricing.ts reads a stored equipment selection", () => {
  const files = SCAN_DIRS.flatMap((d) => sourceFiles(join(ROOT, d)));

  it("walks the whole of app/, lib/ and components/ (not a fixed list)", () => {
    // A positive control on the walk itself: it must reach the owner and a
    // few thousand files, or an empty walk would read as a clean scan.
    expect(files.map(posix)).toContain(OWNER);
    expect(files.length).toBeGreaterThan(2000);
  });

  it("finds no raw access outside the owner", () => {
    const found: string[] = [];
    for (const file of files) {
      const rel = posix(file);
      if (rel === OWNER) continue;
      for (const v of scanSource(readFileSync(file, "utf8"), EXCEPTIONS[rel])) {
        found.push(`${rel}:${v.line} [rule ${v.rule}] ${v.text}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("every exception names a real file and gives a reason", () => {
    const known = new Set(files.map(posix));
    for (const [file, exception] of Object.entries(EXCEPTIONS)) {
      expect(known.has(file), `${file} is not a scanned file`).toBe(true);
      expect(exception.reason.length).toBeGreaterThan(20);
      expect(file).not.toBe(OWNER);
    }
  });

  it("every exception is still needed (a stale entry is removed, not kept)", () => {
    const stale = Object.keys(EXCEPTIONS).filter(
      (file) =>
        scanSource(readFileSync(join(ROOT, file), "utf8")).length === 0,
    );
    expect(stale).toEqual([]);
  });

  describe("the scan can fail (each planted defect is reported)", () => {
    const planted: Array<[string, string, "A" | "B" | "C"]> = [
      ["the cached rate on a raw element", "const r = sel.dailyRate;", "B"],
      ["the round 12 crash site", "getEquipmentGroupById(sel.groupId);", "B"],
      ["optional access", "const g = sel?.groupId;", "B"],
      ["iterating the stored value", "equipmentSelection.map((x) => x);", "A"],
      ["indexing the stored value", "const first = equipmentSelection[0];", "A"],
      ["its length", "if (data.equipmentSelection.length > 0) {}", "A"],
      ["parsing the column", "JSON.parse(report.equipmentSelection);", "A"],
      ["a shape test", "Array.isArray(report.equipmentSelection);", "A"],
      ["spreading it", "const copy = [...equipmentSelection];", "A"],
      ["a for-of over it", "for (const x of report.equipmentSelection) {}", "A"],
      ["typing it any[]", "interface D { equipmentSelection?: any[] }", "A"],
      ["typing it any", "interface D { equipmentSelection: any }", "A"],
      ["an untyped alias", "const rows = report.equipmentSelection;", "A"],
      [
        "an alias across a line break",
        "const rows =\n  report.equipmentSelection;",
        "A",
      ],
      ["an any-typed alias", "const rows: any[] = body.equipmentSelection;", "A"],
      ["the cached total", "const t = report.equipmentCostTotal;", "C"],
    ];
    it.each(planted)("%s", (_name, source, rule) => {
      expect(scanSource(source).map((v) => v.rule)).toContain(rule);
    });

    it("a listed receiver does not excuse another receiver in the same file", () => {
      const exception = EXCEPTIONS["lib/reports/generate-report-ai.ts"];
      expect(scanSource("const a = line.dailyRate;", exception)).toEqual([]);
      expect(
        scanSource("const a = sel.dailyRate;", exception).map((v) => v.rule),
      ).toEqual(["B"]);
    });

    it("the permitted forms pass", () => {
      const ok = [
        "const equipmentSelection: StoredEquipmentSelections = report.equipmentSelection;",
        "const stored: StoredEquipmentSelections =\n  report.equipmentSelection;",
        "const raw: unknown = body.equipmentSelection;",
        "priceStoredEquipment(report.equipmentSelection, pricing, 1);",
        "const { equipmentSelection } = data;",
        "interface D { equipmentSelection?: StoredEquipmentSelections }",
        "data: { equipmentSelection: true, equipmentCostTotal },",
        "if (a === report.equipmentSelection) {}",
        "// equipmentSelection.map and sel.dailyRate in a comment",
      ].join("\n");
      expect(scanSource(ok)).toEqual([]);
    });
  });
});

/*
 * What this scan does not see (stated so a green run is not over-read):
 *   - a raw value laundered through a helper whose parameter has another name
 *     and an `any` type;
 *   - a destructuring rename (`{ equipmentSelection: rows }`);
 *   - `.quantity`, which is too common a property name to scan; it cannot be
 *     reached on a raw element without first tripping rule A or B;
 *   - a route that serialises a whole Report row without naming these fields.
 *     GET /api/reports/[id] is the one such route and has its own test.
 * The compiler covers the first two wherever the value is typed
 * StoredEquipmentSelections (`unknown`).
 */
