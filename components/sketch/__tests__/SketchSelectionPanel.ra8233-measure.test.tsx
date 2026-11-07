// @vitest-environment jsdom
/**
 * RA-8233 — Confirm on an AI-suggested room needs an on-site measurement.
 * The panel uses the same helpers as the sketch POST route, so what the
 * button allows and what the server records agree.
 */
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SketchSelectionPanel } from "../SketchSelectionPanel";

const CONFIRM = "Confirm AI-suggested measurement";

function renderAiRoom(areaM2: number, onConfirm = vi.fn()) {
  render(
    <SketchSelectionPanel
      selected={{
        id: "ai-suggested-1",
        type: "room",
        label: "Lounge",
        provenance: "ai_suggested",
        captureAdapter: "cloud_ai",
        areaM2,
        lengthM: 3,
        widthM: 3,
      }}
      onConfirmProvenance={onConfirm}
    />,
  );
  return onConfirm;
}

describe("SketchSelectionPanel — RA-8233 measurement before Confirm", () => {
  it("Confirm is disabled and does nothing until a measurement is entered", () => {
    const onConfirm = renderAiRoom(9);
    const button = screen.getByRole("button", { name: CONFIRM });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("square 9 m2: a 3 m x 3 m measurement enables Confirm and is passed on", () => {
    const onConfirm = renderAiRoom(9);
    fireEvent.change(screen.getByLabelText("Measured length (m)"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("Measured width (m)"), {
      target: { value: "3" },
    });
    const button = screen.getByRole("button", { name: CONFIRM });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledWith("ai-suggested-1", {
      lengthM: 3,
      widthM: 3,
    });
  });

  it("L-room 12 m2: a measured floor area enables Confirm", () => {
    const onConfirm = renderAiRoom(12);
    fireEvent.change(
      screen.getByLabelText("Or measured floor area (m²), for irregular rooms"),
      { target: { value: "12" } },
    );
    fireEvent.click(screen.getByRole("button", { name: CONFIRM }));
    expect(onConfirm).toHaveBeenCalledWith("ai-suggested-1", {
      measuredAreaM2: 12,
    });
  });

  it("a measurement that disagrees with the drawn area keeps Confirm disabled", () => {
    const onConfirm = renderAiRoom(9);
    fireEvent.change(screen.getByLabelText("Measured length (m)"), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText("Measured width (m)"), {
      target: { value: "4" },
    });
    expect(screen.getByRole("button", { name: CONFIRM })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "does not match the drawn room",
    );
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
