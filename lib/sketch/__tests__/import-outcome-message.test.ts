/**
 * RA-8618 (RA-8235 part B): the floor plan reader's own outcome reaches the
 * screen. A failed read shows the validator's message and the hand-drawing
 * option; a partial read says how many rooms were left out.
 */
import { describe, expect, it } from "vitest";
import {
  droppedRoomsNote,
  emptyImportMessage,
  summariseReaderOutcome,
} from "@/lib/sketch/import-outcome-message";
import { validateSketchReaderOutput } from "@/lib/sketch/validate-ai-sketch-output";

const square = (label: string) => ({
  label,
  vertices: [
    { x: 0.1, y: 0.1 },
    { x: 0.4, y: 0.1 },
    { x: 0.4, y: 0.4 },
    { x: 0.1, y: 0.4 },
  ],
});
const broken = (label: string) => ({ label, vertices: [{ x: 0, y: 0 }] });

describe("summariseReaderOutcome", () => {
  it("keeps only the four fields the screen needs", () => {
    const outcome = validateSketchReaderOutput({
      rooms: [square("Lounge"), broken("Secret model text")],
    });
    const summary = summariseReaderOutcome(outcome);
    expect(summary).toEqual({
      status: "ok",
      message: outcome.message,
      manualDrawingFallback: false,
      droppedCount: 1,
    });
    expect(JSON.stringify(summary)).not.toContain("Secret model text");
  });

  it("refuses anything that is not a validator outcome", () => {
    expect(summariseReaderOutcome(undefined)).toBeNull();
    expect(
      summariseReaderOutcome({ status: "weird", message: "x" }),
    ).toBeNull();
    expect(
      summariseReaderOutcome({
        status: "ok",
        message: "x",
        manualDrawingFallback: false,
        droppedCount: -1,
      }),
    ).toBeNull();
  });
});

describe("emptyImportMessage", () => {
  it("shows the validator's own no_plan message, which offers hand drawing", () => {
    const summary = summariseReaderOutcome(
      validateSketchReaderOutput({ rooms: [] }),
    );
    expect(summary?.status).toBe("no_plan");
    expect(emptyImportMessage(summary)).toBe(summary?.message);
    expect(emptyImportMessage(summary)).toMatch(/draw the floor plan by hand/);
  });

  it("shows the validator's own invalid message", () => {
    const summary = summariseReaderOutcome(
      validateSketchReaderOutput({ rooms: [broken("A"), broken("B")] }),
    );
    expect(summary?.status).toBe("invalid");
    expect(emptyImportMessage(summary)).toMatch(/None of the 2 rooms/);
    expect(emptyImportMessage(summary)).toMatch(/by hand/);
  });

  it("adds the hand-drawing option when the message lacks it", () => {
    expect(
      emptyImportMessage({
        status: "invalid",
        message: "The reader failed.",
        manualDrawingFallback: true,
        droppedCount: 0,
      }),
    ).toBe("The reader failed. You can draw the floor plan by hand instead.");
  });

  it("still offers hand drawing when no outcome came back", () => {
    expect(emptyImportMessage(null)).toMatch(/draw the floor plan by hand/);
  });
});

describe("droppedRoomsNote", () => {
  it("names how many rooms were left out on an ok read", () => {
    const summary = summariseReaderOutcome(
      validateSketchReaderOutput({
        rooms: [square("A"), square("B"), broken("C"), broken("D")],
      }),
    );
    expect(droppedRoomsNote(summary)).toBe(
      "2 rooms the reader found could not be used and were left out.",
    );
  });

  it("uses the singular for one room", () => {
    expect(
      droppedRoomsNote({
        status: "ok",
        message: "",
        manualDrawingFallback: false,
        droppedCount: 1,
      }),
    ).toBe("1 room the reader found could not be used and was left out.");
  });

  it("says nothing when no room was dropped or there is no outcome", () => {
    expect(
      droppedRoomsNote(
        summariseReaderOutcome(
          validateSketchReaderOutput({ rooms: [square("A")] }),
        ),
      ),
    ).toBeNull();
    expect(droppedRoomsNote(null)).toBeNull();
  });
});
