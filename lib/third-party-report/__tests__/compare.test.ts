import { describe, expect, it } from "vitest";
import { compareFacts } from "../compare";
import type { ExtractedFact } from "../schema";

const fact = (
  field: ExtractedFact["field"],
  value: string | number,
  pageRef = 1,
): ExtractedFact => ({ field, value, pageRef, quote: "q" });

describe("compareFacts", () => {
  it("labels agrees, conflicts and new against the job", () => {
    const out = compareFacts(
      [
        fact("labName", "acme analytical"),
        fact("sporeCountPreRemediation", 5000),
        fact("labReportReference", "LR-77"),
      ],
      {
        labName: "Acme Analytical",
        sporeCountPreRemediation: 4000,
        labReportReference: null,
      },
    );
    expect(out.facts.map((f) => f.status)).toEqual(["agrees", "conflicts", "new"]);
    expect(out.facts[1]?.jobValue).toBe("4000");
    expect(out.facts[2]?.jobValue).toBeNull();
  });

  it("compares dates by calendar day", () => {
    const out = compareFacts([fact("samplingDate", "2026-09-12")], {
      samplingDate: new Date("2026-09-12T00:00:00.000Z"),
    });
    expect(out.facts[0]?.status).toBe("agrees");
  });

  it("treats a null job as all new", () => {
    const out = compareFacts([fact("labName", "X")], null);
    expect(out.facts[0]?.status).toBe("new");
  });

  it("reports a missing outdoor baseline as a gap, citing the edition via standardCite", () => {
    const out = compareFacts([fact("sporeCountPreRemediation", 900)], null);
    const gap = out.gaps.find((g) => g.code === "NO_OUTDOOR_BASELINE");
    expect(gap?.message).toMatch(/S520:\d{4}/);
    expect(gap?.message).toMatch(/Check manually/);
  });

  it("an outdoor citation never satisfies the indoor count, nor the reverse", () => {
    const onlyOutdoor = compareFacts([fact("outdoorBaselineCount", 300, 4)], null);
    expect(onlyOutdoor.gaps.map((g) => g.code)).not.toContain("NO_OUTDOOR_BASELINE");
    const onlyIndoor = compareFacts([fact("sporeCountPreRemediation", 900, 2)], null);
    expect(onlyIndoor.gaps.map((g) => g.code)).toContain("NO_OUTDOOR_BASELINE");
    // each fact keeps its own page
    expect(onlyOutdoor.facts[0]?.pageRef).toBe(4);
  });

  it("flags an empty report: no date and no lab identity", () => {
    const out = compareFacts([], null);
    expect(out.gaps.map((g) => g.code).sort()).toEqual([
      "NO_LAB_IDENTITY",
      "NO_SAMPLING_DATE",
    ]);
  });
});
