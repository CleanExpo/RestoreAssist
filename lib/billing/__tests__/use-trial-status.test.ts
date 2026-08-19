// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import useTrialStatus from "../use-trial-status";

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

const mockUseSession = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

// Fresh SWR cache per test — prevents module-level cache leaks between cases.
const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), dedupingInterval: 0 } },
    children,
  );

beforeEach(() => {
  mockFetch.mockReset();
  mockUseSession.mockReturnValue({ status: "authenticated", data: { user: { id: "u1" } } });
});

describe("useTrialStatus", () => {
  it("returns undefined while loading", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useTrialStatus(), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });

  it("skips fetch while session is loading", () => {
    mockUseSession.mockReturnValue({ status: "loading", data: null });
    const { result } = renderHook(() => useTrialStatus(), { wrapper });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });

  it("skips fetch when unauthenticated", () => {
    mockUseSession.mockReturnValue({ status: "unauthenticated", data: null });
    renderHook(() => useTrialStatus(), { wrapper });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns TrialStatus on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          daysRemaining: 5,
          showCountdownBanner: false,
          showHardWall: false,
        },
      }),
    });
    const { result } = renderHook(() => useTrialStatus(), { wrapper });
    await waitFor(() => expect(result.current.data?.daysRemaining).toBe(5));
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/billing/trial-status",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("soft-handles 401 without throwing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
    });
    const { result } = renderHook(() => useTrialStatus(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeUndefined();
  });
});
