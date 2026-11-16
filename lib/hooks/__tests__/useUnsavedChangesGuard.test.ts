// @vitest-environment jsdom
/**
 * RA-8397 — the shared leave guard. Each case dispatches a real
 * `beforeunload` event and reads whether the handler cancelled it, so a
 * hook that registered nothing (or always registered) fails here.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, renderHook, cleanup } from "@testing-library/react";
import { useUnsavedChangesGuard } from "../useUnsavedChangesGuard";

function fireBeforeUnload(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useUnsavedChangesGuard", () => {
  it("warns on tab close or refresh while the form is dirty", () => {
    const add = vi.spyOn(window, "addEventListener");
    renderHook(() => useUnsavedChangesGuard(true));
    expect(add.mock.calls.some(([type]) => type === "beforeunload")).toBe(true);
    expect(fireBeforeUnload()).toBe(true);
  });

  it("registers nothing and does not warn while the form is clean", () => {
    const add = vi.spyOn(window, "addEventListener");
    renderHook(() => useUnsavedChangesGuard(false));
    expect(add.mock.calls.some(([type]) => type === "beforeunload")).toBe(
      false,
    );
    expect(fireBeforeUnload()).toBe(false);
  });

  it("stops warning once the form becomes clean again", () => {
    const { rerender } = renderHook(
      ({ dirty }) => useUnsavedChangesGuard(dirty),
      { initialProps: { dirty: true } },
    );
    expect(fireBeforeUnload()).toBe(true);
    rerender({ dirty: false });
    expect(fireBeforeUnload()).toBe(false);
  });

  it("does not warn after a successful save, even before a re-render", async () => {
    const { result } = renderHook(() => useUnsavedChangesGuard(true));
    // Same tick as markSaved, the way a page calls router.push straight after.
    result.current.markSaved();
    expect(fireBeforeUnload()).toBe(false);
    await expect(result.current.confirmLeave()).resolves.toBe(true);
  });

  it("lets an in-app leave go at once when nothing was typed", async () => {
    const { result } = renderHook(() => useUnsavedChangesGuard(false));
    await expect(result.current.confirmLeave()).resolves.toBe(true);
  });

  it("holds an in-app leave for a confirm step when the form is dirty", async () => {
    const { result } = renderHook(() => useUnsavedChangesGuard(true));
    let settled = false;
    let answer: boolean | undefined;
    await act(async () => {
      void result.current.confirmLeave().then((ok) => {
        settled = true;
        answer = ok;
      });
    });
    // Still waiting on the person: the leave has not happened.
    expect(settled).toBe(false);
    expect(answer).toBeUndefined();
  });
});
