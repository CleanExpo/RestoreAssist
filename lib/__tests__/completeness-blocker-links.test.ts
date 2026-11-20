import { describe, expect, it } from "vitest";
import {
  completenessBlockerAction,
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

  it("labels and actions are human readable", () => {
    expect(completenessBlockerLabel("loss_date")).toMatch(/loss/i);
    expect(completenessBlockerAction("photos")).toMatch(/photo/i);
  });
});
