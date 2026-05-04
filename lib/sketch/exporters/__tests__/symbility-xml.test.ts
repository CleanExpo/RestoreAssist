import { describe, expect, it } from "vitest";
import {
  DEFAULT_SYMBILITY_PROFILE,
  exportToSymbilityXml,
} from "../symbility-xml";
import { reduce } from "@/lib/sketch/v3/reducer";
import { emptyGraph } from "@/lib/sketch/v3/wall-graph-types";

function rectangleGraph() {
  let g = emptyGraph("f1", 100);
  g = reduce(g, { type: "ADD_CORNER", cornerId: "a", x: 0, y: 0 });
  g = reduce(g, { type: "ADD_CORNER", cornerId: "b", x: 400, y: 0 });
  g = reduce(g, { type: "ADD_CORNER", cornerId: "c", x: 400, y: 300 });
  g = reduce(g, { type: "ADD_CORNER", cornerId: "d", x: 0, y: 300 });
  for (const [id, from, to] of [
    ["w1", "a", "b"],
    ["w2", "b", "c"],
    ["w3", "c", "d"],
    ["w4", "d", "a"],
  ] as const) {
    g = reduce(g, {
      type: "ADD_WALL",
      wallId: id,
      from,
      to,
      isExterior: true,
    });
  }
  g = reduce(g, {
    type: "ADD_OPENING",
    openingId: "o1",
    wallId: "w1",
    openingType: "DOOR",
    positionM: 1,
    widthM: 0.9,
    heightM: 2.04,
  });
  return g;
}

describe("symbility-xml — exportToSymbilityXml", () => {
  it("emits a well-formed XML payload with floor + walls + openings + room", async () => {
    const graph = rectangleGraph();
    const { xml, schemaVersion, contentHash } = await exportToSymbilityXml(
      graph,
      { inspectionId: "insp_1" },
    );

    expect(schemaVersion).toBe(DEFAULT_SYMBILITY_PROFILE.schemaVersion);
    expect(contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain("<Sketch");
    expect(xml).toContain("<Floor index=\"0\"");
    expect(xml).toContain('<Wall id="w1"');
    expect(xml).toContain('<Opening id="o1" wallRef="w1" type="DOOR"');
    expect(xml).toContain("<Room");
    expect(xml).toContain("<Vertex");
  });

  it("is deterministic — same graph produces same contentHash", async () => {
    const a = await exportToSymbilityXml(rectangleGraph(), {
      inspectionId: "x",
      exportedAt: new Date("2026-01-01T00:00:00Z"),
    });
    const b = await exportToSymbilityXml(rectangleGraph(), {
      inspectionId: "x",
      exportedAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect(a.contentHash).toBe(b.contentHash);
  });

  it("escapes XML-unsafe characters in labels", async () => {
    let g = rectangleGraph();
    const roomId = g.floors[0].rooms[0].id;
    g = reduce(g, {
      type: "LABEL_ROOM",
      roomId,
      label: 'Lounge & "Den" <main>',
    });
    const { xml } = await exportToSymbilityXml(g, { inspectionId: "i" });
    expect(xml).toContain("Lounge &amp; &quot;Den&quot; &lt;main&gt;");
    expect(xml).not.toContain('"Den"');
  });

  it("supports a custom profile that renames tags", async () => {
    const { xml } = await exportToSymbilityXml(rectangleGraph(), {
      inspectionId: "i",
      profile: {
        ...DEFAULT_SYMBILITY_PROFILE,
        schemaVersion: "test_v1",
        tags: {
          floor: "Storey",
          wall: "Partition",
          opening: "Aperture",
          room: "Space",
          vertex: "Pt",
        },
      },
    });
    expect(xml).toContain("<Storey ");
    expect(xml).toContain("<Partition ");
    expect(xml).toContain("<Aperture ");
    expect(xml).toContain("<Space ");
    expect(xml).toContain("<Pt ");
  });
});
