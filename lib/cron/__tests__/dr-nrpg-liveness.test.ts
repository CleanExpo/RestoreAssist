import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => {
  const tx = {
    drNrpgIntegration: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
  return { prisma: tx };
});

import { prisma } from "@/lib/prisma";
import { runDrNrpgLiveness } from "../dr-nrpg-liveness";

const integ = (
  prisma as unknown as {
    drNrpgIntegration: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  }
).drNrpgIntegration;

beforeEach(() => {
  vi.clearAllMocks();
  integ.update.mockResolvedValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runDrNrpgLiveness — bounded ordered batch", () => {
  it("queries with a bounded take and least-recently-probed-first ordering", async () => {
    integ.findMany.mockResolvedValueOnce([]);

    await runDrNrpgLiveness();

    expect(integ.findMany).toHaveBeenCalledTimes(1);
    const arg = integ.findMany.mock.calls[0][0];

    // Bounded so a slow run can't be killed mid-loop and starve later
    // integrations (a revoked tail key would go undetected).
    expect(typeof arg.take).toBe("number");
    expect(arg.take).toBeGreaterThan(0);

    // Ordered least-recently-probed first (never-probed = lastSyncAt NULL).
    expect(arg.orderBy).toEqual({
      lastSyncAt: { sort: "asc", nulls: "first" },
    });

    expect(arg.where).toEqual({ isActive: true });
  });

  it("probes every integration in the returned batch and records success", async () => {
    integ.findMany.mockResolvedValueOnce([
      {
        id: "i1",
        userId: "u1",
        drNrpgApiKey: "k1",
        drNrpgBaseUrl: "https://a.example",
      },
      {
        id: "i2",
        userId: "u2",
        drNrpgApiKey: "k2",
        drNrpgBaseUrl: "https://b.example",
      },
    ]);

    const fetchMock = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runDrNrpgLiveness();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Two lastSyncAt writes on success.
    expect(integ.update).toHaveBeenCalledTimes(2);
    expect(result.itemsProcessed).toBe(2);
    expect(result.metadata?.passed).toBe(2);
  });

  it("deactivates a stale integration after an auth failure", async () => {
    integ.findMany.mockResolvedValueOnce([
      {
        id: "i1",
        userId: "u1",
        drNrpgApiKey: "revoked",
        drNrpgBaseUrl: "https://a.example",
      },
    ]);
    // lastSyncAt older than 72h => stale.
    integ.findUnique.mockResolvedValueOnce({
      lastSyncAt: new Date(Date.now() - 100 * 60 * 60 * 1000),
    });

    const fetchMock = vi.fn().mockResolvedValue({ status: 401 });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runDrNrpgLiveness();

    expect(result.metadata?.failed).toBe(1);
    expect(result.metadata?.deactivated).toBe(1);
    expect(integ.update).toHaveBeenCalledWith({
      where: { id: "i1" },
      data: { isActive: false },
    });
  });

  it("returns early when there are no active integrations", async () => {
    integ.findMany.mockResolvedValueOnce([]);

    const result = await runDrNrpgLiveness();

    expect(result.itemsProcessed).toBe(0);
    expect(result.metadata?.reason).toBe("no-active-integrations");
  });
});
