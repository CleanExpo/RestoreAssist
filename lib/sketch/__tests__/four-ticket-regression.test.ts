/**
 * Cross-ticket regression anchor: RA-8241, RA-6948, RA-8156, RA-8232.
 */
import { describe, expect, it } from "vitest";
import { summarizePendingHomeownerCapture } from "../pending-homeowner-summary";
import { collectRoomsNeedingMeasurement } from "../rooms-needing-measurement";
import { sketchDataForCaptureEditor } from "../capture-floor-hydration";
import { reservedEmailSignUpMessage } from "@/lib/auth/reserved-email-user-message";
import { importSketchUserMessage } from "../import-sketch-user-message";

describe("Four-ticket regression anchor", () => {
  it("RA-8241 staff sees pending + homeowner rooms need measure after promote", () => {
    const pending = summarizePendingHomeownerCapture([
      {
        floorNumber: 0,
        floorLabel: "G",
        pendingHomeownerCapture: {
          sketchData: { objects: [{ data: { type: "room", id: "r1" } }] },
        },
      },
    ]);
    expect(pending.pendingFloors).toBe(1);

    const measure = collectRoomsNeedingMeasurement([
      {
        floorLabel: "G",
        sketchData: {
          objects: [
            {
              data: {
                type: "room",
                id: "r1",
                provenance: "underlay_reference",
                captureAdapter: "homeowner",
              },
            },
          ],
        },
      },
    ]);
    expect(measure).toHaveLength(1);
  });

  it("RA-8241 homeowner resumes quarantined sketch", () => {
    const data = sketchDataForCaptureEditor({
      floorNumber: 0,
      floorLabel: "G",
      pendingHomeownerCapture: { sketchData: { objects: [{ x: 1 }] } },
      sketchData: { objects: [] },
    });
    expect(data?.objects).toHaveLength(1);
  });

  it("RA-8156 reserved signup blocked", () => {
    expect(reservedEmailSignUpMessage("new@demo.test")).toMatch(/reserved/i);
  });

  it("RA-8232 import surfaces subscription copy", () => {
    expect(importSketchUserMessage(402, { code: "KEY_MISSING" })).toMatch(
      /subscription/i,
    );
  });
});
