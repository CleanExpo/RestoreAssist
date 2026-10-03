// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFetch } from "@/lib/hooks/useFetch";

describe("useFetch refresh completion", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports success only after fresh list data has been applied", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: ["old"] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: ["new"] }) });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useFetch<{ items: string[] }>("/api/items"));
    await waitFor(() => expect(result.current.data?.items).toEqual(["old"]));
    let succeeded = false;
    await act(async () => { succeeded = await result.current.refresh(); });
    expect(succeeded).toBe(true);
    expect(result.current.data?.items).toEqual(["new"]);
  });

  it("reports HTTP failures without replacing the last successful list", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: ["saved"] }) })
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: "Server Error" });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useFetch<{ items: string[] }>("/api/items"));
    await waitFor(() => expect(result.current.data?.items).toEqual(["saved"]));
    let succeeded = true;
    await act(async () => { succeeded = await result.current.refresh(); });
    expect(succeeded).toBe(false);
    expect(result.current.error).toContain("500");
    expect(result.current.data?.items).toEqual(["saved"]);
  });
});
