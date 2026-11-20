/**
 * RA-8464 (DSA-04) guard: the signed-in app's accent is the brand harbour
 * scale, never Tailwind's cyan.
 *
 * The cyan bridge in app/globals.css used to re-point every cyan-N utility at
 * the brand hue. Slice 3 removed it, so a new cyan-N utility now renders stock
 * Tailwind teal next to palette B's cobalt. This test fails on any cyan-N
 * utility in tracked source under app/, components/ or lib/, and on any
 * attempt to bring the bridge back.
 *
 * It reads git's list of tracked files, not the disk, so ignored local files
 * cannot change the result.
 */
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SCANNED = /\.(tsx?|jsx?|mjs|cjs|css|mdx?)$/;
// A Tailwind colour utility on the cyan scale: bg-cyan-500, dark:text-cyan-300/40,
// from-cyan-400, ring-cyan-400 and so on.
const CYAN_UTILITY =
  /(?<![\w-])(?:[\w-]+:)*[a-z]+(?:-[a-z]+)*-cyan-(?:50|[1-9]00|950)(?![0-9])/g;

function trackedSource(): string[] {
  const out = execFileSync(
    "git",
    ["ls-files", "--", "app", "components", "lib"],
    {
      cwd: ROOT,
      encoding: "utf8",
    },
  );
  return out.split("\n").filter((f) => SCANNED.test(f));
}

export function findCyanUtilities(text: string): string[] {
  return text.match(CYAN_UTILITY) ?? [];
}

describe("no Tailwind cyan utilities (RA-8464)", () => {
  it("the matcher catches cyan utilities and ignores harbour ones", () => {
    expect(
      findCyanUtilities('className="bg-cyan-500 dark:text-cyan-300/40"'),
    ).toEqual(["bg-cyan-500", "dark:text-cyan-300"]);
    expect(
      findCyanUtilities("from-cyan-400 via-cyan-50 to-cyan-950"),
    ).toHaveLength(3);
    expect(
      findCyanUtilities(
        'className="bg-brand-harbour-500 ring-brand-harbour-400"',
      ),
    ).toEqual([]);
    expect(findCyanUtilities('"#06b6d4", // cyan-500')).toEqual([]);
  });

  it("finds tracked source to scan", () => {
    expect(trackedSource().length).toBeGreaterThan(500);
  });

  it("has no cyan-N utility in tracked app/, components/ or lib/ source", () => {
    const hits: string[] = [];
    for (const file of trackedSource()) {
      const found = findCyanUtilities(readFileSync(join(ROOT, file), "utf8"));
      if (found.length) hits.push(`${file}: ${[...new Set(found)].join(" ")}`);
    }
    expect(hits).toEqual([]);
  });

  it("does not define a cyan bridge in app/globals.css", () => {
    const css = readFileSync(join(ROOT, "app", "globals.css"), "utf8");
    expect(css).not.toMatch(/--color-cyan-\d+\s*:/);
  });
});
