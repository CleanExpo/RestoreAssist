import { describe, it, expect } from "vitest";
import {
  MAX_PORTAL_AFFECTED_AREAS,
  PORTAL_AFFECTED_AREAS_INCLUDE,
  toPortalAffectedAreaItems,
} from "../portal-affected-areas";
import { portalMustShowEveryAffectedArea } from "./portal-affected-areas-bar";

describe("toPortalAffectedAreaItems (RA-7573)", () => {
  it("keeps one item per named area, in query order", () => {
    const rows = [
      { id: "a1", roomZoneId: "Kitchen" },
      { id: "a2", roomZoneId: "Hallway" },
    ];
    const items = toPortalAffectedAreaItems(rows);
    expect(items).toEqual([
      { id: "a1", label: "Kitchen" },
      { id: "a2", label: "Hallway" },
    ]);
    portalMustShowEveryAffectedArea({
      dbCount: rows.length,
      renderedCount: items.length,
      headingShown: items.length > 0,
    });
  });

  it("returns empty when the job has no areas", () => {
    const items = toPortalAffectedAreaItems([]);
    expect(items).toEqual([]);
    portalMustShowEveryAffectedArea({
      dbCount: 0,
      renderedCount: items.length,
      headingShown: false,
    });
  });

  it("keeps a blank roomZoneId row instead of silently omitting it", () => {
    const rows = [
      { id: "a1", roomZoneId: "   " },
      { id: "a2", roomZoneId: null },
      { id: "a3", roomZoneId: "Laundry" },
    ];
    const items = toPortalAffectedAreaItems(rows);
    expect(items).toEqual([
      { id: "a1", label: "" },
      { id: "a2", label: "" },
      { id: "a3", label: "Laundry" },
    ]);
    expect(items.some((item) => /kitchen|area 1|room/i.test(item.label))).toBe(
      false,
    );
    portalMustShowEveryAffectedArea({
      dbCount: rows.length,
      renderedCount: items.length,
      headingShown: items.length > 0,
    });
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
