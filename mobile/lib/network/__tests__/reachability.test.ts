import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHealthCheckUrl, checkApiReachability } from "../reachability";

describe("mobile network reachability", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds the health URL without duplicate slashes", () => {
    expect(buildHealthCheckUrl("https://example.test/")).toBe(
      "https://example.test/api/health",
    );
  });

  it("returns true only for successful health responses", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: true } as Response)
      .mockResolvedValueOnce({ ok: false } as Response);

    await expect(checkApiReachability("https://example.test")).resolves.toBe(
      true,
    );
    await expect(checkApiReachability("https://example.test")).resolves.toBe(
      false,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/api/health",
      expect.objectContaining({
        method: "GET",
        headers: { Accept: "application/json" },
      }),
    );
  });

  it("returns false when the health check cannot reach the API", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    await expect(checkApiReachability("https://example.test")).resolves.toBe(
      false,
    );
  });
});
