import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * RA-8421: each route and screen used to hand-type its own list of job states,
 * and nothing tied those lists to the lifecycle when IN_BILLING and CLOSED were
 * added. The dispute pack and NIR report were refused on every invoiced job as
 * a result (same kind as RA-8021 and RA-8022).
 *
 * This test discovers every array or Set literal in app/ and lib/ (tests
 * excluded) made only of two or more InspectionStatus values. Outside the owner
 * file, each must be on the allow-list below with a reason. A new list fails
 * here; it should be a named export of lib/inspections/active-status.ts.
 *
 * Not seen by this scan: `status === "A" || status === "B"` chains, and lists
 * built from variables. One-value lists are equality checks, not state lists.
 */

const ROOT = join(__dirname, "..", "..", "..");
const OWNER = "lib/inspections/active-status.ts";

const INSPECTION_STATUSES = new Set([
  "DRAFT",
  "SUBMITTED",
  "PROCESSING",
  "CLASSIFIED",
  "SCOPED",
  "ESTIMATED",
  "COMPLETED",
  "REJECTED",
  "IN_BILLING",
  "CLOSED",
  "ARCHIVED",
]);

/**
 * Lists outside this ticket's scope, keyed by file and value set (not line, so
 * an unrelated edit cannot break the key). An entry that no longer matches
 * anything fails the test, so the list cannot rot.
 */
const ALLOWED: Record<string, string> = {
  "app/api/clients/route.ts COMPLETED,ARCHIVED":
    "ReportStatus, not InspectionStatus; the values only coincide.",
  "app/api/inspections/[id]/reopen/route.ts CLOSED,ARCHIVED":
    "Reopenable terminal states, mirrors the lifecycle edges in lib/lifecycle/inspection-state-machine.ts.",
  "app/dashboard/inspections/[id]/page.tsx DRAFT,SUBMITTED,PROCESSING,CLASSIFIED,SCOPED,ESTIMATED,IN_BILLING,CLOSED,ARCHIVED,COMPLETED":
    "STATUS_STEPS display order for the progress bar; names every state.",
};

const ELEMENT = String.raw`(?:"([A-Z_]+)"|'([A-Z_]+)'|InspectionStatus\.([A-Z_]+))(?:\s+as\s+const)?`;
const LIST = new RegExp(
  String.raw`\[\s*(${ELEMENT}(?:\s*,\s*${ELEMENT})+)\s*,?\s*\]`,
  "g",
);

type Found = { file: string; line: number; key: string };

/** Pure: every all-InspectionStatus list literal in one file's text. */
function findStatusLists(file: string, text: string): Found[] {
  const found: Found[] = [];
  for (const match of text.matchAll(LIST)) {
    const values = [...match[1].matchAll(new RegExp(ELEMENT, "g"))].map(
      (m) => m[1] ?? m[2] ?? m[3],
    );
    if (!values.every((v) => INSPECTION_STATUSES.has(v))) continue;
    const line = text.slice(0, match.index).split("\n").length;
    found.push({ file, line, key: `${file} ${values.join(",")}` });
  }
  return found;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "__tests__", ".next"].includes(entry.name)) continue;
      out.push(...sourceFiles(full));
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.(test|spec)\.tsx?$/.test(entry.name)
    ) {
      out.push(full);
    }
  }
  return out;
}

function scan(): Found[] {
  return ["app", "lib"].flatMap((top) =>
    sourceFiles(join(ROOT, top)).flatMap((full) =>
      findStatusLists(
        relative(ROOT, full).split(sep).join("/"),
        readFileSync(full, "utf8"),
      ),
    ),
  );
}

describe("findStatusLists (control)", () => {
  it("reads string, enum and Set lists, and ignores mixed or one-value lists", () => {
    const text = [
      'const a = ["SUBMITTED", "COMPLETED"];',
      "const b = new Set([InspectionStatus.ESTIMATED, InspectionStatus.CLOSED]);",
      'const c = ["SUBMITTED", "PENDING"];',
      'const d = ["DRAFT"];',
    ].join("\n");
    expect(findStatusLists("x.ts", text).map((f) => f.key)).toEqual([
      "x.ts SUBMITTED,COMPLETED",
      "x.ts ESTIMATED,CLOSED",
    ]);
  });
});

describe("InspectionStatus lists have one owner (RA-8421)", () => {
  const found = scan();

  it("finds no hand-typed list outside the owner that is not allow-listed", () => {
    const stray = found
      .filter((f) => f.file !== OWNER && !(f.key in ALLOWED))
      .map((f) => `${f.file}:${f.line} [${f.key.split(" ")[1]}]`);
    expect(stray).toEqual([]);
  });

  it("keeps no allow-list entry that no longer matches a list", () => {
    const keys = new Set(found.map((f) => f.key));
    expect(Object.keys(ALLOWED).filter((k) => !keys.has(k))).toEqual([]);
  });
});
