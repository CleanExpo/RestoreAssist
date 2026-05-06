/**
 * RA-1768 — verify drainQueue requests the navigator.locks `nir-sync-drain`
 * exclusive lock when the API is available, and falls back to direct call
 * when it isn't.
 *
 * Vitest runs in node env where `navigator` is undefined by default; we
 * stub `globalThis.navigator` per test so we can flip the API on/off.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { drainQueue } from "@/lib/nir-sync-queue";

describe("RA-1768 — drainQueue single-flight via navigator.locks", () => {
  beforeEach(() => {
    // drainQueue early-returns 0 if `typeof window === "undefined"`.
    // Stub a minimal window so we can exercise the lock path.
    vi.stubGlobal("window", {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("requests an exclusive lock with name 'nir-sync-drain' when navigator.locks is available", async () => {
    const requestSpy = vi.fn(
      async (
        _name: string,
        _opts: LockOptions,
        cb: (lock: object | null) => Promise<unknown>,
      ) => cb({}),
    );

    vi.stubGlobal("navigator", {
      onLine: true,
      locks: { request: requestSpy },
    });

    // The drain itself will fail because IDB isn't available in node, but
    // the lock-request side-effect happens BEFORE that and is what we pin.
    await drainQueue();

    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy.mock.calls[0][0]).toBe("nir-sync-drain");
    expect(requestSpy.mock.calls[0][1]).toEqual({ mode: "exclusive" });
    expect(typeof requestSpy.mock.calls[0][2]).toBe("function");
  });

  it("falls back to direct drain when navigator.locks is unavailable", async () => {
    vi.stubGlobal("navigator", {
      onLine: true,
      // No `locks` property — simulates older browsers
    });

    // Should not throw; should not crash on missing locks.
    // The actual drain returns 0 because IDB isn't available in node.
    const result = await drainQueue();
    expect(result).toBe(0);
  });

  it("returns 0 immediately when offline (skipping the lock entirely)", async () => {
    const requestSpy = vi.fn();
    vi.stubGlobal("navigator", {
      onLine: false,
      locks: { request: requestSpy },
    });

    const result = await drainQueue();

    expect(result).toBe(0);
    expect(requestSpy).not.toHaveBeenCalled();
  });
});
