// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SignaturePad from "../SignaturePad";

const reactActEnvironment = globalThis as unknown as {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

function armCanvas() {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    setTransform: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
  })) as never;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(
    () => "data:image/png;base64,AA",
  );
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
}

function drawInk(canvas: HTMLCanvasElement) {
  fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 80, clientY: 40, pointerId: 1 });
  fireEvent.pointerUp(canvas, { pointerId: 1 });
}

describe("SignaturePad consent state (RA-8237)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    armCanvas();
  });

  describe("without act, so React schedules effects as it does in a browser", () => {
    let root: Root | null = null;
    let container: HTMLDivElement;

    beforeEach(() => {
      reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
      container = document.createElement("div");
      document.body.appendChild(container);
    });

    afterEach(() => {
      root?.unmount();
      root = null;
      container.remove();
      reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    });

    it("keeps a tick made after the pad paints but before its effects run", async () => {
      let canvasWidthAtTick: string | null = null;

      const ticked = new Promise<void>((resolve) => {
        // A MutationObserver callback runs straight after React commits the
        // DOM, before the scheduler gets a turn to run passive effects.
        const observer = new MutationObserver(() => {
          const box = container.querySelector<HTMLInputElement>(
            'input[type="checkbox"]',
          );
          const canvas = container.querySelector("canvas");
          if (!box || !canvas) return;
          observer.disconnect();
          canvasWidthAtTick = canvas.style.width;
          box.click();
          resolve();
        });
        observer.observe(container, { childList: true, subtree: true });
      });

      root = createRoot(container);
      root.render(
        <SignaturePad
          reportId="rep-race"
          attestationType="TECHNICIAN_SIGN_OFF"
          actionLabel="Technician sign-off"
        />,
      );

      await ticked;

      // The canvas effect sets this width. Empty proves the tick landed
      // before the effects ran, so this test exercised the real ordering.
      expect(canvasWidthAtTick).toBe("");

      await waitFor(() =>
        expect(container.querySelector("canvas")?.style.width).not.toBe(""),
      );
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(
        container.querySelector<HTMLInputElement>('input[type="checkbox"]'),
      ).toBeChecked();
    });
  });

  it("clears the tick when the statement being signed changes", async () => {
    const { rerender } = render(
      <SignaturePad
        reportId="rep-change"
        attestationType="TECHNICIAN_SIGN_OFF"
        actionLabel="Technician sign-off"
      />,
    );

    const box = screen.getByRole("checkbox");
    fireEvent.click(box);
    expect(box).toBeChecked();

    rerender(
      <SignaturePad
        reportId="rep-change"
        attestationType="TECHNICIAN_SIGN_OFF"
        actionLabel="Manager countersign"
      />,
    );

    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("asks for a new consent token when the statement being signed changes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ consentToken: "ct_first" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "Temporary failure" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ consentToken: "ct_second" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "Temporary failure" }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const onError = vi.fn();

    const { rerender } = render(
      <SignaturePad
        reportId="rep-token"
        attestationType="TECHNICIAN_SIGN_OFF"
        actionLabel="Technician sign-off"
        onError={onError}
      />,
    );

    drawInk(screen.getByLabelText(/Signature canvas/i) as HTMLCanvasElement);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Attest & sign" }));
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));

    rerender(
      <SignaturePad
        reportId="rep-token"
        attestationType="TECHNICIAN_SIGN_OFF"
        actionLabel="Manager countersign"
        onError={onError}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Attest & sign" }));
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(2));

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringContaining("/pre-attest"),
      expect.stringContaining("/attest"),
      expect.stringContaining("/pre-attest"),
      expect.stringContaining("/attest"),
    ]);
    const secondAttestBody = JSON.parse(
      fetchMock.mock.calls[3][1].body as string,
    ) as { consentToken: string };
    expect(secondAttestBody.consentToken).toBe("ct_second");
  });
});
