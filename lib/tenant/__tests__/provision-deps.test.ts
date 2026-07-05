import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  disconnect: vi.fn(),
  execFileSync: vi.fn(),
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    $queryRaw = h.queryRaw;
    $disconnect = h.disconnect;
  },
}));

vi.mock("node:child_process", () => ({ execFileSync: h.execFileSync }));

vi.mock("@/lib/prisma", () => ({
  prisma: { workspace: { update: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import {
  assertTenantConnectionString,
  testConnectivity,
  migrateTenantBaseline,
  buildProvisionDeps,
} from "../provision-deps";

const wsUpdate = (prisma as unknown as { workspace: { update: ReturnType<typeof vi.fn> } })
  .workspace.update;

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  h.disconnect.mockResolvedValue(undefined);
  wsUpdate.mockResolvedValue({});
  process.env.DATABASE_URL = "postgres://platform-user:pw@platform-host:5432/restoreassist";
  delete process.env.DIRECT_URL;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("assertTenantConnectionString — structural platform-DB guard", () => {
  it("passes a genuine tenant connection string", () => {
    expect(() =>
      assertTenantConnectionString("postgres://t:pw@tenant-host:5432/acme"),
    ).not.toThrow();
  });

  it("throws when the target matches DATABASE_URL even with different credentials", () => {
    expect(() =>
      assertTenantConnectionString("postgres://other:secret@platform-host:5432/restoreassist"),
    ).toThrow(/platform database/i);
  });

  it("throws when the target matches DIRECT_URL", () => {
    process.env.DIRECT_URL = "postgres://d:pw@direct-host:5432/restoreassist";
    expect(() =>
      assertTenantConnectionString("postgres://x:y@direct-host:5432/restoreassist"),
    ).toThrow(/platform database/i);
  });

  it("throws on an unparseable connection string rather than proceeding", () => {
    expect(() => assertTenantConnectionString("not a url")).toThrow(/parseable/i);
  });
});

describe("migrateTenantBaseline — asserts target before touching the DB", () => {
  it("refuses to migrate the platform DB and never shells out", async () => {
    await expect(
      migrateTenantBaseline("postgres://x:y@platform-host:5432/restoreassist"),
    ).rejects.toThrow(/platform database/i);
    expect(h.execFileSync).not.toHaveBeenCalled();
  });

  it("runs prisma migrate deploy against a tenant connection", async () => {
    await migrateTenantBaseline("postgres://t:pw@tenant-host:5432/acme");
    expect(h.execFileSync).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = h.execFileSync.mock.calls[0];
    expect(cmd).toBe("npx");
    expect(args).toEqual(["prisma", "migrate", "deploy"]);
    expect(opts.env.DATABASE_URL).toBe("postgres://t:pw@tenant-host:5432/acme");
    expect(opts.env.DIRECT_URL).toBe("postgres://t:pw@tenant-host:5432/acme");
  });

  it("throws an opaque error (no connection string) when migrate fails", async () => {
    h.execFileSync.mockImplementation(() => {
      throw new Error("connect to postgres://t:pw@tenant-host:5432/acme refused");
    });
    await expect(
      migrateTenantBaseline("postgres://t:pw@tenant-host:5432/acme"),
    ).rejects.toThrow("Tenant baseline migration failed.");
    await expect(
      migrateTenantBaseline("postgres://t:pw@tenant-host:5432/acme"),
    ).rejects.not.toThrow(/tenant-host/);
  });
});

describe("testConnectivity", () => {
  it("returns true when SELECT 1 succeeds and disconnects", async () => {
    h.queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    await expect(testConnectivity("postgres://t:pw@tenant-host/acme")).resolves.toBe(true);
    expect(h.disconnect).toHaveBeenCalledTimes(1);
  });

  it("returns false when the DB is unreachable", async () => {
    h.queryRaw.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(testConnectivity("postgres://t:pw@dead-host/acme")).resolves.toBe(false);
    expect(h.disconnect).toHaveBeenCalledTimes(1);
  });
});

describe("buildProvisionDeps.markReady", () => {
  it("flips status to ready and clears the resumable phase marker", async () => {
    await buildProvisionDeps().markReady("w1");
    expect(wsUpdate).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { tenantDbStatus: "ready", tenantDbProvisionPhase: null },
    });
  });

  it("store is a no-op (connection is already persisted at onboarding)", async () => {
    await expect(buildProvisionDeps().store("w1", "postgres://t/acme")).resolves.toBeUndefined();
    expect(wsUpdate).not.toHaveBeenCalled();
  });
});
