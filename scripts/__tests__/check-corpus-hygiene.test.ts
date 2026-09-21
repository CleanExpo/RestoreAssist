/**
 * RA-7474 — `scanText` is the live detector (ingest imports it). The
 * `check:corpus` npm alias was a no-op on Windows (main never ran, exit 0)
 * and a usage-error on Linux (no `--dir`, exit 2). That alias is deleted;
 * these cases gate the detector in vitest instead of inventing a staging dir.
 *
 * Watch the rate-bearing case fail if `scanText` is neutered (returns `[]`),
 * then restore. A test that has only ever been seen green is not a gate.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// @ts-expect-error — plain .mjs helper, no type declarations.
import { scanText } from "../ci/check-corpus-hygiene.mjs";

const ROOT = process.cwd();

describe("scanText corpus hygiene detector (RA-7474)", () => {
  it("fails a rate-bearing string", () => {
    const hits = scanText("Technician charge-out is $440/hr on site.");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toEqual(
      expect.objectContaining({
        line: 1,
        text: expect.stringContaining("$440/hr"),
      }),
    );
  });

  it("passes a clean string", () => {
    const hits = scanText(
      "Category 2 water requires extraction and drying per IICRC S500.",
    );
    expect(hits).toEqual([]);
  });

  it("does not leave a check:corpus alias that can exit 0 while scanning nothing", () => {
    const packageJson = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(packageJson.scripts["check:corpus"]).toBeUndefined();
  });
});
