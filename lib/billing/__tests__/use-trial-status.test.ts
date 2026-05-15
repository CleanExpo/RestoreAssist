// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import useTrialStatus from "../use-trial-status";

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Fresh SWR cache per test — prevents module-level cache leaks between cases.
const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(
    SWRConfig,
    { value: { provider: () => new Map(), dedupingInterval: 0 } },
    children,
  );

beforeEach(() => {
  mockFetch.mockReset();
});

describe("useTrialStatus", () => {
  it("returns undefined while loading", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useTrialStatus(), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });

  it("returns TrialStatus on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
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
  });
});
