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
    receivers: ["line", "l", "pricingConfig", "item"],
    reason:
      "reads StoredEquipmentLine / PricedEquipmentLine values from the one reader; pricingConfig.*DailyRate is the price list itself; item is a line of the document this file just built from those values (RA-8281 B2 blocked result)",
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

// ── Rule D (review round 13): a whole Report row is never answered as is ──
//
// Round 13's review found PUT /api/reports/[id] answering with the row that
// prisma returned, cached rate and cached total included. Rules A to C cannot
// see that: nothing reads inside the selection, the row is serialised whole.
// So: wherever a non-test file loads or writes a Report row WITHOUT a
// top-level `select` (the whole row), the variable holding it may not be
// handed whole to NextResponse.json / JSON.stringify, by name, by shorthand or
// by spread. It goes through withCurrentEquipment (reprices) or
// withoutCachedEquipmentMoney (bulk export) first, or the response names the
// fields it returns.

const ROW_CALL =
  /(?:const|let)\s+(\w+)\s*=\s*await\s+\w+\.report\.(?:findMany|findFirst|findUnique|findUniqueOrThrow|findFirstOrThrow|update|create|upsert)\(|^\s*(\w+)\s*=\s*await\s+\w+\.report\.(?:update|create|upsert|findFirst|findUnique)\(/gm;

function balancedEnd(src: string, open: number): number {
  let depth = 1;
  let i = open;
  while (depth > 0 && i < src.length) {
    const c = src[i];
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") depth -= 1;
    i += 1;
  }
  return i;
}

function hasTopLevelSelect(args: string): boolean {
  let depth = 0;
  let top = "";
  for (const c of args) {
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") depth -= 1;
    if (depth === 1) top += c;
  }
  return /\bselect\s*[:,}]/.test(top) || /\bselect\s*$/.test(top.trim());
}

/** Names of variables holding a whole Report row in this source. */
function wholeRowVariables(src: string): string[] {
  const names = new Set<string>();
  for (const m of src.matchAll(ROW_CALL)) {
    const open = (m.index ?? 0) + m[0].length;
    const args = src.slice(open, balancedEnd(src, open) - 1);
    if (!hasTopLevelSelect(args)) names.add(m[1] ?? m[2]);
  }
  return [...names];
}

const SAFE_WRAP = /(?:withCurrentEquipment|withoutCachedEquipmentMoney)\(\s*$/;

/** Blank out string text so a word inside a message is not read as code. */
function blankStrings(src: string): string {
  return src
    .replace(/"(?:[^"\\\n]|\\.)*"/g, (m) => `"${" ".repeat(m.length - 2)}"`)
    .replace(/'(?:[^'\\\n]|\\.)*'/g, (m) => `'${" ".repeat(m.length - 2)}'`)
    .replace(/`(?:[^`\\]|\\.)*`/g, (m) =>
      m.replace(/[^\n]/g, " ").replace(/^ /, "`").replace(/ $/, "`"),
    );
}

/** Lines where a whole Report row is serialised into a response as is. */
function wholeRowResponses(source: string): string[] {
  const src = blankStrings(source);
  const hits: string[] = [];
  const rows = wholeRowVariables(src);
  if (rows.length === 0) return hits;
  for (const call of src.matchAll(/NextResponse\.json\(|JSON\.stringify\(/g)) {
    const open = (call.index ?? 0) + call[0].length;
    const end = balancedEnd(src, open) - 1;
    const args = src.slice(open, end);
    for (const name of rows) {
      const whole = new RegExp(
        `(?<![\\w$])(?<!(?<!\\.\\.)\\.)${name}(?![\\w$]|\\s*\\??\\.(?!\\.)|\\s*\\[|\\s*:)`,
        "g",
      );
      for (const use of args.matchAll(whole)) {
        const before = args.slice(0, use.index);
        if (SAFE_WRAP.test(before)) continue;
        const line = src.slice(0, open + (use.index ?? 0)).split("\n").length;
        hits.push(`${line} [rule D] whole Report row \`${name}\` answered as is`);
      }
    }
  }
  return hits;
}

/**
 * Files where a whole row is handed on whole for a reason that is not a
 * response carrying the cached money. One line each.
 */
const ROW_EXCEPTIONS: Record<string, string> = {};

describe("RA-8281 B1 round 13 rule D: a whole Report row is never answered as is", () => {
  it("finds no whole-row response in app/, lib/ or components/", () => {
    const hits: string[] = [];
    let filesWithRows = 0;
    for (const file of SCAN_DIRS.flatMap((d) => sourceFiles(join(ROOT, d))).map(posix)) {
      const src = stripComments(readFileSync(join(ROOT, file), "utf8"));
      if (wholeRowVariables(src).length > 0) filesWithRows += 1;
      if (file in ROW_EXCEPTIONS) continue;
      for (const hit of wholeRowResponses(src)) hits.push(`${file}:${hit}`);
    }
    // Positive control on the detector's reach: dozens of files hold a whole row.
    expect(filesWithRows).toBeGreaterThan(30);
    expect(hits).toEqual([]);
  });

  it("every rule D exception is real, reasoned and still needed", () => {
    for (const [file, reason] of Object.entries(ROW_EXCEPTIONS)) {
      expect(reason.length, file).toBeGreaterThan(20);
      const src = readFileSync(join(ROOT, file), "utf8");
      expect(wholeRowResponses(src), `${file} no longer needs its exception`).not.toEqual([]);
    }
  });

  const ROW = "const saved = await prisma.report.update({ where: { id }, data });\n";
  it.each([
    ["the row itself", `${ROW}return NextResponse.json(saved);`],
    ["shorthand", `${ROW}return NextResponse.json({ saved, ok: true });`],
    ["a named field", `${ROW}return NextResponse.json({ report: saved });`],
    ["a spread", `${ROW}return NextResponse.json({ ...saved, extra: 1 }, { status: 201 });`],
    ["JSON.stringify", `${ROW}const body = JSON.stringify(saved);`],
    ["include but no select", `const row = await prisma.report.findFirst({ where: { id }, include: { client: { select: { name: true } } } });\nreturn NextResponse.json(row);`],
    ["assigned to a let", `let made;\n  made = await tx.report.create({ data });\nreturn NextResponse.json(made);`],
    ["a wrapped row beside a bare one", `${ROW}return NextResponse.json({ a: await withCurrentEquipment(saved), b: saved });`],
  ])("planted defect is reported: %s", (_label, src) => {
    expect(wholeRowResponses(src)).not.toEqual([]);
  });

  it.each([
    ["repriced", `${ROW}return NextResponse.json(await withCurrentEquipment(saved));`],
    ["repriced in a spread", `${ROW}return NextResponse.json({ ...(await withCurrentEquipment(saved)), extra: 1 });`],
    ["bulk export", `${ROW}return NextResponse.json({ r: withoutCachedEquipmentMoney(saved) });`],
    ["named fields only", `${ROW}return NextResponse.json({ id: saved.id, title: saved?.title });`],
    ["a selected row", `const row = await prisma.report.findFirst({ where: { id }, select: { id: true } });\nreturn NextResponse.json(row);`],
    ["a key of the same name", `${ROW}return NextResponse.json({ saved: true });`],
    ["the word inside a message", `${ROW}return NextResponse.json({ message: "saved", note: 'saved ok' });`],
  ])("permitted form is not reported: %s", (_label, src) => {
    expect(wholeRowResponses(src)).toEqual([]);
  });
});

// ── Rule E (review round 13): equipment money is multiplied in one place ──
//
// The third review found a part-cent total stored because a writer did its
// own rate x quantity arithmetic. A rate (or cost) multiplied by a `.quantity`
// outside the owner is reported; the owner's equipmentLineAmount is the one
// place it happens, in whole cents.
const MONEY_TIMES_QUANTITY = /\*\s*\(?\s*\w+\.quantity\b|\.quantity\s*\)?\s*\*/;
const MONEY_WORD = /rate|cost|price/i;

function quantityMoneyLines(source: string): number[] {
  const out: number[] = [];
  stripComments(source)
    .split("\n")
    .forEach((line, i) => {
      if (MONEY_TIMES_QUANTITY.test(line) && MONEY_WORD.test(line)) out.push(i + 1);
    });
  return out;
}

const QUANTITY_MONEY_EXCEPTIONS: Record<string, string> = {
  "lib/forms/calculations/equipment-cost-calculator.ts":
    "the guided-interview calculator with its own hard-coded prices; it never reads or writes a stored selection (RA-8290, separate ticket)",
};

describe("RA-8281 B1 round 13 rule E: equipment money is multiplied only in the owner", () => {
  const all = SCAN_DIRS.flatMap((d) => sourceFiles(join(ROOT, d))).map(posix);
  const EQUIPMENT_FILE = /equipment|initial-entry|InitialDataEntry|restoration\/|reports\//i;

  it("finds no rate x quantity arithmetic for equipment outside the owner", () => {
    const hits: string[] = [];
    for (const file of all) {
      if (file === OWNER || file in QUANTITY_MONEY_EXCEPTIONS) continue;
      if (!EQUIPMENT_FILE.test(file)) continue;
      const src = readFileSync(join(ROOT, file), "utf8");
      if (!/equipment/i.test(src)) continue;
      for (const line of quantityMoneyLines(src)) hits.push(`${file}:${line} [rule E]`);
    }
    expect(hits).toEqual([]);
  });

  it("the initial-entry writer prices and stores the billable rate, not the raw price-list figure", () => {
    const src = readFileSync(join(ROOT, "app/api/reports/initial-entry/route.ts"), "utf8");
    // The only variable named dailyRate in the pricing loop is the billable one.
    expect(src.match(/const dailyRate = /g)).toHaveLength(1);
    expect(src).toContain("const dailyRate = billableDailyRate(listRate);");
    expect(src).toContain("equipmentLineAmount(dailyRate, item.quantity, durationDays)");
    expect(src).toContain("priced.push({ ...item, dailyRate, totalCost });");
  });

  it("every rule E exception is reasoned and still needed", () => {
    for (const [file, reason] of Object.entries(QUANTITY_MONEY_EXCEPTIONS)) {
      expect(reason.length, file).toBeGreaterThan(20);
      expect(quantityMoneyLines(readFileSync(join(ROOT, file), "utf8")), file).not.toEqual([]);
    }
  });

  it.each([
    "const totalCost = dailyRate * item.quantity * durationDays;",
    "total += sel.quantity * rate;",
    "const cost = (rates[i] as number) * sel.quantity * days;",
  ])("planted defect is reported: %s", (line) => {
    expect(quantityMoneyLines(line)).toEqual([1]);
  });

  it.each([
    "const totalCost = equipmentLineAmount(dailyRate, item.quantity, durationDays);",
    "return total + group.amps * selection.quantity;",
    "// dailyRate * item.quantity in a comment",
  ])("permitted form is not reported: %s", (line) => {
    expect(quantityMoneyLines(line)).toEqual([]);
  });
});

/*
 * What this scan does not see (stated so a green run is not over-read):
 *   - a raw value laundered through a helper whose parameter has another name
 *     and an `any` type;
 *   - a destructuring rename (`{ equipmentSelection: rows }`);
 *   - `.quantity`, which is too common a property name to scan; it cannot be
 *     reached on a raw element without first tripping rule A or B;
 *   - rule D follows a whole Report row only under the name it was loaded
 *     into. It does not follow a rest-destructure (`{ a, ...rest } = report`;
 *     GET /api/reports/[id] does this and has its own test), a row returned
 *     out of a transaction closure or a helper, rows destructured from
 *     Promise.all (GET /api/user/export does this and has its own test), a
 *     row inside a template literal, or a Report row reached through another
 *     model's `include` (none exists today).
 * The compiler covers the first two wherever the value is typed
 * StoredEquipmentSelections (`unknown`).
 */

/*
 * Rule F (review 5): an equipment price-list daily rate is read as the
 * BILLABLE rate (billableDailyRate, the rate to the whole cent) wherever it is
 * shown or multiplied. A raw read shows one figure ($49.99 for 49.995) while
 * the job is billed on another ($50.00). The rate reader is
 * lib/equipment-matrix.ts; a file that reads one of these fields for itself
 * must pass it through billableDailyRate on that line or the line before, or
 * be a reasoned exception below.
 */
const EQUIPMENT_RATE_FIELDS = [
  "afdUnitLargeDailyRate",
  "airMoverAxialDailyRate",
  "airMoverCentrifugalDailyRate",
  "dehumidifierDesiccantDailyRate",
  "dehumidifierLGRDailyRate",
  "injectionDryingSystemDailyRate",
];
const RATE_READER = "lib/equipment-matrix.ts";
const RAW_RATE_READ = new RegExp(`\\.(${EQUIPMENT_RATE_FIELDS.join("|")})\\b|getEquipmentPricingField\\(`);

function rawRateReadLines(source: string): number[] {
  const lines = stripComments(source).split("\n");
  const out: number[] = [];
  lines.forEach((line, i) => {
    if (!RAW_RATE_READ.test(line)) return;
    if (/^\s*import\b/.test(line)) return;
    if (line.includes("billableDailyRate(") || (lines[i - 1] ?? "").includes("billableDailyRate(")) return;
    out.push(i + 1);
  });
  return out;
}

const RAW_RATE_READ_EXCEPTIONS: Record<string, string> = {
  // The price list itself: these read, validate, store or show the contractor's own figure.
  "app/api/pricing-config/route.ts": "the price-list writer: validates and stores what the contractor entered",
  "components/PricingConfiguration.tsx": "the price-list editor: shows the contractor's own entry back to them",
  "lib/pricing/org-pricing.ts": "prints the organisation's price list as AI grounding text; no job is priced from it here",
  "lib/nir-cost-estimation.ts": "copies the price list into its own rate table for the NIR estimate domain (RA-8292)",
  // The one writer that reads the field for itself, then bills the billable rate.
  "app/api/reports/initial-entry/route.ts":
    "validates the raw price-list value, then prices and stores billableDailyRate(listRate); held by the source test in rule E",
  // Other pricing domains with their own arithmetic; not equipment selections on a report (RA-8292).
  "lib/scope-biohazard.ts": "the biohazard scope domain: a unit cost on a scope item, not a stored selection (RA-8292)",
  "lib/scope-mould.ts": "the mould scope domain: a unit cost on a scope item, not a stored selection (RA-8292)",
  "lib/scope-storm.ts": "the storm scope domain: a unit cost on a scope item, not a stored selection (RA-8292)",
};

describe("RA-8281 B1 round 13 rule F: an equipment price-list rate is read as the billable rate", () => {
  const all = SCAN_DIRS.flatMap((d) => sourceFiles(join(ROOT, d))).map(posix);

  it("finds no raw read of an equipment daily rate outside the rate reader", () => {
    const hits: string[] = [];
    for (const file of all) {
      if (file === RATE_READER || file in RAW_RATE_READ_EXCEPTIONS) continue;
      const src = readFileSync(join(ROOT, file), "utf8");
      for (const line of rawRateReadLines(src)) hits.push(`${file}:${line} [rule F]`);
    }
    expect(hits).toEqual([]);
  });

  it("every rule F exception is reasoned and still needed", () => {
    for (const [file, reason] of Object.entries(RAW_RATE_READ_EXCEPTIONS)) {
      expect(reason.length, file).toBeGreaterThan(20);
      expect(rawRateReadLines(readFileSync(join(ROOT, file), "utf8")), file).not.toEqual([]);
    }
  });

  it("the entry form shows and totals the billable rate from the rate reader", () => {
    const src = readFileSync(join(ROOT, "components/InitialDataEntryForm.tsx"), "utf8");
    expect(src).toContain("const rate = getEquipmentDailyRateOrNull(groupId, pricingConfig);");
    expect(src).not.toContain("getEquipmentPricingField");
  });

  it.each([
    "const rate = pricingConfig.dehumidifierLGRDailyRate;",
    "const rate = field && pricingConfig ? pricingConfig[getEquipmentPricingField(groupId)] : undefined;",
    "total: dryingDuration * pricingConfig.injectionDryingSystemDailyRate,",
    "return `$${rates?.airMoverAxialDailyRate.toFixed(2)}/day`;",
  ])("planted defect is reported: %s", (line) => {
    expect(rawRateReadLines(line)).toEqual([1]);
  });

  it.each([
    "const rate = billableDailyRate(pricingConfig.dehumidifierLGRDailyRate);",
    "const rate = billableDailyRate(\n  pricingConfig.injectionDryingSystemDailyRate,\n);",
    "select: { dehumidifierLGRDailyRate: true },",
    'const FIELDS = ["airMoverAxialDailyRate"];',
    "// pricingConfig.dehumidifierLGRDailyRate in a comment",
    'import { getEquipmentPricingField } from "@/lib/equipment-matrix";',
  ])("permitted form is not reported: %s", (line) => {
    expect(rawRateReadLines(line)).toEqual([]);
  });
});

/*
 * Rule G (CodeRabbit, PR #2533): a route that loads only SOME price-list
 * columns must load every equipment daily rate. The one reader prices each
 * stored line from the price list it is handed; a column the query left out
 * reads as "rate not set", so the document was refused (422) for the owner
 * even with the rate set.
 */
function restrictedPriceListSelects(source: string): string[][] {
  const out: string[][] = [];
  const re = /pricingConfig:\s*\{\s*select:\s*\{([^}]*)\}/g;
  for (const m of stripComments(source).matchAll(re)) {
    out.push([...m[1].matchAll(/(\w+):\s*true/g)].map((k) => k[1]));
  }
  return out;
}

describe("RA-8281 B1 round 13 rule G: a restricted price-list query loads every equipment rate", () => {
  const all = SCAN_DIRS.flatMap((d) => sourceFiles(join(ROOT, d))).map(posix);
  const found = all.flatMap((file) =>
    restrictedPriceListSelects(readFileSync(join(ROOT, file), "utf8")).map((keys) => ({ file, keys })),
  );

  it("finds the restricted queries (so an empty list is not read as a pass)", () => {
    expect(found.map((f) => f.file).sort()).toEqual([
      "app/api/reports/[id]/generate-forensic-pdf/route.ts",
      "app/api/reports/generate-cost-estimation/route.ts",
      "app/api/reports/generate-scope-of-works/route.ts",
    ]);
  });

  it("each one selects all six equipment daily rates", () => {
    const missing = found.flatMap(({ file, keys }) =>
      EQUIPMENT_RATE_FIELDS.filter((f) => !keys.includes(f)).map((f) => `${file}: ${f}`),
    );
    expect(missing).toEqual([]);
  });

  it("a price list made of only the selected columns prices one of every catalogue item", async () => {
    const { getAllEquipmentGroups } = await import("@/lib/equipment-matrix");
    const { priceStoredEquipment } = await import("@/lib/reports/stored-equipment-pricing");
    const lines = getAllEquipmentGroups().map((g) => ({ groupId: g.id, quantity: 1 }));
    expect(lines.length).toBeGreaterThan(5);
    for (const { file, keys } of found) {
      const row = Object.fromEntries(keys.map((k) => [k, 50]));
      const priced = priceStoredEquipment(lines, row, 2);
      expect(priced.problems, file).toEqual([]);
      expect(priced.total, file).toBe(lines.length * 100);
    }
  });

  it("planted defect is reported: a query with one equipment rate left out", () => {
    const src = "include: { pricingConfig: { select: { id: true, airMoverAxialDailyRate: true } } }";
    expect(restrictedPriceListSelects(src)).toEqual([["id", "airMoverAxialDailyRate"]]);
  });
});

/*
 * Rule H (review 8): a file that loads saved lines into an editable list drops
 * the lines the reader could not read. It must take the count and refuse to
 * save while any are pending, or an ordinary Save deletes a saved line without
 * a word and presents the rest as the whole job.
 */
describe("RA-8281 B1 round 13 rule H: an editable list never drops an unreadable saved line silently", () => {
  const OWNER_FILE = "lib/reports/stored-equipment-pricing.ts";
  const callers = SCAN_DIRS.flatMap((d) => sourceFiles(join(ROOT, d)))
    .map(posix)
    .filter((file) => file !== OWNER_FILE)
    .map((file) => ({ file, source: stripComments(readFileSync(join(ROOT, file), "utf8")) }))
    .filter(({ source }) => source.includes("editableStoredEquipment("));

  it("finds the editable loaders (so an empty list is not read as a pass)", () => {
    expect(callers.map((c) => c.file).sort()).toEqual([
      "components/EquipmentToolsSelection.tsx",
      "components/InitialDataEntryForm.tsx",
    ]);
  });

  it("each one takes the unreadable count and shows the notice", () => {
    const missing = callers.flatMap(({ file, source }) =>
      ["unusableCount", "<UnreadableEquipmentNotice"]
        .filter((needle) => !source.includes(needle))
        .map((needle) => `${file}: ${needle}`),
    );
    expect(missing).toEqual([]);
  });

  it("each one that writes the list back refuses to save while a line is unreadable", () => {
    // A caller that sends equipmentSelection in a request body can replace
    // the saved list. The entry form sends it only when it creates a report
    // (no saved list exists then), which shouldCreateReport holds.
    const writers = callers.filter(({ source }) => /equipmentSelection:\s*equipmentSelections/.test(source));
    expect(writers.map((w) => w.file).sort()).toEqual([
      "components/EquipmentToolsSelection.tsx",
      "components/InitialDataEntryForm.tsx",
    ]);
    const unguarded = writers
      .filter(({ source }) => !source.includes("toast.error(UNREADABLE_LINES_BLOCK_SAVE)"))
      .filter(({ source }) => !source.includes("existingReportId: reportId"))
      .map((w) => w.file);
    expect(unguarded).toEqual([]);
  });

  it("the owner's own bulk export marks the row instead of dropping the line silently", () => {
    const owner = stripComments(readFileSync(join(ROOT, OWNER_FILE), "utf8"));
    expect(owner.split("editableStoredEquipment(").length - 1).toBe(2);
    expect(owner).toContain("copy.equipmentSelectionUnreadableLines = saved.unusableCount");
  });
});

// Rule I (CodeRabbit on #2533): the scope of works document prints the
// equipment rows the one reader's module made. The route used to multiply
// units, days and the group's first rate for itself, so a group whose lines
// had different rates printed rows that disagreed with the subtotal.
describe("RA-8281 B1 round 13 rule I: the scope of works document does not price equipment rows for itself", () => {
  const route = stripComments(
    readFileSync(join(ROOT, "app/api/reports/generate-scope-of-works/route.ts"), "utf8"),
  );
  it("prints the rows made by scopeEquipmentRows and has no per-unit-per-day arithmetic of its own", () => {
    expect(route).toContain("scopeEquipmentRows(item.equipment)");
    expect(route).not.toContain("/unit/day");
    expect(route).not.toMatch(/qty \* days \* rate/);
  });
});
