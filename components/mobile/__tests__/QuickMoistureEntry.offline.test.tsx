// @vitest-environment jsdom
/**
 * RA-7568 — offline save from the quick moisture pad must land in the
 * RA-1124 NIR sync queue and drain exactly once on reconnect.
 *
 * This file drives the live component against the real queueWrite /
 * drainQueue helpers (with the shared in-memory IndexedDB fake). Mocking
 * the queue away would let a "queues when offline" assertion pass while
 * still losing the reading — the walkthrough failure mode.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { installFakeIndexedDB } from "@/lib/__tests__/helpers/fake-indexeddb";

const INSPECTION_ID = "insp-t12";
const MOISTURE_ENDPOINT = `/api/inspections/${INSPECTION_ID}/moisture`;

let uninstallIdb: () => void;
let QuickMoistureEntry: typeof import("../QuickMoistureEntry").QuickMoistureEntry;
let drainQueue: typeof import("@/lib/nir-sync-queue").drainQueue;
let getPendingEntries: typeof import("@/lib/nir-sync-queue").getPendingEntries;

beforeEach(async () => {
  uninstallIdb = installFakeIndexedDB();
  vi.resetModules();
  vi.stubGlobal("fetch", vi.fn());
  Object.defineProperty(window.navigator, "onLine", {
    value: true,
    configurable: true,
  });

  ({ QuickMoistureEntry } = await import("../QuickMoistureEntry"));
  ({ drainQueue, getPendingEntries } = await import("@/lib/nir-sync-queue"));
});

afterEach(() => {
  uninstallIdb();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    value,
    configurable: true,
  });
}

function enterWalkthroughReading() {
  fireEvent.click(screen.getByRole("button", { name: "Floor - lounge" }));
  fireEvent.click(screen.getByRole("button", { name: "3" }));
  fireEvent.click(screen.getByRole("button", { name: "7" }));
  fireEvent.click(screen.getByRole("button", { name: "." }));
  fireEvent.click(screen.getByRole("button", { name: "4" }));
  fireEvent.click(screen.getByRole("button", { name: "Save Reading" }));
}

describe("QuickMoistureEntry — offline queue (RA-7568)", () => {
  it("queues an offline save, shows the local-sync copy, and drains exactly one reading on reconnect", async () => {
    setOnline(false);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ moistureReading: { id: "mr-1" } }),
    });

    const onSaved = vi.fn();
    render(
      <QuickMoistureEntry inspectionId={INSPECTION_ID} onSaved={onSaved} />,
    );

    enterWalkthroughReading();

    await waitFor(() =>
      expect(
        screen.getByText(/Saved on this device — will sync/i),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Save failed — tap to retry/i)).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledWith({
      location: "Floor - lounge",
      moistureLevel: 37.4,
      material: "plasterboard",
    });

    const pending = await getPendingEntries(INSPECTION_ID);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      type: "moisture-reading",
      endpoint: MOISTURE_ENDPOINT,
      method: "POST",
      status: "pending",
    });
    expect(pending[0].payload).toMatchObject({
      location: "Floor - lounge",
      surfaceType: "plasterboard",
      moistureLevel: 37.4,
    });

    setOnline(true);
    const synced = await drainQueue();
    expect(synced).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(MOISTURE_ENDPOINT);
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("Idempotency-Key")).toBe(pending[0].id);
    expect(headers.get("X-RestoreAssist-Mutation-Id")).toBe(pending[0].id);
    expect(JSON.parse(String(init.body))).toMatchObject({
      location: "Floor - lounge",
      surfaceType: "plasterboard",
      moistureLevel: 37.4,
      depth: "Surface",
      meterType: "pin",
    });

    const afterDrain = await drainQueue();
    expect(afterDrain).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(getPendingEntries(INSPECTION_ID)).resolves.toHaveLength(0);
  });

  it("retries a moisture 409 instead of dropping the queued reading, then syncs once", async () => {
    setOnline(false);
    const onSaved = vi.fn();
    render(
      <QuickMoistureEntry inspectionId={INSPECTION_ID} onSaved={onSaved} />,
    );
    enterWalkthroughReading();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    const pending = await getPendingEntries(INSPECTION_ID);
    expect(pending).toHaveLength(1);
    const mutationId = pending[0].id;

    setOnline(true);
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error:
            "A request with this Idempotency-Key is already in progress. Retry shortly.",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ moistureReading: { id: "mr-1" } }),
      });

    expect(await drainQueue()).toBe(0);
    await expect(getPendingEntries(INSPECTION_ID)).resolves.toHaveLength(1);

    expect(await drainQueue()).toBe(1);
    await expect(getPendingEntries(INSPECTION_ID)).resolves.toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const keys = fetchMock.mock.calls.map((call) => {
      const headers = new Headers((call[1] as RequestInit).headers);
      return headers.get("Idempotency-Key");
    });
    expect(keys).toEqual([mutationId, mutationId]);
  });

  it("queues on a network error even when navigator.onLine reports true", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError("Failed to fetch"),
    );

    render(<QuickMoistureEntry inspectionId={INSPECTION_ID} />);
    enterWalkthroughReading();

    await waitFor(() =>
      expect(
        screen.getByText(/Saved on this device — will sync/i),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Save failed — tap to retry/i)).not.toBeInTheDocument();

    const pending = await getPendingEntries(INSPECTION_ID);
    expect(pending).toHaveLength(1);
    expect(pending[0].type).toBe("moisture-reading");
  });

  it("posts directly when online and the route succeeds (regression guard)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ moistureReading: { id: "mr-online" } }),
    });

    render(<QuickMoistureEntry inspectionId={INSPECTION_ID} />);
    enterWalkthroughReading();

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Save failed — tap to retry/i)).not.toBeInTheDocument();
    await expect(getPendingEntries(INSPECTION_ID)).resolves.toHaveLength(0);
  });

  it("queues when the moisture route returns a 5xx", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "Internal server error" }),
    });

    render(<QuickMoistureEntry inspectionId={INSPECTION_ID} />);
    enterWalkthroughReading();

    await waitFor(() =>
      expect(
        screen.getByText(/Saved on this device — will sync/i),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Save failed — tap to retry/i)).not.toBeInTheDocument();
    await expect(getPendingEntries(INSPECTION_ID)).resolves.toHaveLength(1);
  });

  it("does not queue a 4xx — the technician must retry or fix the input", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Location is required" }),
    });

    render(<QuickMoistureEntry inspectionId={INSPECTION_ID} />);
    enterWalkthroughReading();

    await waitFor(() =>
      expect(screen.getByText(/Save failed — tap to retry/i)).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/Saved on this device — will sync/i),
    ).not.toBeInTheDocument();
    await expect(getPendingEntries(INSPECTION_ID)).resolves.toHaveLength(0);
  });
});
