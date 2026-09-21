/**
 * RA-7610 backfill fixture: a location that matches two rooms on the same
 * job is not assigned and is listed for a person to confirm.
 *
 * The matcher is a pure function so this suite does not need a database.
 */
import { describe, expect, it } from "vitest";
import { classifyMoistureReadingRoomMatch } from "../backfill-moisture-reading-sketch-room";

const rooms = [
  { id: "sr-a", name: "Bathroom", inspectionId: "job-1" },
  { id: "sr-b", name: "Bathroom", inspectionId: "job-1" },
];

describe("RA-7610 moisture-reading SketchRoom backfill", () => {
  it("does not assign a location that matches two rooms and lists it for confirmation", () => {
    const result = classifyMoistureReadingRoomMatch(
      {
        id: "mr-1",
        inspectionId: "job-1",
        location: "Bathroom",
        sketchRoomId: null,
      },
      rooms,
    );

    expect(result.kind).toBe("confirm");
    if (result.kind !== "confirm") return;
    expect(result.reason).toBe("ambiguous");
    expect(result.candidateIds).toEqual(["sr-a", "sr-b"]);
    expect(result.sketchRoomId).toBeNull();
  });

  it("assigns only an exact, single, unambiguous match", () => {
    const result = classifyMoistureReadingRoomMatch(
      {
        id: "mr-2",
        inspectionId: "job-1",
        location: "Kitchen",
        sketchRoomId: null,
      },
      [{ id: "sr-k", name: "Kitchen", inspectionId: "job-1" }],
    );
    expect(result).toEqual({
      kind: "assign",
      sketchRoomId: "sr-k",
    });
  });

  it("lists a partial match for confirmation instead of assigning it", () => {
    const result = classifyMoistureReadingRoomMatch(
      {
        id: "mr-3",
        inspectionId: "job-1",
        location: "Living Room North Wall",
        sketchRoomId: null,
      },
      [{ id: "sr-l", name: "Living Room", inspectionId: "job-1" }],
    );
    expect(result.kind).toBe("confirm");
    if (result.kind !== "confirm") return;
    expect(result.reason).toBe("partial");
    expect(result.sketchRoomId).toBeNull();
  });

  it("skips a reading that already has a sketchRoomId (idempotent)", () => {
    const result = classifyMoistureReadingRoomMatch(
      {
        id: "mr-4",
        inspectionId: "job-1",
        location: "Kitchen",
        sketchRoomId: "already",
      },
      [{ id: "sr-k", name: "Kitchen", inspectionId: "job-1" }],
    );
    expect(result).toEqual({ kind: "skip", reason: "already-linked" });
  });
});
