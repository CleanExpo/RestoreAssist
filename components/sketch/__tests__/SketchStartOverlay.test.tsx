// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { SketchStartOverlay } from "../SketchStartOverlay";

const prepareUnderlayFile = vi.fn();
const commitUnderlayImport = vi.fn();

vi.mock("@/lib/sketch/prepare-underlay-file", () => ({
  prepareUnderlayFile: (...args: unknown[]) => prepareUnderlayFile(...args),
}));

vi.mock("@/lib/sketch/commit-underlay-import", () => ({
  commitUnderlayImport: (...args: unknown[]) => commitUnderlayImport(...args),
}));

describe("SketchStartOverlay", () => {
  beforeEach(() => {
    prepareUnderlayFile.mockReset();
    commitUnderlayImport.mockReset();
  });

  it("offers upload and draw-from-scratch as the two primary paths", () => {
    render(
      <SketchStartOverlay
        visible
        onStartBlank={vi.fn()}
        onPlaceMoisture={vi.fn()}
        onApplyUnderlay={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /choose image or pdf/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /start drawing/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/cloudinary/i)).not.toBeInTheDocument();
  });

  it("starts a blank canvas from the draw card", () => {
    const onStartBlank = vi.fn();
    render(
      <SketchStartOverlay
        visible
        onStartBlank={onStartBlank}
        onPlaceMoisture={vi.fn()}
        onApplyUnderlay={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /start drawing/i }));
    expect(onStartBlank).toHaveBeenCalledOnce();
  });

  it("reviews an uploaded plan before placing it", async () => {
    prepareUnderlayFile.mockResolvedValue({
      ok: true,
      dataUrl: "data:image/png;base64,xx",
    });
    commitUnderlayImport.mockResolvedValue({
      ok: true,
      imageUrl: "https://cdn.example/plan.png",
    });
    const onApplyUnderlay = vi.fn();

    const { container } = render(
      <SketchStartOverlay
        visible
        inspectionId="insp-1"
        onStartBlank={vi.fn()}
        onPlaceMoisture={vi.fn()}
        onApplyUnderlay={onApplyUnderlay}
      />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array(32)], "plan.png", {
      type: "image/png",
    });
    fireEvent.change(input, { target: { files: [file] } });

    expect(
      await screen.findByRole("heading", { name: /review the uploaded plan/i }),
    ).toBeInTheDocument();

    const place = screen.getByRole("button", { name: /place on canvas/i });
    expect(place).toBeDisabled();

    fireEvent.click(
      screen.getByLabelText(/client holds the rights/i),
    );
    fireEvent.click(
      screen.getByLabelText(/complies with the source/i),
    );
    expect(place).toBeEnabled();

    fireEvent.click(place);
    await waitFor(() => {
      expect(onApplyUnderlay).toHaveBeenCalledWith(
        "https://cdn.example/plan.png",
        0.35,
      );
    });
  });
});
