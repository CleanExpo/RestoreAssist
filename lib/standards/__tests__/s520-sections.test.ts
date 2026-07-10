import { describe, expect, it } from "vitest";
import { S520_SECTIONS, getS520Section } from "../s520-sections";

describe("getS520Section — verified S520-2024 recall", () => {
  it("recalls worker protection at §5 Safety and Health (verified from the licensed S520:2024)", () => {
    expect(getS520Section("5")).toEqual({
      citationKey: "S520:2024 §5",
      title: "Safety and Health",
    });
  });

  it("recalls post-remediation clearance at §12 Post Remediation Verification", () => {
    expect(getS520Section("12")?.title).toBe("Post Remediation Verification");
  });

  it("tolerates a leading § and whitespace", () => {
    expect(getS520Section(" §7 ")?.title).toBe(
      "Inspection and Preliminary Determination",
    );
  });

  it("returns null for the fabricated §14 the code used to cite (S520:2024 has no §14)", () => {
    // ppe-requirements.ts / claim-recommendations.ts wrongly cited "§14
    // (worker protection)"; iicrc-checklists.ts wrongly cited "§14.x" for
    // clearance. S520:2024 ends at §13 — §14 must NOT resolve.
    expect(getS520Section("14")).toBeNull();
    expect(getS520Section("14.1")).toBeNull();
  });

  it("has the full verified chapter index", () => {
    expect(Object.keys(S520_SECTIONS).length).toBe(13);
    expect(getS520Section("1")?.title).toBe("Principles of Mold Remediation");
    expect(getS520Section("13")?.title).toBe("Indoor Environmental Professional");
  });
});
