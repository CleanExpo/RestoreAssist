// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SketchSelectionPanel } from "../SketchSelectionPanel";

const CONFIRM = "Confirm homeowner room measurement";

describe("SketchSelectionPanel — homeowner promoted rooms (RA-8241)", () => {
  it("requires on-site measurement before Confirm", () => {
    const onConfirm = vi.fn();
    render(
      <SketchSelectionPanel
        selected={{
          id: "home-1",
          type: "room",
          label: "Kitchen",
          provenance: "underlay_reference",
          captureAdapter: "homeowner",
          areaM2: 12,
        }}
        onConfirmProvenance={onConfirm}
      />,
    );
    expect(
      screen.getByText(/Homeowner self-capture/i),
    ).toBeInTheDocument();
    const button = screen.getByRole("button", { name: CONFIRM });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Measured length (m)"), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText("Measured width (m)"), {
      target: { value: "3" },
    });
    expect(screen.getByText(/On-site area: 12\.00 m²/)).toBeInTheDocument();
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledWith("home-1", {
      lengthM: 4,
      widthM: 3,
    });
  });
});
