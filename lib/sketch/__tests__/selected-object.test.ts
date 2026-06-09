import { describe, expect, it } from "vitest";
import { fabricObjectToSelected } from "../selected-object";

describe("fabricObjectToSelected", () => {
  it("maps a fabric room object (with custom data) to the panel view model", () => {
    const sel = fabricObjectToSelected({
      type: "polygon",
      fill: "rgba(0,0,0,0.1)",
      stroke: "#3b82f6",
      opacity: 0.8,
      data: {
        id: "el1",
        type: "room",
        label: "Living",
        material: "carpet",
        whsPathwayNote: "Sampled — negative",
      },
    });
    expect(sel).toEqual({
      id: "el1",
      type: "room",
      label: "Living",
      fill: "rgba(0,0,0,0.1)",
      stroke: "#3b82f6",
      opacity: 0.8,
      materialSlug: "carpet",
      whsPathwayNote: "Sampled — negative",
    });
  });

  it("falls back to the fabric type when data.type is absent", () => {
    const sel = fabricObjectToSelected({ type: "i-text", data: { id: "t1" } });
    expect(sel?.type).toBe("i-text");
    expect(sel?.materialSlug).toBeUndefined();
  });

  it("returns null for objects without a stable data id (not selectable in the panel)", () => {
    expect(fabricObjectToSelected({ type: "rect" })).toBeNull();
    expect(fabricObjectToSelected({ type: "rect", data: {} })).toBeNull();
    expect(fabricObjectToSelected(null)).toBeNull();
  });
});
