import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetExpoSqliteMock } from "expo-sqlite";

async function loadEngine() {
  vi.resetModules();
  __resetExpoSqliteMock();
  const { useAppStore } = await import("@/lib/store");
  useAppStore.setState({
    syncStatus: "idle",
    queuedMutationCount: 0,
    failedMutationCount: 0,
    syncError: null,
    refreshCounter: 0,
  });
  const engine = await import("../engine");
  return { ...engine, useAppStore };
}

function jsonResponse(status = 200, body: unknown = { ok: true }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("mobile offline sync engine", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("persists queued mutations and returns the existing row for duplicate mutation ids", async () => {
    const { getQueuedMutation, queueJsonMutation, useAppStore } =
      await loadEngine();

    const queued = await queueJsonMutation({
      mutationId: "ra-test-duplicate",
      type: "moisture-reading",
      endpoint: "/api/inspections/insp_1/moisture",
      method: "POST",
      body: JSON.stringify({ location: "Kitchen", moistureLevel: 22 }),
      inspectionId: "insp_1",
    });

    const duplicate = await queueJsonMutation({
      mutationId: "ra-test-duplicate",
      type: "moisture-reading",
      endpoint: "/api/inspections/insp_1/moisture",
      method: "POST",
      body: JSON.stringify({ location: "Kitchen", moistureLevel: 22 }),
      inspectionId: "insp_1",
    });

    expect(duplicate).toEqual(queued);
    await expect(getQueuedMutation("ra-test-duplicate")).resolves.toMatchObject({
      id: "ra-test-duplicate",
      status: "pending",
      retryCount: 0,
    });
    expect(useAppStore.getState().queuedMutationCount).toBe(1);
  });

  it("replays pending mutations with idempotency headers and removes successful rows", async () => {
    const {
      getQueuedMutation,
      queueJsonMutation,
      replayQueuedMutations,
      useAppStore,
    } = await loadEngine();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse());

    await queueJsonMutation({
      mutationId: "ra-test-sync-ok",
      type: "environmental-data",
      endpoint: "/api/inspections/insp_2/environmental",
      method: "POST",
      body: JSON.stringify({ humidityLevel: 63 }),
      inspectionId: "insp_2",
    });

    await expect(replayQueuedMutations("https://example.test")).resolves.toBe(1);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/api/inspections/insp_2/environmental",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "Idempotency-Key": "ra-test-sync-ok",
          "X-RestoreAssist-Mutation-Id": "ra-test-sync-ok",
        }),
      }),
    );
    await expect(getQueuedMutation("ra-test-sync-ok")).resolves.toBeNull();
    expect(useAppStore.getState().queuedMutationCount).toBe(0);
    expect(useAppStore.getState().refreshCounter).toBe(1);
  });

  it("keeps retryable server failures pending and surfaces failed rows after max retries", async () => {
    const {
      getQueuedMutation,
      queueJsonMutation,
      replayQueuedMutations,
      useAppStore,
    } = await loadEngine();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(503, { error: "temporarily unavailable" }),
    );

    await queueJsonMutation({
      mutationId: "ra-test-retry",
      type: "affected-area",
      endpoint: "/api/inspections/insp_3/affected-areas",
      method: "POST",
      body: JSON.stringify({ roomZoneId: "kitchen" }),
      inspectionId: "insp_3",
    });

    await replayQueuedMutations("https://example.test");
    await expect(getQueuedMutation("ra-test-retry")).resolves.toMatchObject({
      status: "pending",
      retryCount: 1,
      lastError: "Server returned 503",
    });

    for (let i = 0; i < 4; i++) {
      await replayQueuedMutations("https://example.test");
    }

    await expect(getQueuedMutation("ra-test-retry")).resolves.toMatchObject({
      status: "failed",
      retryCount: 5,
      lastError: "Server returned 503",
    });
    expect(useAppStore.getState().queuedMutationCount).toBe(0);
    expect(useAppStore.getState().failedMutationCount).toBe(1);
  });
});
