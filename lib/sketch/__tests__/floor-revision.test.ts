import { describe, expect, it } from "vitest";
import {
  floorRevisionMatches,
  isFloorRevisionConflict,
  parseFloorRevision,
  readFloorRevision,
} from "../floor-revision";
import { floorRevisionOf } from "../floor-revision-server";

const REV = floorRevisionOf({ objects: [] });

describe("RA-8056 floor revision precondition", () => {
  it("parses absent, new, a revision, and rejects anything else", () => {
    expect(parseFloorRevision(null)).toEqual({ kind: "absent" });
    expect(parseFloorRevision("  ")).toEqual({ kind: "absent" });
    expect(parseFloorRevision("none")).toEqual({ kind: "new" });
    expect(parseFloorRevision(REV)).toEqual({ kind: "at", revision: REV });
    expect(parseFloorRevision("2026-09-20T00:00:00.000Z")).toEqual({
      kind: "invalid",
    });
    expect(parseFloorRevision(REV.toUpperCase())).toEqual({ kind: "invalid" });
  });

  it("matches only the stored revision; `none` only when no floor is stored", () => {
    const at = parseFloorRevision(REV);
    expect(floorRevisionMatches(at, REV)).toBe(true);
    expect(floorRevisionMatches(at, floorRevisionOf({ objects: [1] }))).toBe(
      false,
    );
    expect(floorRevisionMatches(at, null)).toBe(false);
    expect(floorRevisionMatches({ kind: "new" }, null)).toBe(true);
    expect(floorRevisionMatches({ kind: "new" }, REV)).toBe(false);
    expect(floorRevisionMatches({ kind: "absent" }, REV)).toBe(true);
    expect(floorRevisionMatches({ kind: "invalid" }, REV)).toBe(false);
  });

  it("a meta object that held only Vision room ids hashes as no meta", () => {
    expect(
      floorRevisionOf({
        objects: [],
        raSketchMeta: { aiSuggestedRoomIds: ["r1"] },
      }),
    ).toBe(REV);
  });

  it("reads conflicts and revisions from response bodies", () => {
    expect(isFloorRevisionConflict({ conflict: "revision" })).toBe(true);
    expect(isFloorRevisionConflict({ stale: true })).toBe(false);
    expect(isFloorRevisionConflict(null)).toBe(false);
    expect(readFloorRevision({ revision: REV })).toBe(REV);
    expect(readFloorRevision({ revision: "x" })).toBeNull();
    expect(readFloorRevision(null)).toBeNull();
  });
});
