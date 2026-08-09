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
