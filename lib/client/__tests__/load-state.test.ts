import { describe, expect, it } from "vitest";
import { isConfirmedEmpty } from "../load-state";

// RA-8084: an empty-account message may only render when the load succeeded.
describe("isConfirmedEmpty", () => {
  it("is true only when the load succeeded and nothing is held", () => {
    expect(isConfirmedEmpty(null, 0)).toBe(true);
    expect(isConfirmedEmpty(undefined, 0)).toBe(true);
  });

  it("is false when the load failed, even with nothing held", () => {
    expect(isConfirmedEmpty("Failed to load", 0)).toBe(false);
  });

  it("is false when data is held", () => {
    expect(isConfirmedEmpty(null, 3)).toBe(false);
    expect(isConfirmedEmpty("Failed to load", 3)).toBe(false);
  });
});
