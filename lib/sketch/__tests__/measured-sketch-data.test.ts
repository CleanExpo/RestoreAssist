/**
 * RA-6761 — the provenance guard at the Fabric-blob boundary must keep
 * AI/underlay-imported geometry out of billed quantities. Proven both at the
 * pure-filter level and end-to-end through the estimate extractor.
 */
import { describe, expect, it } from "vitest";
import {
  measuredSketchData,
  measuredFloors,
  serverAuthoritativeFloors,
} from "../measured-sketch-data";
import { extractSketchEstimate } from "@/lib/sketch-estimate-extractor";
import { extractRooms } from "@/lib/sketch/extract-rooms";

const rect = (w: number, h: number) => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];

describe("measuredSketchData", () => {
  it("drops underlay_reference objects, keeps operator_measured + untagged", () => {
    const blob = {
      objects: [
        {
          type: "polygon",
          data: { type: "room", provenance: "operator_measured" },
        },
        {
          type: "polygon",
          data: { type: "room", provenance: "underlay_reference" },
        },
        { type: "polygon", data: { type: "room" } }, // untagged → technician-drawn
      ],
    };
    const out = measuredSketchData(blob);
    expect(out.objects).toHaveLength(2);
    expect(
      out.objects.some((o) => o.data?.provenance === "underlay_reference"),
    ).toBe(false);
  });

  it("is null/shape safe", () => {
    expect(measuredSketchData(null)).toBeNull();
    expect(measuredSketchData(undefined)).toBeUndefined();
    expect(measuredSketchData({ scaleConfig: {} })).toEqual({
      scaleConfig: {},
    });
  });

  it("does not mutate the input", () => {
    const blob = {
      objects: [{ data: { provenance: "underlay_reference" } }],
    };
    measuredSketchData(blob);
    expect(blob.objects).toHaveLength(1); // original untouched
  });
});

describe("estimate extractor honours the provenance guard", () => {
  const floors = (sketchData: unknown) =>
    [
      {
        floorLabel: "Ground Floor",
        sketchData,
        equipmentPoints: null,
        moisturePoints: null,
      },
    ] as unknown as Parameters<typeof extractSketchEstimate>[0];

  const raw = {
    objects: [
      // technician-measured room: 300×400 px = 12 m² @ 100px/m
      {
        type: "polygon",
        points: rect(300, 400),
        data: { type: "room", label: "Living" },
      },
      // AI-imported room: 1000×1000 px = 100 m² — must NOT count
      {
        type: "polygon",
        points: rect(1000, 1000),
        data: {
          type: "room",
          label: "AI Room",
          provenance: "underlay_reference",
        },
      },
    ],
  };

  const areaItems = (e: ReturnType<typeof extractSketchEstimate>) =>
    e.lineItems.filter((li) => typeof li.areaM2 === "number");

  it("self-filters the imported room even on a RAW blob (RA-6839 — filter is inside the extractor)", () => {
    const guarded = areaItems(extractSketchEstimate(floors(raw)));
    expect(guarded).toHaveLength(1);
    expect(guarded[0].areaM2).toBeCloseTo(12, 1);
  });

  it("excludes the imported room once the guard is applied", () => {
    const guarded = areaItems(
      extractSketchEstimate(floors(measuredSketchData(raw))),
    );
    expect(guarded).toHaveLength(1);
    // only the 12 m² measured room survives — the 100 m² import is gone
    expect(guarded[0].areaM2).toBeCloseTo(12, 1);
  });
});

describe("measuredFloors — PDF/scope export guard (RA-6761 pt 2)", () => {
  const objects = [
    // technician room 300×400 px = 12 m²
    { type: "polygon", points: rect(300, 400), data: { label: "Living" } },
    // AI-imported room 1000×1000 px = 100 m² — must NOT count
    {
      type: "polygon",
      points: rect(1000, 1000),
      data: { label: "AI", provenance: "underlay_reference" },
    },
  ];

  it("extractRooms self-filters imported rooms on a RAW blob (RA-6839 — filter is inside the extractor)", () => {
    expect(extractRooms({ objects })).toHaveLength(1);
  });

  it("excludes imported rooms from generator area extraction", () => {
    const [f] = measuredFloors([
      {
        label: "GF",
        pngDataUrl: "data:image/png;base64,xx",
        fabricJson: { objects },
      },
    ]);
    const rooms = extractRooms(f.fabricJson);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].areaM2).toBeCloseTo(12, 1);
  });

  it("preserves non-geometry fields and tolerates a missing fabricJson", () => {
    const [withPng] = measuredFloors([
      {
        label: "GF",
        pngDataUrl: "data:image/png;base64,xx",
        fabricJson: { objects },
      },
    ]);
    expect(withPng.label).toBe("GF");
    expect(withPng.pngDataUrl).toBe("data:image/png;base64,xx");

    const [noJson] = measuredFloors([{ label: "Bare" }]);
    expect(noJson).toEqual({ label: "Bare" }); // untouched
  });
});

describe("serverAuthoritativeFloors — server-authoritative exports (RA-6761)", () => {
  const room = (label: string, w: number, h: number, prov?: string) => ({
    type: "polygon",
    points: rect(w, h),
    data: { label, ...(prov ? { provenance: prov } : {}) },
  });

  it("uses saved server geometry over client fabricJson (client can't inflate areas)", () => {
    // Client claims a 100 m² room; the saved sketch has the real 12 m² one.
    const client = [
      {
        label: "GF",
        pngDataUrl: "p",
        fabricJson: { objects: [room("Fake", 1000, 1000)] },
      },
    ];
    const server = [
      { floorLabel: "GF", sketchData: { objects: [room("Real", 300, 400)] } },
    ];
    const [f] = serverAuthoritativeFloors(client, server);
    const rooms = extractRooms(f.fabricJson);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].areaM2).toBeCloseTo(12, 1); // server's 12, not client's 100
    expect(f.pngDataUrl).toBe("p"); // visual preserved
  });

  it("strips underlay_reference from the server geometry too", () => {
    const server = [
      {
        floorLabel: "GF",
        sketchData: {
          objects: [
            room("M", 300, 400),
            room("AI", 1000, 1000, "underlay_reference"),
          ],
        },
      },
    ];
    const [f] = serverAuthoritativeFloors(
      [{ label: "GF", fabricJson: { objects: [] } }],
      server,
    );
    expect(extractRooms(f.fabricJson)).toHaveLength(1);
  });

  it("falls back to sanitized client geometry when no saved floor matches", () => {
    const client = [
      {
        label: "Unsaved",
        fabricJson: {
          objects: [
            room("M", 300, 400),
            room("AI", 1000, 1000, "underlay_reference"),
          ],
        },
      },
    ];
    const [f] = serverAuthoritativeFloors(client, []); // nothing saved
    const rooms = extractRooms(f.fabricJson);
    expect(rooms).toHaveLength(1); // client geometry used, but import stripped
    expect(rooms[0].areaM2).toBeCloseTo(12, 1);
  });

  it("leaves a floor untouched when neither server nor client has geometry", () => {
    const [f] = serverAuthoritativeFloors(
      [{ label: "X", pngDataUrl: "p" }],
      [],
    );
    expect(f).toEqual({ label: "X", pngDataUrl: "p" });
  });
});
