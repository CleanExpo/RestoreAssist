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

import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/credential-vault";
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

// RA-8075 — one stored API key that cannot be decrypted (key changed, or the
// row is corrupt) used to throw out of the loop, so no integration was probed
// and the bad row, never probed, sorted first again every day.
describe("runDrNrpgLiveness — RA-8075 undecryptable API key", () => {
  const GOOD_KEY = "good-row-plain-api-key";
  let goodCipher: string;
  let badCipher: string;
  let logSpies: Array<ReturnType<typeof vi.spyOn>>;

  beforeEach(() => {
    vi.stubEnv("CREDENTIAL_ENCRYPTION_KEY", "test-only-vault-key-ra8075");
    goodCipher = encrypt(GOOD_KEY);
    // Encrypted under a different key: decrypt with the current one throws.
    badCipher = encrypt("bad-row-plain-api-key", randomBytes(32));
    logSpies = (["log", "info", "warn", "error"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const row = (id: string, key: string) => ({
    id,
    userId: `u-${id}`,
    drNrpgApiKey: key,
    drNrpgBaseUrl: `https://${id}.example`,
  });

  it("probes the good row after an undecryptable one and counts one decrypt-failed failure", async () => {
    integ.findMany.mockResolvedValueOnce([
      row("bad", badCipher),
      row("good", goodCipher),
    ]);
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runDrNrpgLiveness();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://good.example");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      `Bearer ${GOOD_KEY}`,
    );
    expect(result.itemsProcessed).toBe(2);
    expect(result.metadata?.passed).toBe(1);
    expect(result.metadata?.failed).toBe(1);
    expect(result.metadata?.failures).toEqual([
      { id: "bad", userId: "u-bad", reason: "decrypt-failed" },
    ]);
  });

  it("deactivates the undecryptable row so it leaves the next run's isActive batch", async () => {
    integ.findMany.mockResolvedValueOnce([
      row("bad", badCipher),
      row("good", goodCipher),
    ]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200 }));

    const result = await runDrNrpgLiveness();

    expect(integ.update).toHaveBeenCalledWith({
      where: { id: "bad" },
      data: { isActive: false },
    });
    expect(result.metadata?.deactivated).toBe(1);
    // The next run selects only isActive rows, so the bad row no longer
    // takes the first slot of the least-recently-probed batch.
    expect(integ.findMany.mock.calls[0][0].where).toEqual({ isActive: true });
  });

  it("deactivates nothing when no encrypted row decrypts (suspected vault key misconfiguration)", async () => {
    const otherBad = encrypt("another-plain-api-key", randomBytes(32));
    integ.findMany.mockResolvedValueOnce([
      row("bad", badCipher),
      row("bad2", otherBad),
    ]);
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runDrNrpgLiveness();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(integ.update).not.toHaveBeenCalled();
    expect(result.metadata?.failed).toBe(2);
    expect(result.metadata?.deactivated).toBe(0);
    expect(result.metadata?.decryptKeySuspect).toBe(true);
  });

  it("never logs a stored cipher or a decrypted key", async () => {
    integ.findMany.mockResolvedValueOnce([
      row("bad", badCipher),
      row("good", goodCipher),
    ]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200 }));

    await runDrNrpgLiveness();

    const calls = logSpies.flatMap((s) => s.mock.calls);
    expect(calls.length).toBeGreaterThan(0);
    const text = calls
      .map((args) =>
        args
          .map((a: unknown) =>
            a instanceof Error ? `${a.message} ${a.stack}` : JSON.stringify(a),
          )
          .join(" "),
      )
      .join("\n");
    expect(text).toContain("bad");
    for (const value of [badCipher, goodCipher, GOOD_KEY]) {
      expect(text).not.toContain(value);
    }
  });
});
