import { describe, expect, it } from "vitest";
import { buildCleanSketchSvg } from "@/lib/sketch/clean-sketch-svg";

const square = (x: number) => [
  { x, y: 10 },
  { x: x + 200, y: 10 },
  { x: x + 200, y: 210 },
  { x, y: 210 },
];

function svgOf(objects: unknown[]) {
  return buildCleanSketchSvg({ canvasWidth: 900, canvasHeight: 600, objects }).toString("utf8");
}

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe("server clean sketch SVG", () => {
  it("contains verified geometry but no reference pixels or reference geometry", () => {
    const svg = buildCleanSketchSvg({
      canvasWidth: 900,
      canvasHeight: 600,
      backgroundImage: { src: "https://listing.test/source-plan.png" },
      objects: [
        {
          type: "polygon",
          points: [
            { x: 10, y: 10 },
            { x: 300, y: 10 },
            { x: 300, y: 200 },
          ],
          data: { type: "room", provenance: "operator_measured", label: "Kitchen <A>" },
        },
        {
          type: "rect",
          left: 50,
          top: 50,
          width: 100,
          height: 100,
          data: { type: "room", provenance: "underlay_reference", label: "SOURCE" },
        },
      ],
    }).toString("utf8");

    expect(svg).toContain("Kitchen &lt;A&gt;");
    expect(svg).not.toContain("source-plan.png");
    expect(svg).not.toContain("SOURCE");
    expect(svg).not.toContain("backgroundImage");
  });
});

describe("RA-8239 the clean render prints measured geometry only", () => {
  it("leaves out an unconfirmed AI suggestion", () => {
    const svg = svgOf([
      { type: "polygon", points: square(10), data: { type: "room", provenance: "operator_measured", label: "Lounge" } },
      { type: "polygon", points: square(300), data: { type: "room", provenance: "ai_suggested", label: "Suggested Bed 2" } },
    ]);
    expect(svg).toContain("Lounge");
    expect(svg).not.toContain("Suggested Bed 2");
    expect(count(svg, "<polygon")).toBe(1);
  });

  it("leaves out an unknown provenance tag, as billing does", () => {
    const svg = svgOf([
      { type: "polygon", points: square(10), data: { type: "room", provenance: "cloud_ai", label: "Cloud room" } },
    ]);
    expect(svg).not.toContain("Cloud room");
    expect(svg).not.toContain("<polygon");
  });

  it("keeps legacy untagged geometry, which billed as technician-drawn", () => {
    const svg = svgOf([
      { type: "polygon", points: square(10), data: { type: "room", label: "Old laundry" } },
      { type: "line", x1: 0, y1: 0, x2: 100, y2: 0, data: { type: "wall" } },
    ]);
    expect(svg).toContain("Old laundry");
    expect(svg).toContain("<polygon");
  });

  it("prints a room's name once when its group also holds the name as text", () => {
    const svg = svgOf([
      {
        type: "group",
        originX: "center",
        originY: "center",
        left: 200,
        top: 150,
        width: 200,
        height: 200,
        data: { type: "room", provenance: "operator_measured", label: "Kitchen" },
        objects: [
          { type: "rect", originX: "center", originY: "center", left: 0, top: 0, width: 200, height: 200 },
          { type: "text", originX: "center", originY: "center", left: 0, top: 0, width: 60, height: 16, text: "Kitchen" },
        ],
      },
    ]);
    expect(count(svg, ">Kitchen<")).toBe(1);
  });
});
