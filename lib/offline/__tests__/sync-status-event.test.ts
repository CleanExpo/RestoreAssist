import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SYNC_QUEUE_CHANGED_EVENT,
  notifySyncQueueChanged,
} from "../sync-status-event";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("notifySyncQueueChanged", () => {
  it("dispatches one change event after the debounce", () => {
    vi.useFakeTimers();
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });

    notifySyncQueueChanged();
    notifySyncQueueChanged();
    vi.advanceTimersByTime(50);

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].type).toBe(SYNC_QUEUE_CHANGED_EVENT);
  });

  it("does not throw when the page has gone before the timer fires", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });

    notifySyncQueueChanged();
    vi.unstubAllGlobals();

    expect(() => vi.advanceTimersByTime(50)).not.toThrow();
  });
});
