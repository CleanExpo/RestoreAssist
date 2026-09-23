import { describe, expect, it } from "vitest";
import {
  fabricObjectToSelected,
  shouldClearSelectionOnEmptyCanvasClick,
} from "../selected-object";

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
      captureAdapter: undefined,
      correctionCount: undefined,
      cause: undefined,
      waterCategory: undefined,
      provenance: undefined,
      lengthM: undefined,
      widthM: undefined,
      dimLocked: false,
      openingKind: undefined,
      wallThicknessM: undefined,
      ceilingHeightM: undefined,
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

  it("surfaces RoomPlan captureAdapter + correction count for the confirm panel", () => {
    const sel = fabricObjectToSelected({
      type: "polygon",
      data: {
        id: "rp1",
        type: "room",
        provenance: "underlay_reference",
        captureAdapter: "roomplan",
        correctionHistory: [{ at: "t", field: "label" }],
      },
    });
    expect(sel?.captureAdapter).toBe("roomplan");
    expect(sel?.correctionCount).toBe(1);
    expect(sel?.provenance).toBe("underlay_reference");
  });

  it("maps typed dimensions, lock, and opening kind for the selection panel", () => {
    const door = fabricObjectToSelected({
      type: "group",
      data: {
        id: "op1",
        type: "opening",
        openingKind: "door",
        widthM: 0.82,
        dimLocked: true,
      },
    });
    expect(door?.openingKind).toBe("door");
    expect(door?.widthM).toBe(0.82);
    expect(door?.dimLocked).toBe(true);
  });

  it("carries detailsLost onto the selected room and omits it when unset", () => {
    const lost = fabricObjectToSelected({
      data: { id: "r-lost", type: "room", detailsLost: true },
    });
    expect(lost?.detailsLost).toBe(true);
    expect(lost?.type).toBe("room");
    const plain = fabricObjectToSelected({
      data: { id: "r-plain", type: "room" },
    });
    expect(plain).not.toHaveProperty("detailsLost");
  });

  it("reads a raise-only voice ACM latch and omits it when unset", () => {
    const raised = fabricObjectToSelected({
      data: { id: "r-acm", type: "room", voiceRaisedAcm: true },
    });
    expect(raised?.voiceRaisedAcm).toBe(true);
    const plain = fabricObjectToSelected({
      data: { id: "r-plain", type: "room" },
    });
    expect(plain).not.toHaveProperty("voiceRaisedAcm");
  });

  it("maps missing openings, wall thickness, and ceiling height", () => {
    const missing = fabricObjectToSelected({
      type: "group",
      data: {
        id: "op2",
        type: "opening",
        openingKind: "missing",
        widthM: 0.9,
      },
    });
    expect(missing?.openingKind).toBe("missing");
    const room = fabricObjectToSelected({
      type: "polygon",
      data: {
        id: "r1",
        type: "room",
        wallThicknessM: 0.23,
        ceilingHeightM: 2.7,
      },
    });
    expect(room?.wallThicknessM).toBe(0.23);
    expect(room?.ceilingHeightM).toBe(2.7);
  });
});

describe("shouldClearSelectionOnEmptyCanvasClick (RA-7542)", () => {
  it("clears when Select tool hits empty canvas", () => {
    expect(
      shouldClearSelectionOnEmptyCanvasClick({
        toolMode: "select",
        fabricTarget: undefined,
      }),
    ).toBe(true);
  });

  it("does not clear when an object is hit", () => {
    expect(
      shouldClearSelectionOnEmptyCanvasClick({
        toolMode: "select",
        fabricTarget: { data: { id: "el1" } },
      }),
    ).toBe(false);
  });

  it("does not clear while drawing", () => {
    expect(
      shouldClearSelectionOnEmptyCanvasClick({
        toolMode: "room",
        fabricTarget: undefined,
      }),
    ).toBe(false);
  });
});
