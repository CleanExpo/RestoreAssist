import { describe, it, expect } from "vitest";
import { isUnderlayUrlImportEnabled } from "../underlay-import-flag";

// RA-6848 [C2] / RA-6850 [C4]: the URL import path is legally gated and must be
// OFF unless an explicit truthy value opens it. Fail-closed is the whole point.
describe("isUnderlayUrlImportEnabled", () => {
  it("is OFF when the env var is unset", () => {
    expect(isUnderlayUrlImportEnabled(undefined)).toBe(false);
  });

  it("is OFF for empty / falsy strings", () => {
    expect(isUnderlayUrlImportEnabled("")).toBe(false);
    expect(isUnderlayUrlImportEnabled("false")).toBe(false);
    expect(isUnderlayUrlImportEnabled("0")).toBe(false);
    expect(isUnderlayUrlImportEnabled("off")).toBe(false);
  });

  it("is ON only for explicit truthy values", () => {
    expect(isUnderlayUrlImportEnabled("1")).toBe(true);
    expect(isUnderlayUrlImportEnabled("true")).toBe(true);
    expect(isUnderlayUrlImportEnabled("on")).toBe(true);
    expect(isUnderlayUrlImportEnabled("TRUE")).toBe(true);
    expect(isUnderlayUrlImportEnabled(" on ")).toBe(true);
  });

  it("does not treat arbitrary text as truthy", () => {
    expect(isUnderlayUrlImportEnabled("yes")).toBe(false);
    expect(isUnderlayUrlImportEnabled("enabled")).toBe(false);
  });
});
