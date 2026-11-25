import { describe, expect, it } from "vitest";
import {
  completenessBlockerAction,
  completenessBlockerHasFix,
  completenessBlockerHref,
  completenessBlockerLabel,
} from "../dashboard/completeness-blocker-links";

describe("completenessBlockerHref", () => {
  it("deep-links each blocker to the right inspection tab", () => {
    const id = "insp-1";
    expect(completenessBlockerHref(id, "client")).toContain("tab=insurer");
    expect(completenessBlockerHref(id, "s500")).toContain(
      "tab=classification",
    );
    expect(completenessBlockerHref(id, "baseline")).toContain("tab=moisture");
    expect(completenessBlockerHref(id, "photos")).toContain("tab=photos");
  });

  it("does not send date of loss to the insurer tab, which has no date field (RA-8337)", () => {
    expect(completenessBlockerHref("insp-1", "loss_date")).toBe(
      "/dashboard/inspections/insp-1",
    );
    expect(completenessBlockerHasFix("loss_date")).toBe(false);
    expect(completenessBlockerHasFix("client")).toBe(true);
  });

  it("labels and actions are human readable", () => {
    expect(completenessBlockerLabel("loss_date")).toMatch(/loss/i);
    expect(completenessBlockerAction("photos")).toMatch(/photo/i);
  });
});
