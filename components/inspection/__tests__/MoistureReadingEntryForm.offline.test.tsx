// @vitest-environment jsdom
/**
 * RA-7602 — offline save from MoistureReadingEntryForm must land in the
 * RA-1124 NIR sync queue and drain exactly once on reconnect.
 *
 * Same no-silent-drop bar as RA-7568 / #2233 (QuickMoistureEntry). This
 * file drives the live component against the real queueWrite / drainQueue
 * helpers (shared in-memory IndexedDB fake). Mocking the queue away would
 * let a "queues when offline" assertion pass while still losing the reading.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { installFakeIndexedDB } from "@/lib/__tests__/helpers/fake-indexeddb";
import {
  beginOfflineIdentity,
  SYNTHETIC_OFFLINE_OWNER,
} from "@/lib/__tests__/helpers/offline-identity";

const INSPECTION_ID = "insp-ra-7602";
const MOISTURE_ENDPOINT = `/api/inspections/${INSPECTION_ID}/moisture`;

let uninstallIdb: () => void;
let endOfflineIdentity: () => void;
const operationFetch = vi.fn();
let MoistureReadingEntryForm: typeof import("../MoistureReadingEntryForm").MoistureReadingEntryForm;
let drainQueue: typeof import("@/lib/nir-sync-queue").drainQueue;
let getPendingEntries: typeof import("@/lib/nir-sync-queue").getPendingEntries;

beforeEach(async () => {
  uninstallIdb = installFakeIndexedDB();
  vi.resetModules();
  operationFetch.mockReset();
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
  ({ drainQueue, getPendingEntries } = await import("@/lib/nir-sync-queue"));
  endOfflineIdentity = await beginOfflineIdentity(operationFetch);
});

afterEach(() => {
  endOfflineIdentity();
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

function enterReading(overrides?: { location?: string; moistureLevel?: string }) {
  fireEvent.change(screen.getByLabelText(/Location/i), {
    target: { value: overrides?.location ?? "Floor - lounge" },
  });
  fireEvent.change(screen.getByLabelText(/Moisture Reading/i), {
    target: { value: overrides?.moistureLevel ?? "37.4" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Save Reading/i }));
}

describe("MoistureReadingEntryForm — offline queue (RA-7602)", () => {
  it("fails closed after account identity is cleared, without claiming a local save", async () => {
    const { clearOfflineContext } = await import("@/lib/offline/account-boundary");
    clearOfflineContext(false);
    setOnline(false);
    const openDatabase = vi.spyOn(indexedDB, "open");
    const onSuccess = vi.fn();
    render(<MoistureReadingEntryForm inspectionId={INSPECTION_ID} onSuccess={onSuccess} />);

    enterReading();

    await waitFor(() =>
      expect(
        screen.getByText(/verify your account before saving offline work/i),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Saved on this device — will sync/i)).not.toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(openDatabase).not.toHaveBeenCalled();
    expect(operationFetch).not.toHaveBeenCalled();
  });

  it("queues an offline save, shows the local-sync copy, and drains exactly one reading on reconnect", async () => {
    setOnline(false);
    operationFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        moistureReading: { id: "mr-1", location: "Floor - lounge" },
      }),
    });

    const onSuccess = vi.fn();
    render(
      <MoistureReadingEntryForm
        inspectionId={INSPECTION_ID}
        onSuccess={onSuccess}
      />,
    );

    enterReading();

    await waitFor(() =>
      expect(
        screen.getByText(/Saved on this device — will sync/i),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/Failed to save reading/i),
    ).not.toBeInTheDocument();
    expect(operationFetch).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess.mock.calls[0][0]).toMatchObject({
      location: "Floor - lounge",
      surfaceType: "timber",
      moistureLevel: 37.4,
      depth: "Surface",
    });

    const pending = await getPendingEntries(INSPECTION_ID);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      type: "moisture-reading",
      endpoint: MOISTURE_ENDPOINT,
      method: "POST",
      status: "pending",
      owner: SYNTHETIC_OFFLINE_OWNER,
    });
    expect(pending[0].payload).toMatchObject({
      location: "Floor - lounge",
      surfaceType: "timber",
      moistureLevel: 37.4,
      depth: "Surface",
      notes: null,
      source: "manual",
    });
    expect(onSuccess.mock.calls[0][0].id).toBe(pending[0].id);

    setOnline(true);
    const synced = await drainQueue();
    expect(synced).toBe(1);
    expect(operationFetch).toHaveBeenCalledTimes(1);

    const [url, init] = operationFetch.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(MOISTURE_ENDPOINT);
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("Idempotency-Key")).toBe(pending[0].id);
    expect(headers.get("X-RestoreAssist-Mutation-Id")).toBe(pending[0].id);
    expect(
      JSON.parse(decodeURIComponent(headers.get("x-restoreassist-offline-owner")!)),
    ).toEqual(SYNTHETIC_OFFLINE_OWNER);
    expect(JSON.parse(String(init.body))).toMatchObject({
      location: "Floor - lounge",
      surfaceType: "timber",
      moistureLevel: 37.4,
      depth: "Surface",
      notes: null,
      source: "manual",
    });

    const afterDrain = await drainQueue();
    expect(afterDrain).toBe(0);
    expect(operationFetch).toHaveBeenCalledTimes(1);
    await expect(getPendingEntries(INSPECTION_ID)).resolves.toHaveLength(0);
  });

  it("retries a moisture 409 instead of dropping the queued reading, then syncs once", async () => {
    setOnline(false);
    const onSuccess = vi.fn();
    render(
      <MoistureReadingEntryForm
        inspectionId={INSPECTION_ID}
        onSuccess={onSuccess}
      />,
    );
    enterReading();
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));

    const pending = await getPendingEntries(INSPECTION_ID);
    expect(pending).toHaveLength(1);
    const mutationId = pending[0].id;

    setOnline(true);
    const fetchMock = operationFetch;
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
    operationFetch.mockRejectedValue(
      new TypeError("Failed to fetch"),
    );

    const onSuccess = vi.fn();
    render(
      <MoistureReadingEntryForm
        inspectionId={INSPECTION_ID}
        onSuccess={onSuccess}
      />,
    );
    enterReading();

    await waitFor(() =>
      expect(
        screen.getByText(/Saved on this device — will sync/i),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/Failed to save reading/i),
    ).not.toBeInTheDocument();

    const pending = await getPendingEntries(INSPECTION_ID);
    expect(pending).toHaveLength(1);
    expect(pending[0].type).toBe("moisture-reading");
  });

  it("posts directly when online and the route succeeds (regression guard)", async () => {
    operationFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        moistureReading: {
          id: "mr-online",
          location: "Floor - lounge",
          surfaceType: "timber",
          moistureLevel: 37.4,
          depth: "Surface",
          notes: null,
          photoUrl: null,
          recordedAt: "2026-09-21T00:00:00.000Z",
        },
      }),
    });

    const onSuccess = vi.fn();
    render(
      <MoistureReadingEntryForm
        inspectionId={INSPECTION_ID}
        onSuccess={onSuccess}
      />,
    );
    enterReading();

    await waitFor(() => expect(operationFetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByText(/Saved on this device — will sync/i),
    ).not.toBeInTheDocument();
    await expect(getPendingEntries(INSPECTION_ID)).resolves.toHaveLength(0);

    const headers = new Headers(
      (operationFetch.mock.calls[0][1] as RequestInit)
        .headers,
    );
    expect(headers.get("Idempotency-Key")).toBeTruthy();
    expect(onSuccess.mock.calls[0][0]).toMatchObject({
      id: "mr-online",
      location: "Floor - lounge",
      moistureLevel: 37.4,
    });
  });

  it("queues when the moisture route returns a 5xx", async () => {
    operationFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "Internal server error" }),
    });

    render(
      <MoistureReadingEntryForm
        inspectionId={INSPECTION_ID}
        onSuccess={vi.fn()}
      />,
    );
    enterReading();

    await waitFor(() =>
      expect(
        screen.getByText(/Saved on this device — will sync/i),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/Failed to save reading/i),
    ).not.toBeInTheDocument();
    await expect(getPendingEntries(INSPECTION_ID)).resolves.toHaveLength(1);
  });

  it("does not queue a 4xx — the technician must retry or fix the input", async () => {
    operationFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Location is required" }),
    });

    render(
      <MoistureReadingEntryForm
        inspectionId={INSPECTION_ID}
        onSuccess={vi.fn()}
      />,
    );
    enterReading();

    await waitFor(() =>
      expect(screen.getByText(/Location is required/i)).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/Saved on this device — will sync/i),
    ).not.toBeInTheDocument();
    await expect(getPendingEntries(INSPECTION_ID)).resolves.toHaveLength(0);
  });
});
