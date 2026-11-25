import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * RA-8542: claims the repo cannot back (no customer or usage evidence, no
 * timing study, no accuracy measurement) must not appear in public copy.
 * Each phrase is checked in the file that carried it, so a re-introduction
 * fails here.
 *
 * Not covered: the help article "Your first inspection in 8 minutes". Its
 * wording is pinned by lib/reports/__tests__/prerequisite-copy-contract.test.ts,
 * a file the RA-8297 branch also changes, so it is left to a follow-up after
 * RA-8297 merges.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const CHECKS: ReadonlyArray<{ file: string; banned: RegExp[] }> = [
  {
    file: "components/landing/home/homeContent.ts",
    banned: [
      /in active use/i,
      /Live today/i,
      /hours to minutes/i,
      /take shape in minutes/i,
    ],
  },
  {
    file: "components/landing/home/FAQSection.tsx",
    banned: [/hours to minutes/i],
  },
  {
    file: "components/landing/home/WorkflowSection.tsx",
    banned: [/take shape in minutes/i],
  },
  {
    file: "app/about/page.tsx",
    banned: [/accurate\s+restoration\s+reports/i, /highest industry standards/i],
  },
];

describe("public copy carries no unmeasured claim", () => {
  for (const { file, banned } of CHECKS) {
    for (const re of banned) {
      it(`${file} does not contain ${re}`, () => {
        expect(read(file)).not.toMatch(re);
      });
    }
  }
});
