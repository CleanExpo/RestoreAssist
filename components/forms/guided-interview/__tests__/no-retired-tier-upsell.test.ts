/**
 * RA-8458 guard: RA-6929 retired the Premium / Enterprise plans, and every
 * guided-interview question is now available to every user. The interview
 * must not lock a progress ring or send anyone to buy a plan that does not
 * exist. This reads the component sources so a re-introduced upsell fails
 * here before it reaches a user.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(process.cwd(), "components/forms/guided-interview");

const SOURCES = readdirSync(DIR)
  .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
  .map((f) => ({ file: f, text: readFileSync(join(DIR, f), "utf8") }));

const RETIRED_UPSELL = [
  /Upgrade Required/,
  /Premium plan/i,
  /Enterprise plan/i,
  /upgrade to\s*\{?\s*["']?(Premium|Enterprise)/i,
  /Upgrade to \{/,
  /\/dashboard\/pricing\?upgrade/,
  /onUpgrade/,
];

describe("guided interview has no retired-tier upsell (RA-8458)", () => {
  it("scans the panel and the progress ring", () => {
    const names = SOURCES.map((s) => s.file);
    expect(names).toContain("GuidedInterviewPanel.tsx");
    expect(names).toContain("ProgressRing.tsx");
  });

  it.each(RETIRED_UPSELL.map((re) => [re.source, re] as const))(
    "no source matches %s",
    (_label, re) => {
      const hits = SOURCES.filter((s) => re.test(s.text)).map((s) => s.file);
      expect(hits).toEqual([]);
    },
  );
});
