import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { stableStringify } from "@/lib/sketch/roomplan-custody-queue";

vi.mock("@/lib/storage/sign-stored-url", () => ({
  signStoredMediaUrl: vi.fn(async (url: string) =>
    url.replace(/^storage:\/\//, "https://"),
  ),
  parseSupabaseStorageUrl: vi.fn((url: string) => {
    const match = url.match(/^storage:\/\/([^/]+)\/(.+)$/);
    return match ? { bucket: match[1], path: match[2] } : null;
  }),
}));
import {
  claimSketchesToFloors,
  expandFloorsWithRoomMoisture,
} from "../claim-sketch-floors";
import type { SketchFloor } from "@/lib/generate-sketch-pdf";

/** Minimal stand-in PNG bytes — content is irrelevant to the mapper. */
function pngBytes(marker: number): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, marker]);
}

const canonicalRender = (floor: number, hash = "a".repeat(64)) =>
  `storage://sketch-media/inspections/i1/exports/verified/floor-${floor}-${hash}.png`;

/** Fake fetch keyed by URL. A "fail" value yields a non-ok response. */
function fakeFetch(map: Record<string, Uint8Array | "fail">) {
  return vi.fn(async (url: string) => {
    const storageUrl = url.replace(/^https:\/\//, "storage://");
    const v = map[storageUrl];
    if (!v || v === "fail") {
      return new Response(null, { status: 404 });
    }
    return new Response(v, {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  });
}

describe("expandFloorsWithRoomMoisture", () => {
  it("appends a room moisture companion page when crop meta is present", () => {
    const floor: SketchFloor = {
      label: "Ground",
      pngDataUrl: "data:image/png;base64,xx",
      moisturePins: [
        {
          nx: 0.25,
          ny: 0.25,
          wme: 18,
          iicrClass: 2,
          color: "#f59e0b",
        },
        {
          nx: 0.9,
          ny: 0.9,
          wme: 40,
          iicrClass: 4,
          color: "#ef4444",
        },
      ],
      roomMoistureCrop: {
        roomId: "r1",
        crop: {
          left: 100,
          top: 100,
          width: 200,
          height: 150,
          roomId: "r1",
          label: "Living",
        },
        roomPoints: [
          { x: 100, y: 100 },
          { x: 300, y: 100 },
          { x: 300, y: 250 },
          { x: 100, y: 250 },
        ],
        canvasWidth: 800,
        canvasHeight: 600,
      },
    };
    const expanded = expandFloorsWithRoomMoisture([floor]);
    expect(expanded).toHaveLength(2);
    expect(expanded[1].label).toBe("Room moisture — Living");
    expect(expanded[1].isRoomMoisturePage).toBe(true);
    expect(expanded[1].moisturePins).toHaveLength(1);
    expect(expanded[1].moisturePins![0].wme).toBe(18);
  });
});

describe("claimSketchesToFloors", () => {
  it("maps rendered sketches to floors as data URLs, sorted by floorNumber", async () => {
    const sketches = [
      {
        floorNumber: 2,
        floorLabel: "Level 1",
        renderedPngUrl: canonicalRender(2),
        sketchData: { a: 1 },
      },
      {
        floorNumber: 0,
        floorLabel: "Ground Floor",
        renderedPngUrl: canonicalRender(0),
        sketchData: { b: 2 },
      },
    ];
    const fetchImpl = fakeFetch({
      [canonicalRender(2)]: pngBytes(2),
      [canonicalRender(0)]: pngBytes(0),
    });

    const floors = await claimSketchesToFloors(sketches, fetchImpl as never);

    expect(floors.map((f) => f.label)).toEqual(["Ground Floor", "Level 1"]);
    expect(floors[0].pngDataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(floors[0].fabricJson).toEqual({ b: 2 });
  });

  it("skips sketches without a renderedPngUrl", async () => {
    const sketches = [
      {
        floorNumber: 0,
        floorLabel: "Ground Floor",
        renderedPngUrl: null,
        sketchData: null,
      },
      {
        floorNumber: 1,
        floorLabel: "Level 1",
        renderedPngUrl: canonicalRender(1),
        sketchData: null,
      },
    ];
    const fetchImpl = fakeFetch({
      [canonicalRender(1)]: pngBytes(1),
    });

    const floors = await claimSketchesToFloors(sketches, fetchImpl as never);

    expect(floors).toHaveLength(1);
    expect(floors[0].label).toBe("Level 1");
    expect(floors[0].fabricJson).toBeNull();
  });

  it("skips a floor whose image fetch fails, keeps the rest", async () => {
    const sketches = [
      {
        floorNumber: 0,
        floorLabel: "Ground Floor",
        renderedPngUrl: canonicalRender(0),
        sketchData: null,
      },
      {
        floorNumber: 1,
        floorLabel: "Level 1",
        renderedPngUrl: canonicalRender(1, "b".repeat(64)),
        sketchData: null,
      },
    ];
    const fetchImpl = fakeFetch({
      [canonicalRender(0)]: pngBytes(0),
      [canonicalRender(1, "b".repeat(64))]: "fail",
    });

    const floors = await claimSketchesToFloors(sketches, fetchImpl as never);

    expect(floors.map((f) => f.label)).toEqual(["Ground Floor"]);
  });

  it("returns [] for empty input", async () => {
    const floors = await claimSketchesToFloors([], fakeFetch({}) as never);
    expect(floors).toEqual([]);
  });

  // RA-120 §3 — the moisture overlay pins must ride the same rail as the
  // structural sketch so the moisture map reaches the report PDF.
  it("parses moisturePoints into typed pins on the floor", async () => {
    const sketches = [
      {
        floorNumber: 0,
        floorLabel: "Ground Floor",
        renderedPngUrl: canonicalRender(0),
        sketchData: null,
        moisturePoints: [
          { nx: 0.5, ny: 0.5, wme: 20 },
          { x: 10, y: 10, wme: 18 }, // legacy, no nx/ny — skipped
        ],
      },
    ];
    const fetchImpl = fakeFetch({
      [canonicalRender(0)]: pngBytes(0),
    });

    const floors = await claimSketchesToFloors(sketches, fetchImpl as never);

    expect(floors[0].moisturePins).toHaveLength(1);
    expect(floors[0].moisturePins?.[0]).toMatchObject({
      nx: 0.5,
      ny: 0.5,
      wme: 20,
      iicrClass: 2,
    });
  });

  it("yields an empty pin array when moisturePoints is absent", async () => {
    const sketches = [
      {
        floorNumber: 0,
        floorLabel: "Ground Floor",
        renderedPngUrl: canonicalRender(0),
        sketchData: null,
      },
    ];
    const fetchImpl = fakeFetch({
      [canonicalRender(0)]: pngBytes(0),
    });

    const floors = await claimSketchesToFloors(sketches, fetchImpl as never);

    expect(floors[0].moisturePins).toEqual([]);
  });

  it("carries normalized evidence-photo pins into the report floor", async () => {
    const sketches = [
      {
        floorNumber: 0,
        floorLabel: "Ground Floor",
        renderedPngUrl: canonicalRender(0),
        sketchData: null,
        evidencePins: [
          {
            id: "pin-1",
            inspectionPhotoId: "photo-1",
            nx: 0.25,
            ny: 0.75,
            caption: "Kitchen leak",
          },
        ],
      },
    ];
    const fetchImpl = fakeFetch({
      [canonicalRender(0)]: pngBytes(0),
    });

    const floors = await claimSketchesToFloors(sketches, fetchImpl as never);

    expect(floors[0].evidencePins).toEqual([
      {
        label: "E1",
        nx: 0.25,
        ny: 0.75,
        caption: "Kitchen leak",
        inspectionPhotoId: "photo-1",
      },
    ]);
  });

  it("requires a verified underlay receipt bound to the exact immutable render", async () => {
    const renderSha256 = "c".repeat(64);
    const sketchSha256 =
      "74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b";
    const storagePath = `inspections/i1/exports/verified/floor-0-${renderSha256}.png`;
    const renderedPngUrl = `storage://sketch-media/${storagePath}`;
    const fetchImpl = fakeFetch({ [renderedPngUrl]: pngBytes(0) });
    const base = {
      floorNumber: 0,
      floorLabel: "Ground Floor",
      renderedPngUrl,
      sketchData: null,
    };

    await expect(
      claimSketchesToFloors(
        [
          {
            ...base,
            underlayReferences: [
              { verifiedAt: new Date(), verificationJson: { storagePath: "wrong" } },
            ],
          },
        ],
        fetchImpl as never,
      ),
    ).resolves.toEqual([]);

    const floors = await claimSketchesToFloors(
      [
        {
          ...base,
          underlayReferences: [
            {
              verifiedAt: new Date(),
              verificationJson: { storagePath, renderSha256, sketchSha256 },
            },
          ],
        },
      ],
      fetchImpl as never,
    );
    expect(floors).toHaveLength(1);
  });

  it("blocks a recreated sketch when the inspection-floor custody history is unverified", async () => {
    const renderedPngUrl = canonicalRender(0);
    const floors = await claimSketchesToFloors(
      [
        {
          floorNumber: 0,
          floorLabel: "Recreated Ground Floor",
          renderedPngUrl,
          sketchData: { objects: [] },
          underlayReferences: [],
          inspection: {
            sketchUnderlayReferences: [
              {
                floorNumber: 0,
                verifiedAt: null,
                verificationJson: null,
              },
            ],
          },
        },
      ],
      fakeFetch({ [renderedPngUrl]: pngBytes(0) }) as never,
    );
    expect(floors).toEqual([]);
  });

  it("uses canonical JSON hashing across JSONB key reordering", async () => {
    const renderSha256 = "d".repeat(64);
    const storagePath = `inspections/i1/exports/verified/floor-0-${renderSha256}.png`;
    const renderedPngUrl = `storage://sketch-media/${storagePath}`;
    const sketchData = { nested: { a: 1, z: 2 }, first: true };
    const sketchSha256 = createHash("sha256")
      .update(stableStringify({ first: true, nested: { z: 2, a: 1 } }))
      .digest("hex");
    const floors = await claimSketchesToFloors(
      [
        {
          floorNumber: 0,
          floorLabel: "Ground Floor",
          renderedPngUrl,
          sketchData,
          inspection: {
            sketchUnderlayReferences: [
              {
                floorNumber: 0,
                verifiedAt: new Date(),
                verificationJson: {
                  storagePath,
                  renderSha256,
                  sketchSha256,
                },
              },
            ],
          },
        },
      ],
      fakeFetch({ [renderedPngUrl]: pngBytes(0) }) as never,
    );
    expect(floors).toHaveLength(1);
  });
});
