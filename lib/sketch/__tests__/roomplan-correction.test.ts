import { describe, expect, it } from "vitest";
import {
  appendRoomPlanCorrection,
  confirmRoomPlanMeasurement,
  isRoomPlanPendingConfirm,
  recordRoomPlanExclude,
  recordRoomPlanGeometryCorrection,
  recordRoomPlanLabelCorrection,
} from "../roomplan-correction";

describe("roomplan-correction", () => {
  it("detects pending RoomPlan rooms awaiting confirmation", () => {
    expect(
      isRoomPlanPendingConfirm({
        captureAdapter: "roomplan",
        provenance: "underlay_reference",
      }),
    ).toBe(true);
    expect(
      isRoomPlanPendingConfirm({
        captureAdapter: "roomplan",
        provenance: "operator_measured",
      }),
    ).toBe(false);
    expect(
      isRoomPlanPendingConfirm({
        captureAdapter: "manual",
        provenance: "underlay_reference",
      }),
    ).toBe(false);
  });

  it("confirmRoomPlanMeasurement promotes provenance and appends history", () => {
    const next = confirmRoomPlanMeasurement(
      {
        type: "room",
        id: "r1",
        label: "Hall",
        provenance: "underlay_reference",
        captureAdapter: "roomplan",
        correctionHistory: [],
      },
      { by: "tech-1", at: "2026-07-27T00:00:00.000Z" },
    );
    expect(next.provenance).toBe("operator_measured");
    expect(next.confirmedAt).toBe("2026-07-27T00:00:00.000Z");
    expect(next.confirmedBy).toBe("tech-1");
    expect(next.correctionHistory).toEqual([
      {
        at: "2026-07-27T00:00:00.000Z",
        by: "tech-1",
        field: "confirm",
        before: "underlay_reference",
        after: "operator_measured",
        note: "Technician confirmed LiDAR measurement on site",
      },
    ]);
  });

  it("recordRoomPlanLabelCorrection appends history for roomplan rooms only", () => {
    const roomplan = recordRoomPlanLabelCorrection(
      {
        captureAdapter: "roomplan",
        label: "Room",
        correctionHistory: [],
      },
      "Kitchen",
      { at: "2026-07-27T01:00:00.000Z" },
    );
    expect(roomplan.label).toBe("Kitchen");
    expect(roomplan.correctionHistory).toHaveLength(1);
    expect(
      (roomplan.correctionHistory as { field: string }[])[0].field,
    ).toBe("label");

    const manual = recordRoomPlanLabelCorrection(
      { captureAdapter: "manual", label: "A" },
      "B",
    );
    expect(manual.label).toBe("B");
    expect(manual.correctionHistory).toBeUndefined();
  });

  it("appendRoomPlanCorrection preserves prior entries", () => {
    const history = appendRoomPlanCorrection(
      [{ at: "t0", field: "label", before: "a", after: "b" }],
      { at: "t1", field: "confirm", before: "underlay_reference", after: "operator_measured" },
    );
    expect(history).toHaveLength(2);
    expect(history[1].field).toBe("confirm");
  });

  it("recordRoomPlanGeometryCorrection updates area and history", () => {
    const next = recordRoomPlanGeometryCorrection(
      {
        captureAdapter: "roomplan",
        areaM2: 12,
        originalPoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
        correctionHistory: [],
      },
      {
        points: [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
          { x: 200, y: 100 },
        ],
        areaM2: 20,
      },
      { at: "2026-07-27T02:00:00.000Z" },
    );
    expect(next.areaM2).toBe(20);
    expect(
      (next.correctionHistory as { field: string }[])[0].field,
    ).toBe("geometry");
  });

  it("recordRoomPlanExclude forces underlay_reference", () => {
    const next = recordRoomPlanExclude(
      {
        captureAdapter: "roomplan",
        provenance: "operator_measured",
        correctionHistory: [],
      },
      { at: "2026-07-27T03:00:00.000Z" },
    );
    expect(next.provenance).toBe("underlay_reference");
    expect(next.excluded).toBe(true);
    expect(
      (next.correctionHistory as { field: string }[])[0].field,
    ).toBe("exclude");
  });
});
