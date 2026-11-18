// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useLatestFetch } from "../useLatestFetch";

// RA-8454: the shared latest-only request owner.

describe("useLatestFetch", () => {
  it("drops the older request once a newer one starts, and aborts it", () => {
    const { result } = renderHook(() => useLatestFetch());
    const older = result.current();
    expect(older.isLatest()).toBe(true);

    const newer = result.current();
    expect(older.isLatest()).toBe(false);
    expect(older.signal.aborted).toBe(true);
    expect(newer.isLatest()).toBe(true);
    expect(newer.signal.aborted).toBe(false);
  });

  it("ignores a reply that arrives after a newer request started", async () => {
    const { result } = renderHook(() => useLatestFetch());
    const shown: string[] = [];
    const load = async (value: string, wait: Promise<void>) => {
      const req = result.current();
      await wait;
      if (req.isLatest()) shown.push(value);
    };

    let releaseOld!: () => void;
    let releaseNew!: () => void;
    const oldDone = load("90 days", new Promise((r) => (releaseOld = r)));
    const newDone = load("7 days", new Promise((r) => (releaseNew = r)));

    releaseNew();
    await newDone;
    releaseOld();
    await oldDone;

    expect(shown).toEqual(["7 days"]);
  });

  it("aborts the in-flight request on unmount", () => {
    const { result, unmount } = renderHook(() => useLatestFetch());
    const req = result.current();
    unmount();
    expect(req.signal.aborted).toBe(true);
    expect(req.isLatest()).toBe(false);
  });

  it("returns a stable begin function across renders", () => {
    const { result, rerender } = renderHook(() => useLatestFetch());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
