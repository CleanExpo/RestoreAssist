import { describe, it, expect, vi } from "vitest";
import { exportSketchPng, type ExportableCanvas } from "../export-sketch-png";
import { EXPORT_REPORT_MULTIPLIER } from "../export-content-bounds";

// RA-6847 [C1]: the exported PNG must never include the `underlay_reference`
// background. We assert the background is detached at the moment toDataURL runs,
// and always restored afterwards. Report export also crops to content and resets
// viewport so pan/zoom never leave empty void in the PDF.
describe("exportSketchPng", () => {
  it("detaches the underlay background before capturing the PNG", () => {
    const canvas: ExportableCanvas = {
      backgroundImage: { src: "imported-plan.png" },
      renderAll: vi.fn(),
      getWidth: () => 400,
      getHeight: () => 300,
      getObjects: () => [],
      toDataURL: vi.fn(function (this: void) {
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
      getWidth: () => 400,
      getHeight: () => 300,
      getObjects: () => [],
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
      getWidth: () => 400,
      getHeight: () => 300,
      getObjects: () => [],
      toDataURL: vi.fn(() => {
        throw new Error("render failed");
      }),
    };

    expect(() => exportSketchPng(canvas)).toThrow("render failed");
    expect(canvas.backgroundImage).toBe(bg);
  });

  it("passes through without crop when there is no content", () => {
    const toDataURL = vi.fn(() => "plain-png");
    const canvas: ExportableCanvas = {
      backgroundImage: null,
      renderAll: vi.fn(),
      getWidth: () => 400,
      getHeight: () => 300,
      getObjects: () => [],
      toDataURL,
    };

    expect(exportSketchPng(canvas)).toBe("plain-png");
    expect(toDataURL).toHaveBeenCalledWith({
      format: "png",
      quality: undefined,
      multiplier: EXPORT_REPORT_MULTIPLIER,
    });
  });

  it("crops to content bounds and uses report multiplier by default", () => {
    const toDataURL = vi.fn(() => "png");
    const canvas: ExportableCanvas = {
      backgroundImage: null,
      renderAll: vi.fn(),
      discardActiveObject: vi.fn(),
      setViewportTransform: vi.fn(),
      viewportTransform: [2, 0, 0, 2, 50, 50],
      getWidth: () => 1000,
      getHeight: () => 800,
      getObjects: () => [
        {
          data: { type: "room" },
          getBoundingRect: () => ({
            left: 200,
            top: 100,
            width: 300,
            height: 200,
          }),
        },
      ],
      toDataURL,
    };

    exportSketchPng(canvas);
    expect(canvas.discardActiveObject).toHaveBeenCalled();
    expect(canvas.setViewportTransform).toHaveBeenCalledWith([
      1, 0, 0, 1, 0, 0,
    ]);
    // Restored original viewport after capture
    expect(canvas.setViewportTransform).toHaveBeenLastCalledWith([
      2, 0, 0, 2, 50, 50,
    ]);
    const opts = toDataURL.mock.calls[0][0] as {
      left: number;
      top: number;
      width: number;
      height: number;
      multiplier: number;
    };
    expect(opts.multiplier).toBe(EXPORT_REPORT_MULTIPLIER);
    expect(opts.left).toBeLessThanOrEqual(200);
    expect(opts.top).toBeLessThanOrEqual(100);
    expect(opts.width).toBeGreaterThan(300);
    expect(opts.height).toBeGreaterThan(200);
  });

  it("hides guides during capture and restores visibility", () => {
    const guide = { data: { type: "guide" as const }, visible: true };
    const canvas: ExportableCanvas = {
      backgroundImage: null,
      renderAll: vi.fn(),
      getWidth: () => 400,
      getHeight: () => 300,
      getObjects: () => [guide],
      toDataURL: vi.fn(function () {
        expect(guide.visible).toBe(false);
        return "png";
      }),
    };

    exportSketchPng(canvas);
    expect(guide.visible).toBe(true);
  });

  it("prefers requestRenderAll when available", () => {
    const request = vi.fn();
    const canvas: ExportableCanvas = {
      backgroundImage: { src: "x" },
      renderAll: vi.fn(),
      requestRenderAll: request,
      getWidth: () => 400,
      getHeight: () => 300,
      getObjects: () => [],
      toDataURL: vi.fn(() => "png"),
    };

    exportSketchPng(canvas);
    expect(request).toHaveBeenCalled();
    expect(canvas.renderAll).not.toHaveBeenCalled();
  });

  it("forwards explicit export options and skipCrop", () => {
    const toDataURL = vi.fn(() => "png");
    const canvas: ExportableCanvas = {
      backgroundImage: null,
      renderAll: vi.fn(),
      getWidth: () => 1000,
      getHeight: () => 800,
      getObjects: () => [
        {
          data: { type: "room" },
          getBoundingRect: () => ({
            left: 10,
            top: 10,
            width: 50,
            height: 50,
          }),
        },
      ],
      toDataURL,
    };

    exportSketchPng(canvas, {
      format: "png",
      multiplier: 2,
      skipCrop: true,
    });
    expect(toDataURL).toHaveBeenCalledWith({
      format: "png",
      quality: undefined,
      multiplier: 2,
    });
  });
});
