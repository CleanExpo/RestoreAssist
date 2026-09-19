// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SketchEvidenceLayer } from "../SketchEvidenceLayer";

describe("SketchEvidenceLayer existing-photo placement", () => {
  it("links an earlier inspection photo at the selected plan coordinates", async () => {
    const onPlaceExisting = vi.fn().mockResolvedValue(undefined);
    render(
      <SketchEvidenceLayer
        pins={[]}
        active
        width={800}
        height={600}
        existingPhotos={[
          {
            id: "photo-1",
            url: "https://example.test/kitchen.jpg",
            thumbnailUrl: null,
            description: "Kitchen leak",
            location: "Kitchen",
            mimeType: "image/jpeg",
          },
        ]}
        onPlace={vi.fn().mockResolvedValue(undefined)}
        onPlaceExisting={onPlaceExisting}
        onMove={() => {}}
        onRemove={() => {}}
      />,
    );

    const layer = screen.getByLabelText("Evidence pin layer");
    vi.spyOn(layer, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.click(layer, { clientX: 400, clientY: 300 });
    const existingPhotoButton = screen.getByRole("button", {
      name: "Use existing photo: Kitchen leak",
    });
    expect(screen.getByRole("dialog")).toHaveAttribute(
      "data-slot",
      "dialog-content",
    );
    expect(existingPhotoButton).toHaveAttribute("data-slot", "button");
    fireEvent.click(existingPhotoButton);

    await waitFor(() =>
      expect(onPlaceExisting).toHaveBeenCalledWith({
        x: 400,
        y: 300,
        nx: 0.5,
        ny: 0.5,
        photo: expect.objectContaining({ id: "photo-1" }),
      }),
    );
  });

  it("inverts Fabric zoom/pan so a click lands on the same plan point", async () => {
    const onPlaceExisting = vi.fn().mockResolvedValue(undefined);
    render(
      <SketchEvidenceLayer
        pins={[]}
        active
        width={800}
        height={600}
        overlayViewport={{ zoom: 2, panX: 40, panY: -20 }}
        existingPhotos={[
          {
            id: "photo-1",
            url: "https://example.test/kitchen.jpg",
            description: "Kitchen leak",
          },
        ]}
        onPlace={vi.fn().mockResolvedValue(undefined)}
        onPlaceExisting={onPlaceExisting}
        onMove={() => {}}
        onRemove={() => {}}
      />,
    );

    const layer = screen.getByTestId("sketch-evidence-layer");
    vi.spyOn(layer, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    // Scene (200, 160) at zoom 2 / pan (40, -20) → screen (440, 300)
    fireEvent.click(layer, { clientX: 440, clientY: 300 });
    fireEvent.click(
      screen.getByRole("button", { name: "Use existing photo: Kitchen leak" }),
    );

    await waitFor(() =>
      expect(onPlaceExisting).toHaveBeenCalledWith({
        x: 200,
        y: 160,
        nx: 0.25,
        ny: expect.closeTo(160 / 600, 5),
        photo: expect.objectContaining({ id: "photo-1" }),
      }),
    );
  });

  it("focuses the first action and restores focus to the layer after Escape", async () => {
    render(
      <SketchEvidenceLayer
        pins={[]}
        active
        width={800}
        height={600}
        existingPhotos={[
          {
            id: "photo-1",
            url: "https://example.test/kitchen.jpg",
            description: "Kitchen leak",
          },
        ]}
        onPlace={vi.fn().mockResolvedValue(undefined)}
        onPlaceExisting={vi.fn().mockResolvedValue(undefined)}
        onMove={() => {}}
        onRemove={() => {}}
      />,
    );

    const layer = screen.getByLabelText("Evidence pin layer");
    fireEvent.click(layer, { clientX: 100, clientY: 100 });

    const uploadButton = screen.getByRole("button", {
      name: "Capture or upload new",
    });
    await waitFor(() => expect(uploadButton).toHaveFocus());

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(layer).toHaveFocus();
    });
  });
});

describe("SketchEvidenceLayer dock-zoom overlay", () => {
  const pin = {
    id: "pin-1",
    kind: "photo",
    x: 200,
    y: 150,
    nx: 0.25,
    ny: 0.25,
    caption: "Kitchen leak",
  };

  it("moves pin screen coords when overlayViewport zoom changes (toolbar zoom)", () => {
    const { rerender } = render(
      <SketchEvidenceLayer
        pins={[pin]}
        active={false}
        width={800}
        height={600}
        overlayViewport={{ zoom: 1, panX: 0, panY: 0 }}
        onPlace={vi.fn().mockResolvedValue(undefined)}
        onMove={() => {}}
        onRemove={() => {}}
      />,
    );

    const el = screen.getByTestId("sketch-evidence-pin");
    expect(el.style.left).toBe("200px");
    expect(el.style.top).toBe("150px");
    expect(screen.getByTestId("sketch-evidence-layer")).toHaveAttribute(
      "data-overlay-zoom",
      "1",
    );

    rerender(
      <SketchEvidenceLayer
        pins={[pin]}
        active={false}
        width={800}
        height={600}
        overlayViewport={{ zoom: 1.2, panX: 0, panY: 0 }}
        onPlace={vi.fn().mockResolvedValue(undefined)}
        onMove={() => {}}
        onRemove={() => {}}
      />,
    );

    expect(el.style.left).toBe("240px");
    expect(el.style.top).toBe("180px");
    expect(screen.getByTestId("sketch-evidence-layer")).toHaveAttribute(
      "data-overlay-zoom",
      "1.2",
    );
  });
});
