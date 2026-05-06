/**
 * RA-1769 — type-contract tests for the failed-entry recovery exports.
 *
 * The IDB-touching paths (real reads/writes against the queue store) are
 * exercised by the Playwright e2e suite where a real browser provides
 * IndexedDB. Here we just pin that the module exports the new public
 * helpers and that the SyncQueueEntry type retains its shape.
 */

import { describe, expect, it } from "vitest";

import {
  getFailedEntries,
  retryFailedEntry,
  removeFailedEntry,
  type SyncQueueEntry,
} from "@/lib/nir-sync-queue";

describe("RA-1769 — failed-entry recovery API surface", () => {
  it("exports getFailedEntries as a function", () => {
    expect(typeof getFailedEntries).toBe("function");
  });

  it("exports retryFailedEntry as a function", () => {
    expect(typeof retryFailedEntry).toBe("function");
  });

  it("exports removeFailedEntry as a function", () => {
    expect(typeof removeFailedEntry).toBe("function");
  });

  it("SyncQueueEntry shape supports the failed status the recovery UI reads", () => {
    const entry: SyncQueueEntry = {
      id: "test-id",
      type: "sketch-save",
      endpoint: "/api/inspections/i1/sketches",
      method: "POST",
      payload: { floorNumber: 0, floorLabel: "Ground" },
      inspectionId: "i1",
      queuedAt: new Date().toISOString(),
      lastAttemptAt: new Date().toISOString(),
      retryCount: 1000,
      status: "failed",
    };
    expect(entry.status).toBe("failed");
    expect(entry.lastAttemptAt).toBeDefined();
  });
});
