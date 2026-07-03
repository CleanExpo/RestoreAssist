import { describe, it, expect, vi } from "vitest";
import { exportSketchPng, type ExportableCanvas } from "../export-sketch-png";

// RA-6847 [C1]: the exported PNG must never include the `underlay_reference`
// background. We assert the background is detached at the moment toDataURL runs,
// and always restored afterwards.
describe("exportSketchPng", () => {
  it("detaches the underlay background before capturing the PNG", () => {
    const canvas: ExportableCanvas = {
      backgroundImage: { src: "imported-plan.png" },
      renderAll: vi.fn(),
      toDataURL: vi.fn(function (this: void) {
        // Snapshot the background state at capture time.
        return `png:bg=${canvas.backgroundImage == null ? "none" : "present"}`;
      }),
    };

    const out = exportSketchPng(canvas);
    expect(out).toBe("png:bg=none");
  });

  it("restores the underlay background after export", () => {
    const bg = { src: "imported-plan.png" };
    const canvas: ExportableCanvas = {
      backgroundImage: bg,
      renderAll: vi.fn(),
      toDataURL: vi.fn(() => "png"),
    };

    exportSketchPng(canvas);
    expect(canvas.backgroundImage).toBe(bg);
  });

  it("restores the background even if toDataURL throws", () => {
    const bg = { src: "imported-plan.png" };
    const canvas: ExportableCanvas = {
      backgroundImage: bg,
      renderAll: vi.fn(),
      toDataURL: vi.fn(() => {
        throw new Error("render failed");
      }),
    };

    expect(() => exportSketchPng(canvas)).toThrow("render failed");
    expect(canvas.backgroundImage).toBe(bg);
  });

  it("passes through unchanged when there is no underlay", () => {
    const canvas: ExportableCanvas = {
      backgroundImage: null,
      renderAll: vi.fn(),
      toDataURL: vi.fn(() => "plain-png"),
    };

    expect(exportSketchPng(canvas)).toBe("plain-png");
    // No underlay → no need to re-render just for export.
    expect(canvas.renderAll).not.toHaveBeenCalled();
  });

  it("prefers requestRenderAll when available", () => {
    const request = vi.fn();
    const canvas: ExportableCanvas = {
      backgroundImage: { src: "x" },
      renderAll: vi.fn(),
      requestRenderAll: request,
      toDataURL: vi.fn(() => "png"),
    };

    exportSketchPng(canvas);
    expect(request).toHaveBeenCalled();
    expect(canvas.renderAll).not.toHaveBeenCalled();
  });

  it("forwards export options to toDataURL", () => {
    const toDataURL = vi.fn(() => "png");
    const canvas: ExportableCanvas = {
      backgroundImage: null,
      renderAll: vi.fn(),
      toDataURL,
    };

    exportSketchPng(canvas, { format: "png", multiplier: 2 });
    expect(toDataURL).toHaveBeenCalledWith({ format: "png", multiplier: 2 });
  });
});
