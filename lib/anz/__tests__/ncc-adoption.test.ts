import { describe, expect, it } from "vitest";
import {
  listAustralianStates,
  nationalFloorEdition,
  resolveNccEdition,
  type AustralianState,
} from "../ncc-adoption";

/**
 * Every expectation here traces to ncc.abcb.gov.au, read 2026-08-31:
 * NCC 2025 published 1 May 2026 and adopted progressively; NCC 2022 Amendment 1
 * from 1 May 2025, Amendment 2 from 29 July 2025.
 */
describe("NCC adoption — national amendment boundaries", () => {
  const cases: Array<[string, string]> = [
    ["2025-04-30", "NCC 2022"],
    ["2025-05-01", "NCC 2022 Amendment 1"],
    ["2025-07-28", "NCC 2022 Amendment 1"],
    ["2025-07-29", "NCC 2022 Amendment 2"],
  ];
  for (const [asAt, expected] of cases) {
    it(`NSW on ${asAt} is governed by ${expected}`, () => {
      expect(resolveNccEdition("NSW", asAt)).toBe(expected);
    });
  }
});

describe("NCC adoption — the split is real, on one day", () => {
  // The whole reason this module exists: same date, different answers.
  const asAt = "2026-08-31";
  const expected: Record<AustralianState, string> = {
    ACT: "NCC 2025",
    NSW: "NCC 2022 Amendment 2",
    NT: "NCC 2022 Amendment 2",
    QLD: "NCC 2022 Amendment 2",
    SA: "NCC 2022 Amendment 2",
    // Reverted 5 June 2026 by the Building Amendment Act 2026 (Tas).
    TAS: "NCC 2022 Amendment 2",
    VIC: "NCC 2025",
    WA: "NCC 2025",
  };
  for (const state of listAustralianStates()) {
    it(`${state} on ${asAt} → ${expected[state]}`, () => {
      expect(resolveNccEdition(state, asAt)).toBe(expected[state]);
    });
  }

  it("a single global edition cannot express this", () => {
    const distinct = new Set(
      listAustralianStates().map((s) => resolveNccEdition(s, asAt)),
    );
    expect(distinct.size).toBeGreaterThan(1);
  });
});

describe("NCC adoption — 1 May 2026 boundary", () => {
  it("VIC crosses to NCC 2025 on the day, not before", () => {
    expect(resolveNccEdition("VIC", "2026-04-30")).toBe("NCC 2022 Amendment 2");
    expect(resolveNccEdition("VIC", "2026-05-01")).toBe("NCC 2025");
  });

  it("NSW does not cross until 1 May 2027", () => {
    expect(resolveNccEdition("NSW", "2027-04-30")).toBe("NCC 2022 Amendment 2");
    expect(resolveNccEdition("NSW", "2027-05-01")).toBe("NCC 2025");
  });

  it("SA follows the BCA date (2027), not the PCA date (2026)", () => {
    expect(resolveNccEdition("SA", "2026-06-01")).toBe("NCC 2022 Amendment 2");
    expect(resolveNccEdition("SA", "2027-05-01")).toBe("NCC 2025");
  });
});

describe("NCC adoption — Tasmania adopted NCC 2025 and then reverted", () => {
  // Building Amendment Act 2026 (Tas) No. 6 of 2026, Royal Assent and commencement
  // 5 June 2026, substituting the Building Act 2016 s 4(1) definition to fix the
  // applicable edition at NCC 2022 as amended by Amendment 2 until 30 April 2027.
  it("is on NCC 2022 Amendment 2 the day before the national commencement", () => {
    expect(resolveNccEdition("TAS", "2026-04-30")).toBe("NCC 2022 Amendment 2");
  });

  it("is on NCC 2025 during the five-week window it actually applied", () => {
    expect(resolveNccEdition("TAS", "2026-05-01")).toBe("NCC 2025");
    expect(resolveNccEdition("TAS", "2026-06-04")).toBe("NCC 2025");
  });

  it("reverts to NCC 2022 Amendment 2 on the day the Act commenced", () => {
    expect(resolveNccEdition("TAS", "2026-06-05")).toBe("NCC 2022 Amendment 2");
    expect(resolveNccEdition("TAS", "2027-04-30")).toBe("NCC 2022 Amendment 2");
  });

  it("returns to NCC 2025 on 1 May 2027", () => {
    expect(resolveNccEdition("TAS", "2027-05-01")).toBe("NCC 2025");
  });

  it("proves adoption is not monotonic — a later step names an older edition", () => {
    const may = resolveNccEdition("TAS", "2026-05-15");
    const july = resolveNccEdition("TAS", "2026-07-15");
    expect(may).toBe("NCC 2025");
    expect(july).toBe("NCC 2022 Amendment 2");
  });
});

describe("NCC adoption — the Northern Territory has not adopted NCC 2025", () => {
  it("stays on NCC 2022 Amendment 2 indefinitely", () => {
    expect(resolveNccEdition("NT", "2026-08-31")).toBe("NCC 2022 Amendment 2");
    expect(resolveNccEdition("NT", "2030-01-01")).toBe("NCC 2022 Amendment 2");
  });
});

describe("nationalFloorEdition understates rather than overstates", () => {
  it("returns the oldest edition still in force anywhere", () => {
    expect(nationalFloorEdition("2026-08-31")).toBe("NCC 2022 Amendment 2");
  });

  it("stays at Amendment 2 even after every other jurisdiction moves on", () => {
    // NT has no announced adoption date, so the nationally-safe floor does not
    // advance in 2027. This is the correct answer, not a stale one: a citation
    // built from it is still true in the NT.
    expect(nationalFloorEdition("2028-01-01")).toBe("NCC 2022 Amendment 2");
  });

  it("is never newer than any individual jurisdiction", () => {
    const asAt = "2026-08-31";
    const floor = nationalFloorEdition(asAt);
    const perState = listAustralianStates().map((s) => resolveNccEdition(s, asAt));
    expect(perState).toContain(floor);
  });
});
