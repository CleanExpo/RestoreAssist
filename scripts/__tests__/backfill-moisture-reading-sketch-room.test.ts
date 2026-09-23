/**
 * RA-7610 backfill fixture: a location that matches two rooms on the same
 * job is not assigned and is listed for a person to confirm.
 *
 * The matcher is a pure function so this suite does not need a database.
 * Cap / host / detachedAt tests mock Prisma.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const sketchRoomFindMany = vi.fn();
const moistureFindMany = vi.fn();
const moistureUpdateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sketchRoom: { findMany: (...args: unknown[]) => sketchRoomFindMany(...args) },
    moistureReading: {
      findMany: (...args: unknown[]) => moistureFindMany(...args),
      updateMany: (...args: unknown[]) => moistureUpdateMany(...args),
    },
    $disconnect: vi.fn(),
  },
}));

import {
  BACKFILL_ROOM_PAGE,
  BackfillRoomCapError,
  classifyMoistureReadingRoomMatch,
  planMoistureReadingSketchRoomBackfill,
  redactedDatabaseTarget,
  runMoistureReadingSketchRoomBackfill,
} from "../backfill-moisture-reading-sketch-room";

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

describe("RA-7610 backfill operator guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    moistureFindMany.mockResolvedValue([]);
    moistureUpdateMany.mockResolvedValue({ count: 0 });
  });

  it("prints the redacted database host and name, never the password", () => {
    const target = redactedDatabaseTarget(
      "postgresql://owner:super-secret@db.prod.example:5432/restoreassist",
    );
    expect(target).toEqual({
      host: "db.prod.example",
      database: "restoreassist",
    });
    expect(JSON.stringify(target)).not.toContain("super-secret");
    expect(JSON.stringify(target)).not.toContain("owner");
  });

  it("logs the redacted target before any write", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL =
      "postgresql://owner:super-secret@db.prod.example:5432/restoreassist";
    sketchRoomFindMany.mockResolvedValue([]);

    try {
      await runMoistureReadingSketchRoomBackfill(["--apply"]);
      const joined = log.mock.calls.map((call) => call.join(" ")).join("\n");
      const hostLine = log.mock.calls.find((call) =>
        String(call[0]).includes("database host="),
      );
      expect(String(hostLine?.[0] ?? "")).toContain("host=db.prod.example");
      expect(String(hostLine?.[0] ?? "")).toContain("database=restoreassist");
      expect(joined).not.toContain("super-secret");
      expect(moistureUpdateMany).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
      log.mockRestore();
    }
  });

  it("exits without writing when the room fetch hits the take cap", async () => {
    sketchRoomFindMany.mockResolvedValue(
      Array.from({ length: BACKFILL_ROOM_PAGE }, (_, i) => ({
        id: `sr-${i}`,
        name: "Room",
        sketch: { inspectionId: "job-1" },
      })),
    );

    await expect(planMoistureReadingSketchRoomBackfill()).rejects.toBeInstanceOf(
      BackfillRoomCapError,
    );
    await expect(
      runMoistureReadingSketchRoomBackfill(["--apply"]),
    ).rejects.toBeInstanceOf(BackfillRoomCapError);
    expect(moistureUpdateMany).not.toHaveBeenCalled();
  });

  it("fetches only non-detached rooms", async () => {
    sketchRoomFindMany.mockResolvedValue([]);
    await planMoistureReadingSketchRoomBackfill();
    expect(sketchRoomFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { detachedAt: null },
        take: BACKFILL_ROOM_PAGE,
      }),
    );
  });
});
