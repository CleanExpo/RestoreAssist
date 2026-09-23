// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  SketchSelectionPanel,
  type MaterialOption,
} from "../SketchSelectionPanel";

const MATERIALS: MaterialOption[] = [
  { slug: "gyprock", name: "Gyprock (plasterboard)", isPotentialAcm: false },
];

const NOTICE =
  "This room lost its details on an earlier save. Re-enter its name, material and water category.";

describe("SketchSelectionPanel — details lost (RA-7655)", () => {
  it("shows the lost-details notice and hides it after a label edit", () => {
    const onLabelChange = vi.fn();
    render(
      <SketchSelectionPanel
        selected={{ id: "room-1", type: "room", detailsLost: true }}
        materials={MATERIALS}
        onLabelChange={onLabelChange}
      />,
    );
    expect(screen.getByText(NOTICE)).toBeInTheDocument();

    const input = screen.getByPlaceholderText("Room name…");
    fireEvent.change(input, { target: { value: "Kitchen" } });
    fireEvent.blur(input);

    expect(onLabelChange).toHaveBeenCalledWith("room-1", "Kitchen");
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it("does not show the notice on a normal room", () => {
    render(
      <SketchSelectionPanel
        selected={{ id: "room-ok", type: "room", label: "Living" }}
      />,
    );
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });
});
