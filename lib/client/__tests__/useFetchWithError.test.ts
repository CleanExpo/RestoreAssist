// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFetchWithError } from "../useFetchWithError";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("structured resource reads", () => {
  it.each([false, true])("ignores a delayed body after URL identity changes (failure=%s)", async (isError) => {
    let resolveBody!: (value: unknown) => void;
    const delayedBody = new Promise((resolve) => { resolveBody = resolve; });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: !isError, status: isError ? 500 : 200, json: () => delayedBody })
      .mockResolvedValueOnce(Response.json({ owner: "b" }));
    vi.stubGlobal("fetch", fetchMock);
    const view = renderHook(({ url }) => useFetchWithError<{ owner: string }>(url), { initialProps: { url: "/a" } });
    await act(async () => {});
    view.rerender({ url: "/b" });
    await waitFor(() => expect(view.result.current.data).toEqual({ owner: "b" }));
    await act(async () => { resolveBody(isError ? { error: { code: "INTERNAL", message: "old failure" } } : { owner: "a" }); });
    expect(view.result.current.data).toEqual({ owner: "b" });
    expect(view.result.current.error).toBeNull();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("clears stale data when a request is disabled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ owner: "a" })));
    const view = renderHook(({ url }: { url: string | null }) => useFetchWithError(url), { initialProps: { url: "/a" as string | null } });
    await waitFor(() => expect(view.result.current.data).toEqual({ owner: "a" }));
    view.rerender({ url: null });
    expect(view.result.current.data).toBeNull();
    expect(view.result.current.error).toBeNull();
  });

  it("clears previously successful data when a retry hits a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ owner: "a" })).mockRejectedValueOnce(new TypeError("Failed to fetch")));
    const view = renderHook(() => useFetchWithError("/a"));
    await waitFor(() => expect(view.result.current.data).toEqual({ owner: "a" }));
    act(() => view.result.current.refetch());
    await waitFor(() => expect(view.result.current.error?.code).toBe("NETWORK"));
    expect(view.result.current.data).toBeNull();
  });
});
