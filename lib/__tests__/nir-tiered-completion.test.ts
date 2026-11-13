import { describe, expect, it } from "vitest";
import { validateTieredCompletion } from "@/lib/nir-tiered-completion";

describe("validateTieredCompletion", () => {
  it("does not throw when photos array contains sparse or invalid entries", () => {
    const sparse = [] as unknown[];
    sparse[0] = undefined;
    sparse[1] = { id: "p1" };

    expect(() =>
      validateTieredCompletion({
        propertyAddress: "1 Test St",
        propertyPostcode: "2000",
        inspectionDate: "2026-10-14",
        affectedAreas: [{}],
        affectedAreasWithSource: [{ waterSource: "Clean Water" }],
        photos: sparse,
      }),
    ).not.toThrow();
  });
});
