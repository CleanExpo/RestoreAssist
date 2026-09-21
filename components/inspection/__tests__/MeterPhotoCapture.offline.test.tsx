// @vitest-environment jsdom
/**
 * RA-7604 — offline save from MeterPhotoCapture must land in the RA-1124
 * NIR sync queue and drain exactly once on reconnect.
 *
 * Same no-silent-drop bar as RA-7568 / #2233 (QuickMoistureEntry) and
 * RA-7602 / #2237 (MoistureReadingEntryForm). This file drives the live
 * component against the real queueWrite / drainQueue helpers (shared
 * in-memory IndexedDB fake). Mocking the queue away would let a
 * "queues when offline" assertion pass while still losing the reading.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { installFakeIndexedDB } from "@/lib/__tests__/helpers/fake-indexeddb";

const INSPECTION_ID = "insp-ra-7604";
const MOISTURE_ENDPOINT = `/api/inspections/${INSPECTION_ID}/moisture`;

const FIXTURE_PATH = join(
  process.cwd(),
  "lib/vision/__tests__/fixtures/moisture-meter-18-5.png",
);
const FIXTURE_BYTES = readFileSync(FIXTURE_PATH);

const READING = {
  brand: "protimeter",
  readingValue: 18.5,
  readingUnit: "WME",
  displayText: "18.5% WME",
  confidence: "high" as const,
};

let uninstallIdb: () => void;
let MeterPhotoCapture: typeof import("../MeterPhotoCapture").MeterPhotoCapture;
let drainQueue: typeof import("@/lib/nir-sync-queue").drainQueue;
let getPendingEntries: typeof import("@/lib/nir-sync-queue").getPendingEntries;

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(async () => {
  uninstallIdb = installFakeIndexedDB();
  vi.resetModules();
  vi.stubGlobal("fetch", vi.fn());
  Object.defineProperty(window.navigator, "onLine", {
    value: true,
    configurable: true,
  });

  vi.doMock("react-hot-toast", () => ({
    default: { success: vi.fn(), error: vi.fn() },
  }));
  vi.doMock("@/components/providers/CapacitorProvider", () => ({
    useCapacitor: () => ({ hasNativeCamera: false }),
  }));
  vi.doMock("@/lib/capacitor", () => ({ fireHaptic: vi.fn() }));

  ({ MeterPhotoCapture } = await import("../MeterPhotoCapture"));
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

async function attachMeterPhoto() {
  const file = new File([FIXTURE_BYTES], "meter.png", { type: "image/png" });
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file] });
  fireEvent.change(input);
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: /Analyse meter photo with AI/i }),
    ).toBeInTheDocument();
  });
}

async function reachConfirmForm() {
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
    jsonResponse(200, { reading: READING }),
  );
  render(<MeterPhotoCapture inspectionId={INSPECTION_ID} mode="moisture" />);
  await attachMeterPhoto();
  fireEvent.click(
    screen.getByRole("button", { name: /Analyse meter photo with AI/i }),
  );
  await waitFor(() => {
    expect(screen.getByText(/Confirm Moisture Reading/i)).toBeInTheDocument();
  });
}

function confirmAndSave(location = "Floor - lounge") {
  fireEvent.change(
    screen.getByPlaceholderText(/Master bedroom — east wall/i),
    { target: { value: location } },
  );
  fireEvent.change(screen.getByPlaceholderText(/concrete, timber/i), {
    target: { value: "timber" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Save Reading/i }));
}

describe("MeterPhotoCapture — offline queue (RA-7604)", () => {
  it("queues an offline save, shows the local-sync copy, and drains exactly one reading on reconnect", async () => {
    await reachConfirmForm();
    expect(fetch).toHaveBeenCalledTimes(1);

    setOnline(false);
    confirmAndSave();

    await waitFor(() =>
      expect(
        screen.getByText(/Saved on this device — will sync/i),
      ).toBeInTheDocument(),
    );
    expect(fetch).toHaveBeenCalledTimes(1);

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
      surfaceType: "timber",
      moistureLevel: 18.5,
      source: "ocr",
    });
    expect(String((pending[0].payload as { notes?: string }).notes)).toContain(
      "18.5% WME",
    );

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(201, { moistureReading: { id: "mr-1" } }),
    );
    setOnline(true);
    const synced = await drainQueue();
    expect(synced).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(2);

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[1] as [
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
      surfaceType: "timber",
      moistureLevel: 18.5,
      source: "ocr",
    });

    const afterDrain = await drainQueue();
    expect(afterDrain).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    await expect(getPendingEntries(INSPECTION_ID)).resolves.toHaveLength(0);
  });

  it("retries a moisture 409 instead of dropping the queued reading, then syncs once", async () => {
    await reachConfirmForm();
    setOnline(false);
    confirmAndSave();
    await waitFor(() =>
      expect(
        screen.getByText(/Saved on this device — will sync/i),
      ).toBeInTheDocument(),
    );

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
    expect(fetchMock.mock.calls.length).toBe(3);

    const moistureKeys = fetchMock.mock.calls.slice(1).map((call) => {
      const headers = new Headers((call[1] as RequestInit).headers);
      return headers.get("Idempotency-Key");
    });
    expect(moistureKeys).toEqual([mutationId, mutationId]);
  });

  it("queues on a network error even when navigator.onLine reports true", async () => {
    await reachConfirmForm();
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new TypeError("Failed to fetch"),
    );
    confirmAndSave();

    await waitFor(() =>
      expect(
        screen.getByText(/Saved on this device — will sync/i),
      ).toBeInTheDocument(),
    );

    const pending = await getPendingEntries(INSPECTION_ID);
    expect(pending).toHaveLength(1);
    expect(pending[0].type).toBe("moisture-reading");
  });

  it("posts directly when online and the route succeeds (regression guard)", async () => {
    await reachConfirmForm();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(201, { moistureReading: { id: "mr-online" } }),
    );
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(201, {}),
    );
    confirmAndSave();

    await waitFor(() => {
      expect(
        (fetch as ReturnType<typeof vi.fn>).mock.calls.some(
          (call) => call[0] === MOISTURE_ENDPOINT,
        ),
      ).toBe(true);
    });
    const moistureCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => call[0] === MOISTURE_ENDPOINT,
    ) as [string, RequestInit];
    const [url, init] = moistureCall;
    expect(url).toBe(MOISTURE_ENDPOINT);
    const headers = new Headers(init.headers);
    expect(headers.get("Idempotency-Key")).toBeTruthy();
    expect(headers.get("X-RestoreAssist-Mutation-Id")).toBe(
      headers.get("Idempotency-Key"),
    );
    expect(
      screen.queryByText(/Saved on this device — will sync/i),
    ).not.toBeInTheDocument();
    await expect(getPendingEntries(INSPECTION_ID)).resolves.toHaveLength(0);
  });

  it("queues when the moisture route returns a 5xx", async () => {
    await reachConfirmForm();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(503, { error: "Internal server error" }),
    );
    confirmAndSave();

    await waitFor(() =>
      expect(
        screen.getByText(/Saved on this device — will sync/i),
      ).toBeInTheDocument(),
    );
    await expect(getPendingEntries(INSPECTION_ID)).resolves.toHaveLength(1);
  });

  it("does not queue a 4xx — the technician must retry or fix the input", async () => {
    await reachConfirmForm();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(400, { error: "Location is required" }),
    );
    confirmAndSave();

    await waitFor(() =>
      expect(screen.getByText(/Location is required/i)).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/Saved on this device — will sync/i),
    ).not.toBeInTheDocument();
    await expect(getPendingEntries(INSPECTION_ID)).resolves.toHaveLength(0);
  });
});
