import { describe, expect, it } from "vitest";
import {
  DISPOSITION_OPTIONS,
  dispositionGroup,
  dispositionLabel,
} from "@/lib/contents/disposition";

describe("contents disposition (RA-8501)", () => {
  it("reads each stored value as a label and a restorable group", () => {
    expect(dispositionLabel("CLEAN_ONSITE")).toBe("Restorable - clean on site");
    expect(dispositionLabel("PACK_OUT")).toBe("Restorable - pack out");
    expect(dispositionLabel("TOTAL_LOSS")).toBe("Non-restorable");
    expect(dispositionGroup("CLEAN_ONSITE")).toBe("Restorable");
    expect(dispositionGroup("PACK_OUT")).toBe("Restorable");
    expect(dispositionGroup("TOTAL_LOSS")).toBe("Non-restorable");
  });

  it("reads a missing or unknown value as not decided", () => {
    for (const v of [null, undefined, "", "RESTORABLE", 3]) {
      expect(dispositionLabel(v)).toBe("Not decided");
      expect(dispositionGroup(v)).toBe("Not decided");
    }
  });

  it("offers exactly the three stored values, in order", () => {
    expect(DISPOSITION_OPTIONS.map((o) => o.value)).toEqual([
      "CLEAN_ONSITE",
      "PACK_OUT",
      "TOTAL_LOSS",
    ]);
  });
});
