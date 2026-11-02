import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";

/**
 * Every place that writes an inspection's status must either tell the client or
 * say why it does not. A new writer fails here until someone decides which, so
 * "the status changed and the client heard nothing" cannot arrive unnoticed.
 */

// The call, not the name: an import left behind must not count as a hook.
const HOOK = "notifyClientStepChange({";
const DRYING_HOOK = "notifyClientDryingChange(";

/** Writers that deliberately do not fire the step email, each with its reason. */
const ALLOWLIST: Record<string, string> = {
  "app/api/inspections/[id]/sign/route.ts":
    "Signing never moves the client's step forward: it lands on SUBMITTED from a later or equal step.",
  "app/api/inspections/[id]/close/route.ts":
    "IN_BILLING to CLOSED stays on the Completed step; the review ask is the client email for closing.",
  "app/api/inspections/[id]/reopen/route.ts":
    "Reopening moves back to IN_BILLING, on the same Completed step.",
  "app/api/test/seed-inspection/route.ts":
    "Test-only seed route; it creates fixture jobs, not client changes.",
  "lib/v1/reference-claim-exit-spine.ts":
    "Reference fixture for the claim exit spine; not a live client job.",
  "lib/v1/reference-claim-fixture.ts":
    "Reference fixture for the claim spine; not a live client job.",
};

const ROOTS = ["app", "lib"];

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__" || entry === "node_modules") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

/** The text between the bracket at `open` and its partner. */
function balanced(source: string, open: number): string {
  const pair: Record<string, string> = { "(": ")", "{": "}" };
  const opener = source[open];
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === opener) depth++;
    else if (source[i] === pair[opener] && --depth === 0) {
      return source.slice(open + 1, i);
    }
  }
  return source.slice(open + 1);
}

/** Does this source write Inspection.status? Each write form has a sample below. */
function writesInspectionStatus(source: string): boolean {
  const call = /\.inspection\s*\.\s*(?:update|updateMany|upsert)\s*\(/g;
  for (const match of source.matchAll(call)) {
    const args = balanced(source, match.index + match[0].length - 1);
    // Only inside the written payload: `where: { status }` is a guard.
    for (const payload of args.matchAll(/\b(?:data|update|create)\s*:\s*\{/g)) {
      const body = balanced(args, payload.index + payload[0].length - 1);
      if (/\bstatus\b\s*[:,}]/.test(body)) return true;
    }
    // A payload built up beforehand: `data,` or `data: updates`.
    const built = args.match(/\bdata\s*(?::\s*(\w+)\s*)?[,}\n]/);
    const name = built ? (built[1] ?? "data") : null;
    if (name && new RegExp(`\\b${name}\\.status\\s*=`).test(source)) return true;
  }
  return /UPDATE\s+"?Inspection"?\s+SET\s+[^;`]*"?status"?\s*=/i.test(source);
}

function writers(): string[] {
  const repo = process.cwd();
  return ROOTS.flatMap((root) => sourceFiles(join(repo, root)))
    .filter((file) => writesInspectionStatus(readFileSync(file, "utf8")))
    .map((file) => relative(repo, file).split("\\").join("/"));
}

describe("the scanner recognises every write form", () => {
  it.each([
    [
      "update",
      `await prisma.inspection.update({ where: { id }, data: { status: "SCOPED" } });`,
    ],
    [
      "updateMany in a transaction",
      `await tx.inspection.updateMany({ where: { id, status: "DRAFT" }, data: { status: InspectionStatus.SUBMITTED } });`,
    ],
    [
      "upsert",
      `await prisma.inspection.upsert({ where: { id }, update: { status: "CLASSIFIED" }, create: {} });`,
    ],
    ["raw SQL", `await tx.$executeRaw\`UPDATE "Inspection" SET "status" = 'CLOSED'\`;`],
    [
      "a payload built beforehand",
      `const updates = {}; updates.status = "SCOPED"; await prisma.inspection.update({ where: { id }, data: updates });`,
    ],
    [
      "a computed status",
      `await prisma.inspection.update({ where: { id }, data: { status: nextStatus } });`,
    ],
  ])("sees %s", (_form, sample) => {
    expect(writesInspectionStatus(sample)).toBe(true);
  });

  it("does not read a where-clause guard as a write", () => {
    expect(
      writesInspectionStatus(
        `await prisma.inspection.update({ where: { id, status: "DRAFT" }, data: { notes: "x" } });`,
      ),
    ).toBe(false);
  });

  it("does not read a reading of the status as a write", () => {
    expect(
      writesInspectionStatus(
        `await prisma.inspection.findFirst({ where: { status: "DRAFT" } });`,
      ),
    ).toBe(false);
  });
});

describe("status writers on this tree", () => {
  const found = writers();

  it("finds writers at all, so an empty scan cannot pass", () => {
    expect(found.length).toBeGreaterThan(5);
    expect(found).toContain("app/api/inspections/[id]/cost-estimates/route.ts");
  });

  it("hooks or explains every writer", () => {
    const unexplained = found.filter(
      (file) =>
        !ALLOWLIST[file] && !readFileSync(file, "utf8").includes(HOOK),
    );
    expect(unexplained).toEqual([]);
  });

  it("keeps no stale allowlist entry", () => {
    const stale = Object.keys(ALLOWLIST).filter((file) => !found.includes(file));
    expect(stale).toEqual([]);
  });

  it("hooks every place that changes a drying reading or goal", () => {
    for (const file of [
      "app/api/inspections/[id]/moisture/route.ts",
      "app/api/inspections/[id]/moisture/[readingId]/route.ts",
      "app/api/inspections/[id]/moisture/[readingId]/invalidate/route.ts",
      "app/api/inspections/[id]/group-readings/route.ts",
      "app/api/inspections/[id]/draft-snapshot/route.ts",
      "app/api/inspections/[id]/drying-goal/route.ts",
      "lib/live-teacher/tools/take-reading.ts",
    ]) {
      expect(
        readFileSync(file, "utf8").split(DRYING_HOOK).length,
        file,
      ).toBeGreaterThan(1);
    }
  });

  it("hooks each route that moves the client forward", () => {
    for (const file of [
      "app/api/inspections/[id]/submit/route.ts",
      "app/api/inspections/[id]/accept/route.ts",
      "app/api/inspections/[id]/cost-estimates/route.ts",
      "app/api/inspections/[id]/generate-invoice/route.ts",
    ]) {
      expect(readFileSync(file, "utf8")).toContain(HOOK);
    }
  });
});
