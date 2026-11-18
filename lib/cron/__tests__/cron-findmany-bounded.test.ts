/**
 * RA-8453 guard: a cron in lib/cron may not bound a read with a bare numeric
 * `take`. A fixed cap with no paging silently drops every row past it while
 * the run records success. Read a set that must be visited in full through
 * forEachPage / readAllPages (lib/cron/for-each-page.ts); a queue that drains
 * by a named BATCH_SIZE constant is not matched here.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CRON_DIR = path.resolve(__dirname, "..");

/** file -> why its numeric take is safe. Keep reasons true. */
const ALLOWED: Record<string, string> = {
  "media-cleanup.ts":
    "reads PENDING rows that leave the set when processed, so it drains over runs",
  "advance-workflows.ts":
    "stale-workflow sweep of 5 per run; a stuck workflow is failed and leaves RUNNING",
};

function bareNumericTakes(source: string): number[] {
  const lines: number[] = [];
  source.split("\n").forEach((line, i) => {
    if (/\btake\s*:\s*\d/.test(line)) lines.push(i + 1);
  });
  return lines;
}

describe("lib/cron reads are not silently capped", () => {
  it("the detector finds a planted bare numeric take", () => {
    const planted = `await prisma.user.findMany({\n  where: {},\n  take: 1000,\n});`;
    expect(bareNumericTakes(planted)).toEqual([3]);
    expect(bareNumericTakes("  take: BATCH_SIZE,")).toEqual([]);
  });

  it("no cron file outside the allow-list has a bare numeric take", () => {
    const offenders = readdirSync(CRON_DIR)
      .filter((f) => f.endsWith(".ts") && !(f in ALLOWED))
      .flatMap((f) =>
        bareNumericTakes(readFileSync(path.join(CRON_DIR, f), "utf8")).map(
          (line) => `lib/cron/${f}:${line}`,
        ),
      );
    expect(
      offenders,
      "Use forEachPage/readAllPages from lib/cron/for-each-page.ts",
    ).toEqual([]);
  });

  it("every allow-listed file still exists and still needs its entry", () => {
    for (const file of Object.keys(ALLOWED)) {
      const source = readFileSync(path.join(CRON_DIR, file), "utf8");
      expect(bareNumericTakes(source).length, file).toBeGreaterThan(0);
    }
  });
});
