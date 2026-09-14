import { describe, expect, it } from "vitest";
import { standardCite } from "@/lib/nir-standards-mapping";
import {
  DAMAGE_MARKER_LIBRARY,
  DAMAGE_MARKER_TYPES,
  createDamageMarker,
  damageMarkerAriaLabel,
  damageMarkerCaption,
  damageMarkerFill,
  extractDamageMarkerLegend,
  isDamageMarkerType,
  parseDamageMarker,
  parseDamageMarkers,
} from "../damage-markers";

describe("DAMAGE_MARKER_LIBRARY", () => {
  it("exposes the seven S500/S520/S700 selectable types", () => {
    expect(DAMAGE_MARKER_TYPES).toEqual([
      "water_cat1",
      "water_cat2",
      "water_cat3",
      "fire",
      "smoke",
      "mould",
      "structural",
    ]);
    expect(DAMAGE_MARKER_LIBRARY).toHaveLength(7);
    expect(new Set(DAMAGE_MARKER_LIBRARY.map((e) => e.type)).size).toBe(7);
  });

  it("cites editions from standardCite — not hand-typed years", () => {
    const water = DAMAGE_MARKER_LIBRARY.filter((e) => e.group === "water");
    expect(water).toHaveLength(3);
    for (const entry of water) {
      expect(entry.citation).toBe(standardCite("S500", "10.4.1"));
    }
    expect(DAMAGE_MARKER_LIBRARY.find((e) => e.type === "mould")?.citation).toBe(
      standardCite("S520", "6"),
    );
    expect(DAMAGE_MARKER_LIBRARY.find((e) => e.type === "fire")?.citation).toBe(
      standardCite("S700", "6"),
    );
    expect(DAMAGE_MARKER_LIBRARY.find((e) => e.type === "smoke")?.citation).toBe(
      standardCite("S700", "6"),
    );
  });

  it("colour-codes water cats distinctly (Cat 1 blue, Cat 2 amber, Cat 3 red)", () => {
    const [c1, c2, c3] = ["water_cat1", "water_cat2", "water_cat3"].map(
      (t) => DAMAGE_MARKER_LIBRARY.find((e) => e.type === t)!,
    );
    expect(c1.fill).not.toBe(c2.fill);
    expect(c2.fill).not.toBe(c3.fill);
    expect(c1.fill).toBe("#2563EB");
    expect(c2.fill).toBe("#D97706");
    expect(c3.fill).toBe("#B91C1C");
  });

  it("ships an SVG path for every library icon", () => {
    for (const entry of DAMAGE_MARKER_LIBRARY) {
      expect(entry.iconPath.length, `${entry.type} icon`).toBeGreaterThan(10);
      expect(entry.short.length).toBeGreaterThan(0);
    }
  });
});

describe("createDamageMarker / parseDamageMarkers", () => {
  it("stamps type, severity, room_label, dimension_m2, notes and nx/ny", () => {
    const marker = createDamageMarker({
      type: "water_cat3",
      severity: "high",
      room_label: "Kitchen",
      dimension_m2: 4.5,
      notes: "Black water at the sink",
      x: 150,
      y: 200,
      width: 400,
      height: 500,
    });
    expect(marker.type).toBe("water_cat3");
    expect(marker.severity).toBe("high");
    expect(marker.room_label).toBe("Kitchen");
    expect(marker.dimension_m2).toBe(4.5);
    expect(marker.notes).toBe("Black water at the sink");
    expect(marker.nx).toBeCloseTo(150 / 400);
    expect(marker.ny).toBeCloseTo(200 / 500);
    expect(marker.id.startsWith("dm-")).toBe(true);
  });

  it("round-trips through parse and rejects junk (no silent accept)", () => {
    const good = createDamageMarker({
      type: "mould",
      room_label: "Ensuite",
      x: 10,
      y: 20,
      width: 100,
      height: 100,
    });
    expect(parseDamageMarker(good)).toMatchObject({
      type: "mould",
      room_label: "Ensuite",
      x: 10,
      y: 20,
    });
    expect(parseDamageMarker(null)).toBeNull();
    expect(parseDamageMarker({ type: "water_cat1" })).toBeNull();
    expect(parseDamageMarker({ type: "lava", severity: "high", x: 1, y: 1 })).toBeNull();
    expect(parseDamageMarkers([good, { type: "nope" }, null])).toHaveLength(1);
  });

  it("accepts roomLabel / dimensionM2 aliases from older payloads", () => {
    const parsed = parseDamageMarker({
      id: "dm-1",
      type: "fire",
      severity: "severe",
      roomLabel: "Lounge",
      dimensionM2: 12,
      x: 1,
      y: 2,
      nx: 0.2,
      ny: 0.3,
    });
    expect(parsed).toMatchObject({
      room_label: "Lounge",
      dimension_m2: 12,
      nx: 0.2,
      ny: 0.3,
    });
  });
});

describe("labels and legend", () => {
  it("builds an aria label and caption from the required fields", () => {
    const marker = createDamageMarker({
      type: "water_cat2",
      severity: "moderate",
      room_label: "Laundry",
      dimension_m2: 2,
      notes: "Washer overflow",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    expect(damageMarkerAriaLabel(marker)).toMatch(/Water Cat 2/);
    expect(damageMarkerAriaLabel(marker)).toMatch(/Laundry/);
    expect(damageMarkerAriaLabel(marker)).toMatch(/2 m²/);
    expect(damageMarkerCaption(marker)).toBe("C2 Laundry");
  });

  it("lists unique types in library order for the report legend", () => {
    const markers = [
      createDamageMarker({
        type: "structural",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      }),
      createDamageMarker({
        type: "water_cat1",
        x: 1,
        y: 1,
        width: 10,
        height: 10,
      }),
      createDamageMarker({
        type: "water_cat1",
        x: 2,
        y: 2,
        width: 10,
        height: 10,
      }),
    ];
    const legend = extractDamageMarkerLegend(markers);
    expect(legend.map((e) => e.type)).toEqual(["water_cat1", "structural"]);
    expect(legend[0].citation).toBe(standardCite("S500", "10.4.1"));
  });

  it("severity shifts fill away from the library base colour", () => {
    const base = damageMarkerFill("water_cat3", "moderate");
    expect(damageMarkerFill("water_cat3", "low")).not.toBe(base);
    expect(damageMarkerFill("water_cat3", "severe")).not.toBe(base);
  });
});

describe("guards", () => {
  it("isDamageMarkerType is exhaustive for the library and closed to extras", () => {
    expect(isDamageMarkerType("water_cat1")).toBe(true);
    expect(isDamageMarkerType("biohazard")).toBe(false);
    expect(isDamageMarkerType("")).toBe(false);
  });
});
