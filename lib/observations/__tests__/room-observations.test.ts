/**
 * RA-7694: the room observation request check (room-observation guard tests).
 */
import { describe, expect, it } from "vitest";
import { checkRoomObservationInput } from "../room-observations";

const ok = (b: unknown) => {
  const r = checkRoomObservationInput(b);
  if (!r.ok) throw new Error(r.message);
  return r.data;
};
const bad = (b: unknown) => {
  const r = checkRoomObservationInput(b);
  if (r.ok) throw new Error("expected a refusal");
  return r.message;
};

describe("room observation input", () => {
  it("accepts an intermittent musty odour and trims text", () => {
    const d = ok({
      kind: "ODOUR",
      roomLabel: "  Bedroom 2 ",
      odourDescriptor: " musty ",
      odourPattern: "INTERMITTENT",
      odourIntensity: 2,
    });
    expect(d).toMatchObject({
      kind: "ODOUR",
      basis: "OBSERVED",
      roomLabel: "Bedroom 2",
      odourDescriptor: "musty",
      odourPattern: "INTERMITTENT",
      odourIntensity: 2,
    });
  });

  it("accepts visible growth with an area, and a hypothesis basis", () => {
    const d = ok({ kind: "VISIBLE_GROWTH", roomLabel: "Hall", areaM2: 2.5, basis: "HYPOTHESISED" });
    expect(d.areaM2).toBe(2.5);
    expect(d.basis).toBe("HYPOTHESISED");
  });

  it("needs a room", () => {
    expect(bad({ kind: "STAINING" })).toMatch(/room/i);
    expect(bad({ kind: "STAINING", roomLabel: "   " })).toMatch(/room/i);
  });

  it("refuses an unknown kind or basis", () => {
    expect(bad({ kind: "MOULD_SPECIES", roomLabel: "x" })).toMatch(/kind/);
    expect(bad({ kind: "STAINING", roomLabel: "x", surface: "wall", basis: "PROVEN" })).toMatch(/basis/);
  });

  it("refuses an intensity outside 1 to 3, or not a whole number", () => {
    for (const n of [0, 4, 1.5, "2", Number.NaN]) {
      expect(bad({ kind: "ODOUR", roomLabel: "x", odourDescriptor: "musty", odourIntensity: n })).toMatch(
        /odourIntensity/,
      );
    }
  });

  it("refuses an area that is negative, huge or not a number", () => {
    for (const a of [-0.1, 10001, "3", Number.POSITIVE_INFINITY]) {
      expect(bad({ kind: "VISIBLE_GROWTH", roomLabel: "x", areaM2: a })).toMatch(/areaM2/);
    }
  });

  it("refuses a field that belongs to another kind", () => {
    expect(bad({ kind: "STAINING", roomLabel: "x", odourPattern: "CONSTANT" })).toMatch(/ODOUR/);
    expect(bad({ kind: "STAINING", roomLabel: "x", areaM2: 1 })).toMatch(/VISIBLE_GROWTH/);
    expect(bad({ kind: "ODOUR", roomLabel: "x", odourDescriptor: "musty", surface: "wall" })).toMatch(/surface/);
  });

  it("refuses an odour record with nothing recorded about the odour", () => {
    expect(bad({ kind: "ODOUR", roomLabel: "x" })).toMatch(/at least one/);
  });

  it("refuses over-long text and a future observation time", () => {
    expect(bad({ kind: "STAINING", roomLabel: "x".repeat(121) })).toMatch(/roomLabel/);
    expect(bad({ kind: "STAINING", roomLabel: "x", detail: "d".repeat(1001) })).toMatch(/detail/);
    const future = new Date(Date.now() + 3600_000).toISOString();
    expect(bad({ kind: "STAINING", roomLabel: "x", surface: "wall", observedAt: future })).toMatch(/future/);
    expect(bad({ kind: "STAINING", roomLabel: "x", surface: "wall", observedAt: "not a date" })).toMatch(/observedAt/);
  });

  it("refuses a time that is not a full ISO 8601 date-time with a zone", () => {
    for (const t of ["2020", "2020-01-01", "2020-01-01T10:00", "01/02/2026 10:00", "Jan 1 2020"]) {
      expect(bad({ kind: "STAINING", roomLabel: "x", surface: "wall", observedAt: t }), t).toMatch(/ISO 8601/);
    }
    for (const t of ["2026-11-20T01:00:00Z", "2026-11-20T11:00:00.123+10:00"]) {
      expect(ok({ kind: "STAINING", roomLabel: "x", surface: "wall", observedAt: t }).observedAt).toBeInstanceOf(Date);
    }
  });

  it("refuses staining or growth with nothing recorded about it", () => {
    expect(bad({ kind: "STAINING", roomLabel: "Hall" })).toMatch(/staining/i);
    expect(bad({ kind: "VISIBLE_GROWTH", roomLabel: "Hall" })).toMatch(/growth/i);
    expect(ok({ kind: "STAINING", roomLabel: "Hall", detail: "brown ring" }).detail).toBe("brown ring");
    expect(ok({ kind: "VISIBLE_GROWTH", roomLabel: "Hall", areaM2: 0 }).areaM2).toBe(0);
  });

  it("refuses a body that is not an object", () => {
    expect(bad(null)).toMatch(/object/);
    expect(bad([])).toMatch(/object/);
    expect(bad("kind")).toMatch(/object/);
  });
});
