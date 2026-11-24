/**
 * RA-8576 - the list of tables that link to SketchRoom must match the schema.
 * This reads prisma/schema.prisma itself, so a table that gains a link to
 * SketchRoom fails here until it is added to room-dependents.ts. Without it a
 * sketch save would delete a room holding that table's rows and blank their
 * room link (RoomObservation went uncounted this way).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  SKETCH_ROOM_DEPENDENT_COUNT_SELECT,
  SKETCH_ROOM_DEPENDENT_RELATIONS,
} from "../room-dependents";

const SCHEMA = readFileSync(
  fileURLToPath(new URL("../../../prisma/schema.prisma", import.meta.url)),
  "utf8",
);

const blocks = SCHEMA.split(/^model /m)
  .slice(1)
  .map((b) => ({ name: b.split(/\s/, 1)[0], body: b }));

/** Models that hold a foreign key to SketchRoom, read from the schema text. */
const holders = blocks
  .filter((b) =>
    b.body
      .split("\n")
      .some((l) => /^\s+\w+\s+SketchRoom\??\s+@relation\(.*fields:\s*\[/.test(l)),
  )
  .map((b) => b.name);

/** The list relations declared inside `model SketchRoom`, e.g. evidencePins. */
const listRelations = (blocks.find((b) => b.name === "SketchRoom")?.body ?? "")
  .split("\n")
  .map((l) => /^\s+(\w+)\s+([A-Z]\w+)\[\]/.exec(l))
  .filter((m): m is RegExpExecArray => !!m)
  .map((m) => m[1]);

describe("SketchRoom dependent relations", () => {
  it("scans the schema well enough to find the tables we know of (positive control)", () => {
    expect(holders).toEqual(
      expect.arrayContaining([
        "EvidencePin",
        "Hazard",
        "MoistureReading",
        "RoomObservation",
        "ScopeItem",
        "SketchMoistureReading",
      ]),
    );
  });

  it("names every list relation on SketchRoom, no more and no fewer", () => {
    expect([...SKETCH_ROOM_DEPENDENT_RELATIONS].sort()).toEqual(
      [...listRelations].sort(),
    );
  });

  it("has one relation per table that holds a key to SketchRoom", () => {
    expect(SKETCH_ROOM_DEPENDENT_RELATIONS).toHaveLength(holders.length);
  });

  it("builds a count select naming every relation", () => {
    expect(Object.keys(SKETCH_ROOM_DEPENDENT_COUNT_SELECT).sort()).toEqual(
      [...SKETCH_ROOM_DEPENDENT_RELATIONS].sort(),
    );
  });
});
