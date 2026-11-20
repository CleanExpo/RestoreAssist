/**
 * RA-8388: every evidence class is accepted on exactly one submission path,
 * and one module decides which.
 *
 * Why this guard exists (founder ruling 17/11/2026). The evidence route's two
 * paths each accepted any class and stored the item alone when they could not
 * build its record: a file labelled "moisture reading" counted as a reading
 * with no measurement, and a JSON body labelled "damage photograph" became a
 * verified photograph with no picture. The design change is one owner,
 * `lib/evidence/submission-path-classes.ts`, asked by both paths before
 * anything is stored and by the capture screen when it picks a form.
 *
 * This file checks the owner against the schema and checks that the route
 * and the screen ask it. The behaviour itself, every class against each path
 * of the real route, is in
 * `app/api/inspections/[id]/evidence/__tests__/route.multipart.test.ts` and
 * `route.signed-metadata.test.ts` ("one path per evidence class").
 *
 * NOT covered, named limits: the other writers of evidence items (the batch
 * route, client submissions and promotion, the backfill script), and whether
 * a class on its right path carries the right content (that is each path's
 * own validation).
 *
 * To watch it fail: delete either `evidenceClassAllowedOnPath(` check in
 * `app/api/inspections/[id]/evidence/route.ts`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  evidenceClassAllowedOnPath,
  isMetadataOnlyEvidenceClass,
  submissionPathForEvidenceClass,
} from "@/lib/evidence/submission-path-classes";

const REPO = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(REPO, path), "utf8");

/** The classes the database knows, read from the schema itself. */
function schemaEvidenceClasses(): string[] {
  const block = /enum EvidenceClass \{([\s\S]*?)\n\}/.exec(
    read("prisma/schema.prisma"),
  );
  if (!block) throw new Error("enum EvidenceClass not found in the schema");
  return block[1]
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").trim())
    .filter((name) => /^[A-Z][A-Z0-9_]*$/.test(name));
}

const NOTES_AND_READINGS = [
  "AMBIENT_ENVIRONMENTAL",
  "EQUIPMENT_LOG",
  "MOISTURE_READING",
  "TECHNICIAN_NOTE",
];

describe("one submission path per evidence class (RA-8388)", () => {
  const classes = schemaEvidenceClasses();

  it("reads the schema's classes", () => {
    // A guard that finds no classes passes for the wrong reason.
    expect(classes.length).toBeGreaterThanOrEqual(18);
    expect(classes).toContain("MOISTURE_READING");
    expect(classes).toContain("PHOTO_DAMAGE");
  });

  it.each(schemaEvidenceClasses())(
    "%s is accepted on exactly one path",
    (evidenceClass) => {
      const accepted = (["json", "file"] as const).filter((path) =>
        evidenceClassAllowedOnPath(evidenceClass, path),
      );
      expect(accepted).toEqual([submissionPathForEvidenceClass(evidenceClass)]);
    },
  );

  it("the JSON path takes the notes and readings and nothing else", () => {
    // Written out, so moving a class between paths is a visible decision.
    expect(classes.filter(isMetadataOnlyEvidenceClass).sort()).toEqual(
      NOTES_AND_READINGS,
    );
  });

  it("both paths of the evidence route ask the owner", () => {
    const route = read("app/api/inspections/[id]/evidence/route.ts");
    expect(route).toMatch(/evidenceClassAllowedOnPath\(evidenceClass, "json"\)/);
    expect(route).toMatch(/evidenceClassAllowedOnPath\(evidenceClass, "file"\)/);
  });

  it("the capture screen asks the owner and keeps no list of its own", () => {
    const page = read("app/dashboard/inspections/[id]/capture/page.tsx");
    const body = /function isMetadataOnlyClass\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(
      page,
    );
    expect(body, "isMetadataOnlyClass not found").not.toBeNull();
    expect(body![1]).toMatch(/isMetadataOnlyEvidenceClass\(evidenceClass\)/);
    for (const name of NOTES_AND_READINGS) expect(body![1]).not.toContain(name);
  });
});
