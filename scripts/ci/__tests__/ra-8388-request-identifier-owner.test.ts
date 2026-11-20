/**
 * RA-8388: an identifier taken from a request is checked by its one owner
 * before it reaches a database filter.
 *
 * Why this guard exists. Prisma ignores a filter whose value is `undefined`,
 * so `where: { id: evidenceId }` with no `evidenceId` in the body matches
 * every row in scope. Two handlers did exactly that (the evidence delete and
 * the workflow step update). Fixing the two instances does not stop a third:
 * this test reads the route sources and fails when a bare name appears in an
 * `id:` filter without having come from `requiredIdentifier`
 * (`lib/request-identifier.ts`), from the URL, or from the short list of
 * names below that are checked another way, each with its reason.
 *
 * What it reads: every `route.ts` under `app/api/inspections/[id]` that this
 * change touched. NOT covered: the other inspection routes, which this change
 * did not touch and which have not been audited; a value that reaches a
 * filter under another key (`workflowStepId:`, `url:`); and a value passed
 * through a helper. Those are named limits, not claims.
 *
 * To watch it fail: in `app/api/inspections/[id]/workflow/route.ts` replace
 * `requiredIdentifier(bodyField(body, "stepId"))` with `body.stepId`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { bodyField, requiredIdentifier } from "@/lib/request-identifier";

const REPO = resolve(__dirname, "../../..");
const ROUTES = "app/api/inspections/[id]";

/** Names that come from the URL, never from a body. */
const FROM_URL = new Set(["inspectionId", "id"]);

/**
 * Bare names allowed in an `id:` filter for a reason other than the owner.
 * Adding a name here is a decision: say what checks it.
 */
const CHECKED_ANOTHER_WAY: Record<string, Record<string, string>> = {
  "draft-snapshot/route.ts": {
    areaId: "parsed by snapshotSchema (rowIdSchema) before any query",
    environmentalId: "parsed by snapshotSchema (rowIdSchema) before any query",
    _environmentalId: "the same parsed value, renamed in a destructure",
  },
};

const FILES = [
  "evidence/route.ts",
  "workflow/route.ts",
  "workflow/validate/route.ts",
  "draft-snapshot/route.ts",
  "submit/route.ts",
  "insurer-profile/route.ts",
];

/** Type positions and select flags are not filters. */
const NOT_A_VALUE = new Set(["string", "true", "false", "number"]);

function bareIdFilters(source: string): string[] {
  const names: string[] = [];
  // `id: name` where name is a bare identifier: not `a.b`, not a call.
  const pattern = /\bid:\s*([A-Za-z_$][\w$]*)(?![\w$.(])/g;
  for (const match of source.matchAll(pattern)) {
    if (!NOT_A_VALUE.has(match[1])) names.push(match[1]);
  }
  return names;
}

function ownedNames(source: string): Set<string> {
  const names = new Set<string>();
  const pattern = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*requiredIdentifier\(/g;
  for (const match of source.matchAll(pattern)) names.add(match[1]);
  return names;
}

describe("requiredIdentifier, the owner", () => {
  it("returns a non-empty string unchanged", () => {
    expect(requiredIdentifier("ev_1")).toBe("ev_1");
    expect(requiredIdentifier(" ev_1 ")).toBe(" ev_1 ");
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["an empty string", ""],
    ["a number", 7],
    ["an object", { not: "x" }],
    ["a list", ["ev_1"]],
    ["true", true],
  ])("returns null for %s", (_name, value) => {
    expect(requiredIdentifier(value)).toBeNull();
  });

  it("reads a field only from a plain object body", () => {
    expect(bodyField({ evidenceId: "ev_1" }, "evidenceId")).toBe("ev_1");
    expect(bodyField(null, "evidenceId")).toBeUndefined();
    expect(bodyField(["ev_1"], "0")).toBeUndefined();
    expect(bodyField("text", "length")).toBeUndefined();
    expect(bodyField(7, "evidenceId")).toBeUndefined();
  });
});

describe("no bare request value in an id filter (changed inspection routes)", () => {
  it.each(FILES)("%s", (file) => {
    const source = readFileSync(resolve(REPO, ROUTES, file), "utf8");
    const owned = ownedNames(source);
    const excused = CHECKED_ANOTHER_WAY[file] ?? {};

    const offenders = bareIdFilters(source).filter(
      (name) => !FROM_URL.has(name) && !owned.has(name) && !(name in excused),
    );

    expect(offenders, `bare names in an id: filter in ${file}`).toEqual([]);
  });

  it("the two handlers that had the defect go through the owner", () => {
    const evidence = readFileSync(
      resolve(REPO, ROUTES, "evidence/route.ts"),
      "utf8",
    );
    const workflow = readFileSync(
      resolve(REPO, ROUTES, "workflow/route.ts"),
      "utf8",
    );
    expect(ownedNames(evidence).has("evidenceId")).toBe(true);
    expect(ownedNames(workflow).has("stepId")).toBe(true);
    // The filters are still there to be guarded: a rename must not make the
    // check above pass by finding nothing.
    expect(bareIdFilters(evidence)).toContain("evidenceId");
    expect(bareIdFilters(workflow)).toContain("stepId");
  });

  it("recognises the defect it exists for", () => {
    const old = `
      const body = await request.json();
      const { evidenceId } = body;
      await prisma.evidenceItem.deleteMany({ where: { id: evidenceId } });
    `;
    expect(bareIdFilters(old)).toEqual(["evidenceId"]);
    expect(ownedNames(old).has("evidenceId")).toBe(false);
  });
});
