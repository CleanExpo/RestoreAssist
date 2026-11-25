/**
 * Mining pilot slice 6: the paging and "change only the version you saw" helpers.
 */
import { describe, expect, it } from "vitest";
import {
  PAGE_SIZE,
  recordCursor,
  recordCursorWhere,
  splitPage,
  staffCursorWhere,
} from "@/lib/training/paging";
import { parseExpectedVersion, versionWhere } from "@/lib/training/version";

describe("record cursor", () => {
  it("round-trips: the cursor of a row selects the rows after it in register order", () => {
    const row = { id: "cabc123", completedOn: new Date("2026-10-01T00:00:00.000Z") };
    const cursor = recordCursor(row);
    expect(cursor).toBe("2026-10-01_cabc123");
    expect(recordCursorWhere(cursor)).toEqual({
      OR: [
        { completedOn: { lt: row.completedOn } },
        { completedOn: row.completedOn, id: { gt: "cabc123" } },
      ],
    });
  });

  it("no cursor means the first page; a malformed one is refused (null)", () => {
    expect(recordCursorWhere(null)).toBeUndefined();
    expect(recordCursorWhere("")).toBeUndefined();
    for (const bad of ["garbage", "2026-13-01_x", "2026-10-01_", "2026-10-1_x", `2026-10-01_${"x".repeat(65)}`]) {
      expect(recordCursorWhere(bad)).toBeNull();
    }
  });
});

describe("staff cursor", () => {
  it("narrows to ids after the cursor, and refuses an oversized one", () => {
    expect(staffCursorWhere(null)).toBeUndefined();
    expect(staffCursorWhere("u1")).toEqual({ id: { gt: "u1" } });
    expect(staffCursorWhere("x".repeat(65))).toBeNull();
  });
});

describe("splitPage", () => {
  it("a short read is the last page; a read of PAGE_SIZE + 1 gives a cursor at the last row shown", () => {
    const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => ({ id: `r${i}` }));
    expect(splitPage(rows.slice(0, PAGE_SIZE), (r) => r.id).nextCursor).toBeNull();
    const { page, nextCursor } = splitPage(rows, (r) => r.id);
    expect(page).toHaveLength(PAGE_SIZE);
    expect(nextCursor).toBe(`r${PAGE_SIZE - 1}`);
  });
});

describe("expected version", () => {
  it("accepts the ISO timestamp the API hands out, and nothing else", () => {
    expect(parseExpectedVersion("2026-11-01T00:00:00.123Z")?.toISOString()).toBe(
      "2026-11-01T00:00:00.123Z",
    );
    for (const bad of [undefined, null, 1, "", "yesterday", "2026-11-01", "2026-11-01T00:00:00+10:00"]) {
      expect(parseExpectedVersion(bad)).toBeNull();
    }
  });

  it("matches the one millisecond the client saw (Postgres keeps microseconds)", () => {
    const v = new Date("2026-11-01T00:00:00.123Z");
    expect(versionWhere(v)).toEqual({
      updatedAt: { gte: v, lt: new Date("2026-11-01T00:00:00.124Z") },
    });
  });
});
