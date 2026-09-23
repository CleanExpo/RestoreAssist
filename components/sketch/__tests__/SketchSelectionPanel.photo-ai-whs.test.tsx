// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SketchSelectionPanel } from "../SketchSelectionPanel";

const MATERIALS = [
  { slug: "gyprock", name: "Gyprock (plasterboard)", isPotentialAcm: false },
];

describe("SketchSelectionPanel — photo AI ACM latch (RA-7613)", () => {
  it("raises the WHS strip-out block when photo AI has latched suspected ACM, even on gyprock", () => {
    render(
      <SketchSelectionPanel
        selected={{ id: "el1", type: "room", materialSlug: "gyprock" }}
        materials={MATERIALS}
        propertyYearBuilt={1995}
        aiRaisedAcm
      />,
    );
    expect(screen.getByText(/asbestos/i)).toBeInTheDocument();
    expect(screen.getByText(/strip-?out|blocked/i)).toBeInTheDocument();
  });

  it("keeps the block when a later no-ACM photo result arrives but the latch is still set", () => {
    render(
      <SketchSelectionPanel
        selected={{ id: "el1", type: "room", materialSlug: "gyprock" }}
        materials={MATERIALS}
        propertyYearBuilt={1995}
        aiRaisedAcm
      />,
    );
    expect(screen.queryByText(/pathway recorded|permitted/i)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/WHS pathway/i)).toBeInTheDocument();
  });
});
