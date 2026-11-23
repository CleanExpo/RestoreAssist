/**
 * RA-8620: "fill with sample data" must have one owner.
 *
 * The Tier 1 and Tier 2 steps each held a hand-made copy of a sample-fill
 * handler. One click wrote invented claim facts ("Hazards: None identified",
 * "No exclusions identified", made-up moisture readings) into a real report,
 * with no credit check, no chooser and no warning before the click.
 *
 * This guard reads every component under components/ and fails when a file
 * outside the allow-list defines a quick-fill / sample-fill / test-data
 * handler. The allow-list names the files whose sample fill is gated by the
 * credit check and the use-case chooser. A new component that needs sample
 * fill must reuse that gated flow, not add another local handler.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const COMPONENTS_DIR = path.resolve(__dirname, "..");

// Files whose sample fill runs the credit check and opens the chooser first.
const GATED_OWNERS = new Set(["InitialDataEntryForm.tsx"]);

const LOCAL_SAMPLE_FILL_HANDLER =
  /\b(?:const|function)\s+(handle\w*(?:QuickFill|SampleFill|TestData)\w*)\b/g;

function componentFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__" || entry === "node_modules") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...componentFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function findLocalSampleFillHandlers(
  source: string,
): string[] {
  return [...source.matchAll(LOCAL_SAMPLE_FILL_HANDLER)].map((m) => m[1]);
}

describe("RA-8620 sample-fill owner guard", () => {
  it("detects a throwaway local handler (positive control)", () => {
    const planted = `
      const handleQuickFill = () => {
        setResponses({ T1_Q7_hazards: ["None identified"] });
      };`;
    expect(findLocalSampleFillHandlers(planted)).toEqual(["handleQuickFill"]);
  });

  it("scans a non-trivial number of component files", () => {
    expect(componentFiles(COMPONENTS_DIR).length).toBeGreaterThan(100);
  });

  it("finds no ungated sample-fill handler outside the gated owner", () => {
    const offenders: string[] = [];
    for (const file of componentFiles(COMPONENTS_DIR)) {
      const rel = path.relative(COMPONENTS_DIR, file);
      if (GATED_OWNERS.has(rel)) continue;
      for (const name of findLocalSampleFillHandlers(
        readFileSync(file, "utf8"),
      )) {
        offenders.push(`components/${rel}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("still finds the gated owner's handler, so the scan reaches it", () => {
    const owner = readFileSync(
      path.join(COMPONENTS_DIR, "InitialDataEntryForm.tsx"),
      "utf8",
    );
    expect(findLocalSampleFillHandlers(owner)).toContain("handleQuickFill");
  });
});
