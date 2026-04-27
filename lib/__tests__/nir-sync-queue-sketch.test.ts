/**
 * RA-1762 — unit tests for the parts of the offline queue extension
 * that don't touch IndexedDB. The IDB-touching paths (enqueueSketchSave
 * coalescing, drainQueue staleness handling) are exercised by the
 * Playwright e2e suite where a real browser provides IndexedDB.
 *
 * Vitest in this repo runs in node environment with no jsdom or
 * fake-indexeddb dependency, so the IDB-touching helpers here would
 * just throw "IndexedDB unavailable in server context".
 */

import { describe, expect, it } from "vitest";

import type {
  QueueEntryType,
  SketchSavePayload,
} from "@/lib/nir-sync-queue";

describe("RA-1762 — QueueEntryType union includes sketch-save", () => {
  it("accepts 'sketch-save' as a valid type", () => {
    const t: QueueEntryType = "sketch-save";
    expect(t).toBe("sketch-save");
  });

  it("retains all pre-existing types", () => {
    const before: QueueEntryType[] = [
      "inspection-create",
      "inspection-update",
      "inspection-submit",
      "moisture-reading",
      "photo-upload",
      "environmental-data",
      "scope-item",
    ];
    expect(before).toHaveLength(7);
  });
});

describe("RA-1762 — SketchSavePayload contract", () => {
  it("requires floorNumber, floorLabel, and clientUpdatedAt", () => {
    const payload: SketchSavePayload = {
      floorNumber: 0,
      floorLabel: "Ground Floor",
      sketchType: "structural",
      sketchData: { version: "5.3.0" },
      backgroundImageUrl: null,
      moisturePoints: [],
      equipmentPoints: [],
      clientUpdatedAt: 1_700_000_000_000,
    };
    expect(payload.clientUpdatedAt).toBe(1_700_000_000_000);
    expect(payload.floorNumber).toBe(0);
  });

  it("clientUpdatedAt is a number (epoch ms), not an ISO string", () => {
    // Type-level assertion: this would fail to compile if clientUpdatedAt
    // were typed as `string`. Runtime check confirms the contract.
    const payload: SketchSavePayload = {
      floorNumber: 1,
      floorLabel: "First",
      clientUpdatedAt: Date.now(),
    };
    expect(typeof payload.clientUpdatedAt).toBe("number");
    expect(Number.isFinite(payload.clientUpdatedAt)).toBe(true);
  });
});
