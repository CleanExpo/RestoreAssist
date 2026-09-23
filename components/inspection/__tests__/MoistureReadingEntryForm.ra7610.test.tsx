// @vitest-environment jsdom
/**
 * RA-7610 — location is a SketchRoom dropdown when rooms exist; free-text
 * remains the fallback for a room not on the plan.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const INSPECTION_ID = "insp-ra-7610";

let MoistureReadingEntryForm: typeof import("../MoistureReadingEntryForm").MoistureReadingEntryForm;

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("fetch", vi.fn());
  Object.defineProperty(window.navigator, "onLine", {
    value: true,
    configurable: true,
  });

  vi.doMock("@/hooks/use-bluetooth-meter", () => ({
    useBluetoothMeter: () => ({
      availability: "unavailable-no-api",
      paired: null,
      pairing: false,
      reading: false,
      lastReading: null,
      pair: async () => {},
      read: async () => null,
      disconnect: async () => {},
    }),
    isEnvironmentalReading: () => false,
    isMoistureReading: () => false,
  }));

  ({ MoistureReadingEntryForm } = await import("../MoistureReadingEntryForm"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("MoistureReadingEntryForm — RA-7610 room dropdown", () => {
  it("saves a free-text-only reading when the room is not on the plan", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        moistureReading: { id: "mr-ft", location: "Subfloor hatch" },
      }),
    });

    const onSuccess = vi.fn();
    render(
      <MoistureReadingEntryForm
        inspectionId={INSPECTION_ID}
        sketchRooms={[{ id: "sr-living", name: "Living room" }]}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Location/i), {
      target: { value: "__not_on_plan__" },
    });
    fireEvent.change(screen.getByLabelText(/Room not on the plan/i), {
      target: { value: "Subfloor hatch" },
    });
    fireEvent.change(screen.getByLabelText(/Moisture Reading/i), {
      target: { value: "18.4" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save Reading/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const body = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    ) as { location: string; sketchRoomId: string | null };
    expect(body.location).toBe("Subfloor hatch");
    expect(body.sketchRoomId).toBeNull();
  });

  it("posts sketchRoomId when a drawn room is chosen", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        moistureReading: { id: "mr-room", location: "Living room" },
      }),
    });

    const onSuccess = vi.fn();
    render(
      <MoistureReadingEntryForm
        inspectionId={INSPECTION_ID}
        sketchRooms={[{ id: "sr-living", name: "Living room" }]}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Location/i), {
      target: { value: "sr-living" },
    });
    fireEvent.change(screen.getByLabelText(/Moisture Reading/i), {
      target: { value: "31.0" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save Reading/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const body = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    ) as { location: string; sketchRoomId: string | null };
    expect(body.location).toBe("Living room");
    expect(body.sketchRoomId).toBe("sr-living");
  });
});
