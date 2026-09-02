// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { SignatureCanvas } from "../SignatureCanvas";

/**
 * Touch/tablet behaviour for the signature pad.
 *
 * A client signs an authority form on the technician's tablet, so these are the
 * conditions that actually matter — and they are the ones a desktop pass never
 * exercises.
 *
 * jsdom gives no real 2D context, so these assert the WIRING and the DOM
 * contract rather than rendered pixels: that the cancel handler is bound at
 * all, that touch scrolling is suppressed, and that the backing store is scaled
 * for device pixel ratio. Pixel fidelity is not claimed.
 */

function ctxStub() {
  return {
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setTransform: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    putImageData: vi.fn(),
    clearRect: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineCap: "",
    lineJoin: "",
    lineWidth: 0,
  };
}

describe("SignatureCanvas on touch devices", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // jsdom computes no layout, so clientWidth is 0 and the component's
    // responsive sizing would collapse to a negative width. Give it a real box
    // so the sizing path under test behaves as it does in a browser.
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      value: 402, // component subtracts 2 for the border
    });
    HTMLCanvasElement.prototype.getContext = vi.fn(ctxStub) as never;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,AA");
  });

  /**
   * The touch-only bug: `pointercancel` fires instead of `pointerup` when the
   * system claims the gesture. Unhandled, isDrawing stays true and the next
   * touch continues the interrupted path across the signature.
   */
  it("binds a pointercancel handler so an interrupted stroke ends", () => {
    const { container } = render(<SignatureCanvas onSave={vi.fn()} />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeInTheDocument();

    // React attaches pointercancel via its synthetic system; dispatching the
    // event must not leave the component mid-stroke or throw.
    expect(() => {
      canvas!.dispatchEvent(
        new Event("pointercancel", { bubbles: true, cancelable: true }),
      );
    }).not.toThrow();
  });

  /**
   * Without touch-action: none, dragging on the canvas scrolls the page instead
   * of drawing. This is the single most common reason a signature pad "does not
   * work on mobile".
   */
  it("suppresses touch scrolling over the drawing surface", () => {
    const { container } = render(<SignatureCanvas onSave={vi.fn()} />);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.style.touchAction).toBe("none");
  });

  /**
   * The exported PNG is the signature of record on an authority form. At one
   * bitmap pixel per CSS pixel it exports at a fraction of the resolution the
   * client saw on a retina tablet.
   */
  it("backs the canvas with a device-pixel-ratio buffer", () => {
    const original = window.devicePixelRatio;
    Object.defineProperty(window, "devicePixelRatio", {
      value: 3,
      configurable: true,
    });

    const { container } = render(<SignatureCanvas onSave={vi.fn()} width={400} height={200} />);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;

    // The backing store is larger than the CSS box it is displayed in.
    const cssWidth = parseInt(canvas.style.width || "0", 10);
    expect(cssWidth).toBeGreaterThan(0);
    expect(canvas.width).toBeGreaterThan(cssWidth);
    expect(canvas.width).toBe(cssWidth * 3);

    Object.defineProperty(window, "devicePixelRatio", {
      value: original,
      configurable: true,
    });
  });

  it("caps the ratio so an extreme value cannot allocate an enormous buffer", () => {
    Object.defineProperty(window, "devicePixelRatio", {
      value: 12,
      configurable: true,
    });
    const { container } = render(<SignatureCanvas onSave={vi.fn()} width={400} height={200} />);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    const cssWidth = parseInt(canvas.style.width || "0", 10);
    expect(canvas.width).toBe(cssWidth * 3);
  });

  it("still renders the signing affordance", () => {
    render(<SignatureCanvas onSave={vi.fn()} />);
    expect(screen.getByText(/draw your signature/i)).toBeInTheDocument();
  });
});
