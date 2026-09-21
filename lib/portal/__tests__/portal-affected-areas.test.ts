import { describe, it, expect } from "vitest";
import {
  MAX_PORTAL_AFFECTED_AREAS,
  PORTAL_AFFECTED_AREAS_INCLUDE,
  toPortalAffectedAreaItems,
} from "../portal-affected-areas";

describe("toPortalAffectedAreaItems (RA-7573)", () => {
  it("keeps one item per named area, in query order", () => {
    expect(
      toPortalAffectedAreaItems([
        { id: "a1", roomZoneId: "Kitchen" },
        { id: "a2", roomZoneId: "Hallway" },
      ]),
    ).toEqual([
      { id: "a1", label: "Kitchen" },
      { id: "a2", label: "Hallway" },
    ]);
  });

  it("returns empty when the job has no areas", () => {
    expect(toPortalAffectedAreaItems([])).toEqual([]);
  });

  it("hides blank labels instead of inventing a room name", () => {
    expect(
      toPortalAffectedAreaItems([
        { id: "a1", roomZoneId: "   " },
        { id: "a2", roomZoneId: null },
        { id: "a3", roomZoneId: "Laundry" },
      ]),
    ).toEqual([{ id: "a3", label: "Laundry" }]);
  });
});

describe("PORTAL_AFFECTED_AREAS_INCLUDE", () => {
  it("caps and orders the same way the public portal JSON route does", () => {
    expect(PORTAL_AFFECTED_AREAS_INCLUDE.take).toBe(MAX_PORTAL_AFFECTED_AREAS);
    expect(MAX_PORTAL_AFFECTED_AREAS).toBe(100);
    expect(PORTAL_AFFECTED_AREAS_INCLUDE.orderBy).toEqual({ createdAt: "asc" });
    expect(PORTAL_AFFECTED_AREAS_INCLUDE.select).toEqual({
      id: true,
      roomZoneId: true,
    });
  });
});
