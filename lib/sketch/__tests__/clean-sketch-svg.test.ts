import { describe, expect, it } from "vitest";
import { buildCleanSketchSvg } from "@/lib/sketch/clean-sketch-svg";

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
          data: { type: "room", provenance: "field_verified", label: "Kitchen <A>" },
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
