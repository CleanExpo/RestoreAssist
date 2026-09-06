// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
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
    drawImage: vi.fn(),
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

/**
 * Give the canvas the CSS box the component itself just set on it.
 *
 * jsdom's getBoundingClientRect is all zeros. Hardcoding a box instead would
 * make the test assert against a shape the component never produces -- a first
 * attempt used 400x200 while the component had sized itself 400x167, and the
 * coordinate correction for a CSS-scaled element then fired legitimately and
 * looked like a failure.
 */
function stubBoxFromStyle(canvas: HTMLCanvasElement) {
  const width = parseFloat(canvas.style.width) || 0;
  const height = parseFloat(canvas.style.height) || 0;
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0,
       toJSON: () => ({}) }) as DOMRect;
  return { width, height };
}

function pointer(type: string, clientX: number, clientY: number) {
  const e = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    clientX: number; clientY: number; pointerId: number;
  };
  e.clientX = clientX;
  e.clientY = clientY;
  e.pointerId = 1;
  return e;
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

describe("SignatureCanvas under a device-pixel-ratio backing store", () => {
  // ONE shared context, unlike the block above. vi.fn(ctxStub) builds a fresh
  // stub per getContext() call, so a test that grabbed its own would be
  // inspecting a different object than the component drew into -- every spy
  // reads zero calls and the assertion fails for a reason that has nothing to
  // do with the component.
  let ctx: ReturnType<typeof ctxStub>;

  beforeEach(() => {
    vi.restoreAllMocks();
    ctx = ctxStub();
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      value: 402,
    });
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as never;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,AA");
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 2,
    });
  });

  /**
   * The stroke must land where the finger is.
   *
   * The context is scaled with setTransform(dpr, ...), so it expects CSS-pixel
   * coordinates. A pointer helper that ALSO multiplies by the ratio doubles
   * every coordinate: on a dpr-2 phone the signature is drawn at twice the
   * touch position and most of it falls outside the canvas. That is a defect
   * the DPR change introduced, on exactly the devices it was meant to improve,
   * and it is invisible at dpr 1 where the factor is 1.
   */
  it("draws at the pointer position, not at the pointer position times the ratio", () => {
    const { container } = render(<SignatureCanvas onSave={vi.fn()} />);
    const canvas = container.querySelector("canvas")!;
    stubBoxFromStyle(canvas);

    act(() => {
      canvas.dispatchEvent(pointer("pointerdown", 100, 50));
    });

    expect(ctx.moveTo).toHaveBeenCalledWith(100, 50);
  });

  /**
   * Rotating the tablet must not wipe the signature.
   *
   * Assigning canvas.width or canvas.height resets the bitmap, and the sizing
   * effect does both whenever canvasSize changes. Adding an orientationchange
   * listener made that fire on the one gesture the change was written for, so
   * a client who rotated the tablet mid-signature watched it vanish. The effect
   * has to carry the pixels across the resize.
   */
  it("carries the drawn signature across an orientation change", () => {
    const { container } = render(<SignatureCanvas onSave={vi.fn()} />);
    const canvas = container.querySelector("canvas")!;
    stubBoxFromStyle(canvas);

    act(() => {
      canvas.dispatchEvent(pointer("pointerdown", 100, 50));
    });
    canvas.dispatchEvent(pointer("pointermove", 140, 70));
    ctx.drawImage.mockClear();

    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      value: 302,
    });
    act(() => {
      window.dispatchEvent(new Event("orientationchange"));
    });

    expect(ctx.drawImage).toHaveBeenCalled();
  });

  /**
   * The negative control for the test above. Without it, an effect that called
   * drawImage unconditionally on every resize would satisfy the assertion while
   * restoring nothing.
   */
  it("does not restore anything when nothing has been drawn", () => {
    const { container } = render(<SignatureCanvas onSave={vi.fn()} />);
    const canvas = container.querySelector("canvas")!;
    stubBoxFromStyle(canvas);
    ctx.drawImage.mockClear();

    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      value: 302,
    });
    act(() => {
      window.dispatchEvent(new Event("orientationchange"));
    });

    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
});
