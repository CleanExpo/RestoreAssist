// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("notifySyncQueueChanged", () => {
  it("does not throw when the page is gone before the debounced event fires", async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const { notifySyncQueueChanged } = await import("../sync-status-event");
    notifySyncQueueChanged();
    // jsdom teardown removes window while the 50 ms timer is still pending.
    vi.stubGlobal("window", undefined);
    expect(() => vi.advanceTimersByTime(60)).not.toThrow();
  });
});
