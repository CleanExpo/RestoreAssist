import { describe, it, expect } from "vitest";
import {
  collectFailedLabels,
  formatDeleteFailureMessage,
} from "../bulk-delete-message";

// STORM 100-closeout — pure helpers behind the invoice bulk-delete itemization.
// Sandra (admin) must see WHICH invoices failed, not just a count.

const ok = (): PromiseSettledResult<{ ok: boolean }> => ({
  status: "fulfilled",
  value: { ok: true },
});
const notOk = (): PromiseSettledResult<{ ok: boolean }> => ({
  status: "fulfilled",
  value: { ok: false },
});
const rejected = (): PromiseSettledResult<{ ok: boolean }> => ({
  status: "rejected",
  reason: new Error("network"),
});

describe("collectFailedLabels", () => {
  const labelFor = (id: string) => ({ a: "INV-001", b: "INV-002", c: "INV-003" }[id] ?? id);

  it("returns labels only for failed (non-ok or rejected) results, in order", () => {
    const ids = ["a", "b", "c"];
    const results = [ok(), notOk(), rejected()];
    expect(collectFailedLabels(ids, results, labelFor)).toEqual(["INV-002", "INV-003"]);
  });

  it("returns an empty array when everything succeeded", () => {
    expect(collectFailedLabels(["a", "b"], [ok(), ok()], labelFor)).toEqual([]);
  });

  it("falls back to the id when no label is found", () => {
    expect(collectFailedLabels(["z"], [notOk()], () => "z")).toEqual(["z"]);
  });
});

describe("formatDeleteFailureMessage", () => {
  it("names a single failed invoice", () => {
    expect(formatDeleteFailureMessage(["INV-001"])).toBe(
      "Failed to delete invoice INV-001.",
    );
  });

  it("lists multiple failed invoices", () => {
    expect(formatDeleteFailureMessage(["INV-001", "INV-003"])).toBe(
      "Failed to delete 2 invoices: INV-001, INV-003.",
    );
  });

  it("caps a long list with a +N more suffix", () => {
    const labels = ["INV-001", "INV-002", "INV-003", "INV-004", "INV-005"];
    expect(formatDeleteFailureMessage(labels, 3)).toBe(
      "Failed to delete 5 invoices: INV-001, INV-002, INV-003 and 2 more.",
    );
  });

  it("returns an empty string for no failures", () => {
    expect(formatDeleteFailureMessage([])).toBe("");
  });
});
