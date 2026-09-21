// @vitest-environment jsdom
/**
 * RA-7605 — offline save from EnvironmentalConfirm must land in the RA-1124
 * NIR sync queue and drain exactly once on reconnect.
 *
 * Same no-silent-drop bar as RA-7568 / #2233, RA-7602 / #2237, and
 * RA-7604 / #2239 (MeterPhotoCapture moisture). This file drives the live
 * component against the real queueWrite / drainQueue helpers (shared
 * in-memory IndexedDB fake). Mocking the queue away would let a
 * "queues when offline" assertion pass while still losing the reading.
 *
 * Does not reopen RA-7604 — moisture cases stay in
 * MeterPhotoCapture.offline.test.tsx.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { installFakeIndexedDB } from "@/lib/__tests__/helpers/fake-indexeddb";

const INSPECTION_ID = "insp-ra-7605";
const ENVIRONMENTAL_ENDPOINT = `/api/inspections/${INSPECTION_ID}/environmental`;

const FIXTURE_PATH = join(
  process.cwd(),
  "lib/vision/__tests__/fixtures/moisture-meter-18-5.png",
);
const FIXTURE_BYTES = readFileSync(FIXTURE_PATH);

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

async function reachConfirmForm(props?: { onReadingAccepted?: () => void }) {
  render(
    <MeterPhotoCapture
      inspectionId={INSPECTION_ID}
      mode="environmental"
      onReadingAccepted={props?.onReadingAccepted}
    />,
  );
  await attachMeterPhoto();
  fireEvent.click(
    screen.getByRole("button", { name: /Analyse meter photo with AI/i }),
  );
  await waitFor(() => {
    expect(
      screen.getByText(/Confirm Environmental Reading/i),
    ).toBeInTheDocument();
  });
}

function confirmAndSave({
  temp = "22.4",
  rh = "55",
  dew = "12.1",
}: { temp?: string; rh?: string; dew?: string } = {}) {
  const inputs = screen.getAllByRole("spinbutton");
  fireEvent.change(inputs[0], { target: { value: temp } });
  fireEvent.change(inputs[1], { target: { value: rh } });
  fireEvent.change(inputs[2], { target: { value: dew } });
  fireEvent.click(screen.getByRole("button", { name: /Apply to Inspection/i }));
}

describe("MeterPhotoCapture EnvironmentalConfirm — offline queue (RA-7605)", () => {
  it("queues an offline save, shows the local-sync copy, and drains exactly one write on reconnect", async () => {
    await reachConfirmForm();
    expect(fetch).not.toHaveBeenCalled();

    setOnline(false);
    confirmAndSave();

    await waitFor(() =>
      expect(
        screen.getByText(/Saved on this device — will sync/i),
      ).toBeInTheDocument(),
    );
    expect(fetch).not.toHaveBeenCalled();

    const pending = await getPendingEntries(INSPECTION_ID);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      type: "environmental-data",
      endpoint: ENVIRONMENTAL_ENDPOINT,
      method: "POST",
      status: "pending",
    });
    expect(pending[0].payload).toMatchObject({
      ambientTemperature: 22.4,
      humidityLevel: 55,
      dewPoint: 12.1,
    });

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(201, { environmentalData: { id: "env-1" } }),
    );
    setOnline(true);
    const synced = await drainQueue();
    expect(synced).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(ENVIRONMENTAL_ENDPOINT);
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("Idempotency-Key")).toBe(pending[0].id);
    expect(headers.get("X-RestoreAssist-Mutation-Id")).toBe(pending[0].id);
    expect(JSON.parse(String(init.body))).toMatchObject({
      ambientTemperature: 22.4,
      humidityLevel: 55,
      dewPoint: 12.1,
    });

    const afterDrain = await drainQueue();
    expect(afterDrain).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(getPendingEntries(INSPECTION_ID)).resolves.toHaveLength(0);
  });

  it("retries an environmental 409 instead of dropping the queued reading, then syncs once", async () => {
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
        json: async () => ({ environmentalData: { id: "env-1" } }),
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
    expect(pending[0].type).toBe("environmental-data");
  });

  it("posts directly when online and the route succeeds (regression guard)", async () => {
    const onReadingAccepted = vi.fn();
    await reachConfirmForm({ onReadingAccepted });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(201, { environmentalData: { id: "env-online" } }),
    );
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(201, {}),
    );
    confirmAndSave();

    await waitFor(() => {
      expect(
        (fetch as ReturnType<typeof vi.fn>).mock.calls.some(
          (call) => call[0] === ENVIRONMENTAL_ENDPOINT,
        ),
      ).toBe(true);
    });
    const envCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => call[0] === ENVIRONMENTAL_ENDPOINT,
    ) as [string, RequestInit];
    const [url, init] = envCall;
    expect(url).toBe(ENVIRONMENTAL_ENDPOINT);
    const headers = new Headers(init.headers);
    expect(headers.get("Idempotency-Key")).toBeTruthy();
    expect(headers.get("X-RestoreAssist-Mutation-Id")).toBe(
      headers.get("Idempotency-Key"),
    );
    expect(
      screen.queryByText(/Saved on this device — will sync/i),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(onReadingAccepted).toHaveBeenCalledTimes(1));
    await expect(getPendingEntries(INSPECTION_ID)).resolves.toHaveLength(0);
  });

  it("queues when the environmental route returns a 5xx", async () => {
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

  it("does not ask the parent to refetch after a queued save — banner stays, no load-failure toast", async () => {
    // Mirrors /dashboard/inspections/[id]: onReadingAccepted always
    // fetchInspection()s. That setLoading(true) unmounts this card and,
    // offline, toasts "Failed to load inspection" even though the reading
    // is queued — the Bugbot medium on #2239, now on the environmental path.
    const toastError = vi.fn();
    const onReadingAccepted = vi.fn(() => {
      void fetch(`/api/inspections/${INSPECTION_ID}`)
        .then((res) => {
          if (!res.ok) toastError("Failed to load inspection");
        })
        .catch(() => {
          toastError("Failed to load inspection");
        });
    });

    await reachConfirmForm({ onReadingAccepted });
    setOnline(false);
    confirmAndSave();

    await waitFor(() =>
      expect(
        screen.getByText(/Saved on this device — will sync/i),
      ).toBeInTheDocument(),
    );

    expect(onReadingAccepted).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(
      (fetch as ReturnType<typeof vi.fn>).mock.calls.some(
        (call) => call[0] === `/api/inspections/${INSPECTION_ID}`,
      ),
    ).toBe(false);
    expect(
      screen.getByText(/Thermo-Hygrometer — Photo OCR/i),
    ).toBeInTheDocument();

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse(201, { environmentalData: { id: "env-1" } }),
    );
    setOnline(true);
    expect(await drainQueue()).toBe(1);
    const envPosts = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call) => call[0] === ENVIRONMENTAL_ENDPOINT,
    );
    expect(envPosts).toHaveLength(1);
    const headers = new Headers((envPosts[0][1] as RequestInit).headers);
    expect(headers.get("Idempotency-Key")).toBeTruthy();
    expect(await drainQueue()).toBe(0);
    await expect(getPendingEntries(INSPECTION_ID)).resolves.toHaveLength(0);
    expect(
      screen.getByText(/Saved on this device — will sync/i),
    ).toBeInTheDocument();
  });

  it("does not queue a 4xx — the technician must retry or fix the input", async () => {
    await reachConfirmForm();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse(400, {
        error: "Temperature must be between -20°C and 55°C",
      }),
    );
    confirmAndSave({ temp: "99" });

    await waitFor(() =>
      expect(
        screen.getByText(/Temperature must be between -20°C and 55°C/i),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/Saved on this device — will sync/i),
    ).not.toBeInTheDocument();
    await expect(getPendingEntries(INSPECTION_ID)).resolves.toHaveLength(0);
  });
});
