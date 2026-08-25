import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  poolEnd: vi.fn(),
  dnsLookup: vi.fn(),
  execFileSync: vi.fn(),
}));

vi.mock("pg", () => ({
  Pool: class {
    query = h.poolQuery;
    end = h.poolEnd;
  },
}));

vi.mock("node:dns/promises", () => ({ lookup: h.dnsLookup }));
vi.mock("node:child_process", () => ({ execFileSync: h.execFileSync }));

vi.mock("@/lib/prisma", () => ({
  prisma: { workspace: { updateMany: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import {
  assertTenantConnectionString,
  testConnectivity,
  migrateTenantBaseline,
  verifyTenantSchemaTables,
  buildProvisionDeps,
} from "../provision-deps";

const wsUpdateMany = (
  prisma as unknown as { workspace: { updateMany: ReturnType<typeof vi.fn> } }
).workspace.updateMany;

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  h.poolEnd.mockResolvedValue(undefined);
  h.poolQuery.mockResolvedValue({
    rows: [
      { table_schema: "public", table_name: "Inspection" },
      { table_schema: "public", table_name: "UserRef" },
    ],
  });
  h.dnsLookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  wsUpdateMany.mockResolvedValue({ count: 1 });
  process.env.DATABASE_URL = "postgres://platform-user:pw@platform-host:5432/restoreassist";
  process.env.TENANT_DATABASE_HOST_ALLOWLIST =
    "tenant-host,direct-host,platform-host,dead-host,private-host,203.0.113.10";
  delete process.env.DIRECT_URL;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("assertTenantConnectionString — structural platform-DB guard", () => {
  it("passes a genuine allowlisted tenant connection string on public DNS", async () => {
    await expect(
      assertTenantConnectionString("postgres://t:pw@tenant-host:5432/acme?sslmode=verify-full"),
    ).resolves.toBeUndefined();
  });

  it("throws when the target matches DATABASE_URL even with different credentials", async () => {
    await expect(
      assertTenantConnectionString("postgres://other:secret@platform-host:5432/restoreassist?sslmode=verify-full"),
    ).rejects.toThrow(/platform database/i);
  });

  it("treats a different schema on the same physical database as the platform DB", async () => {
    await expect(
      assertTenantConnectionString(
        "postgres://other:secret@platform-host/restoreassist?schema=tenant&sslmode=verify-full",
      ),
    ).rejects.toThrow(/platform database/i);
    expect(h.dnsLookup).not.toHaveBeenCalled();
  });

  it("throws when the target matches DIRECT_URL", async () => {
    process.env.DIRECT_URL = "postgres://d:pw@direct-host:5432/restoreassist";
    await expect(
      assertTenantConnectionString("postgres://x:y@direct-host:5432/restoreassist?sslmode=verify-full"),
    ).rejects.toThrow(/platform database/i);
  });

  it("throws on an unparseable connection string rather than proceeding", async () => {
    await expect(assertTenantConnectionString("not a url")).rejects.toThrow(/valid/i);
  });

  it("fails closed when a managed hostname resolves to a private address", async () => {
    h.dnsLookup.mockResolvedValueOnce([{ address: "10.0.0.7", family: 4 }]);
    await expect(
      assertTenantConnectionString("postgres://t:pw@private-host:5432/acme?sslmode=verify-full"),
    ).rejects.toThrow(/private|loopback|link-local/i);
  });

  it.each([
    ["127.0.0.1", 4],
    ["169.254.169.254", 4],
    ["fd00::7", 6],
    ["fe80::7", 6],
  ])("rejects a DNS result in a denied network (%s)", async (address, family) => {
    h.dnsLookup.mockResolvedValueOnce([{ address, family }]);
    await expect(
      assertTenantConnectionString("postgres://t:pw@private-host:5432/acme?sslmode=verify-full"),
    ).rejects.toThrow(/private|loopback|link-local/i);
  });

  it("rejects a private IP literal without doing a DNS lookup", async () => {
    process.env.TENANT_DATABASE_HOST_ALLOWLIST += ",127.0.0.1";
    await expect(
      assertTenantConnectionString("postgres://t:pw@127.0.0.1:5432/acme?sslmode=verify-full"),
    ).rejects.toThrow(/private|loopback|link-local/i);
    expect(h.dnsLookup).not.toHaveBeenCalled();
  });

  it("rejects a query-parameter host override before DNS or database access", async () => {
    process.env.TENANT_DATABASE_HOST_ALLOWLIST += ",8.8.8.8";
    await expect(
      assertTenantConnectionString(
        "postgresql://u:p@8.8.8.8/tenant?host=127.0.0.1&sslmode=verify-full",
      ),
    ).rejects.toThrow(/unsupported parameter/i);
    expect(h.dnsLookup).not.toHaveBeenCalled();
    expect(h.poolQuery).not.toHaveBeenCalled();
  });
});

describe("verifyTenantSchemaTables", () => {
  it("rejects the control-plane sentinel before migration", async () => {
    h.poolQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "public", table_name: "DatabaseInstanceSentinel" }],
    });
    await expect(
      verifyTenantSchemaTables("postgres://t:pw@tenant-host:5432/acme?sslmode=verify-full", "pre"),
    ).rejects.toThrow(/control-plane.*sentinel/i);
  });

  it("allows an empty target before migration and requires both tenant tables after", async () => {
    h.poolQuery.mockResolvedValueOnce({ rows: [] });
    await expect(
      verifyTenantSchemaTables("postgres://t:pw@tenant-host:5432/acme?sslmode=verify-full", "pre"),
    ).resolves.toBeUndefined();

    h.poolQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "public", table_name: "Inspection" }],
    });
    await expect(
      verifyTenantSchemaTables("postgres://t:pw@tenant-host:5432/acme?sslmode=verify-full", "post"),
    ).rejects.toThrow(/required schema tables/i);
  });

  it("rejects unrelated tables in the target schema", async () => {
    h.poolQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "public", table_name: "Workspace" }],
    });
    await expect(
      verifyTenantSchemaTables("postgres://t:pw@tenant-host:5432/acme?sslmode=verify-full", "pre"),
    ).rejects.toThrow(/non-tenant tables/i);
  });
});

describe("migrateTenantBaseline — asserts target before touching the DB", () => {
  it("refuses to migrate the platform DB and never shells out", async () => {
    await expect(
      migrateTenantBaseline("postgres://x:y@platform-host:5432/restoreassist?sslmode=verify-full"),
    ).rejects.toThrow(/platform database/i);
    expect(h.execFileSync).not.toHaveBeenCalled();
  });

  it("runs prisma migrate deploy against a tenant connection", async () => {
    await migrateTenantBaseline("postgres://t:pw@tenant-host:5432/acme?sslmode=verify-full");
    expect(h.execFileSync).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = h.execFileSync.mock.calls[0];
    expect(cmd).toBe(process.execPath);
    expect(args[0]).toMatch(/node_modules\/prisma\/build\/index\.js$/);
    expect(args.slice(1, 3)).toEqual(["migrate", "deploy"]);
    expect(args.slice(3)).toEqual([
      "--config",
      expect.stringMatching(/prisma\/tenant\/prisma\.config\.ts$/),
    ]);
    expect(opts.env.TENANT_DATABASE_URL).toBe(
      "postgres://t:pw@tenant-host:5432/acme?sslmode=verify-full",
    );
    expect(opts.env.DATABASE_URL).toBeUndefined();
    expect(opts.env.DIRECT_URL).toBeUndefined();
    expect(opts.timeout).toBe(30_000);
    expect(opts.killSignal).toBe("SIGTERM");
  });

  it("caller cannot invoke the root Prisma migration command", async () => {
    await buildProvisionDeps("enc:old").migrate(
      "postgres://t:pw@tenant-host:5432/acme?sslmode=verify-full",
    );
    const [command, args] = h.execFileSync.mock.calls[0];
    expect(command).not.toBe("npx");
    expect(args).not.toEqual(["prisma", "migrate", "deploy"]);
    expect(args.join(" ")).toContain("prisma/tenant/prisma.config.ts");
    expect(args.join(" ")).not.toContain("prisma.config.ts migrate deploy");
  });

  it("rejects a control-plane sentinel and never shells out", async () => {
    h.poolQuery.mockResolvedValueOnce({
      rows: [{ table_schema: "public", table_name: "DatabaseInstanceSentinel" }],
    });
    await expect(
      migrateTenantBaseline("postgres://t:pw@tenant-host:5432/acme?sslmode=verify-full"),
    ).rejects.toThrow(/control-plane.*sentinel/i);
    expect(h.execFileSync).not.toHaveBeenCalled();
  });

  it("throws an opaque error (no connection string) when migrate fails", async () => {
    h.execFileSync.mockImplementation(() => {
      throw new Error("connect to postgres://t:pw@tenant-host:5432/acme refused");
    });
    await expect(
      migrateTenantBaseline("postgres://t:pw@tenant-host:5432/acme?sslmode=verify-full"),
    ).rejects.toThrow("Tenant baseline migration failed.");
    await expect(
      migrateTenantBaseline("postgres://t:pw@tenant-host:5432/acme?sslmode=verify-full"),
    ).rejects.not.toThrow(/tenant-host/);
  });
});

describe("testConnectivity", () => {
  it("returns true when SELECT 1 succeeds and disconnects", async () => {
    h.poolQuery.mockResolvedValue([{ "?column?": 1 }]);
    await expect(
      testConnectivity("postgres://t:pw@tenant-host/acme?sslmode=verify-full"),
    ).resolves.toBe(true);
    expect(h.poolEnd).toHaveBeenCalledTimes(1);
  });

  it("returns false when the DB is unreachable", async () => {
    h.poolQuery.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(
      testConnectivity("postgres://t:pw@dead-host/acme?sslmode=verify-full"),
    ).resolves.toBe(false);
    expect(h.poolEnd).toHaveBeenCalledTimes(1);
  });
});

describe("buildProvisionDeps.markReady", () => {
  it("flips status to ready and clears the resumable phase marker", async () => {
    await buildProvisionDeps("enc:old").markReady("w1");
    expect(wsUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "w1",
        tenantDbConnectionEnc: "enc:old",
        tenantDbStatus: { in: ["provisioning", "error"] },
      },
      data: { tenantDbStatus: "ready", tenantDbProvisionPhase: null },
    });
  });

  it("discards a stale ready result after a concurrent connection replacement", async () => {
    wsUpdateMany.mockResolvedValueOnce({ count: 0 });

    await expect(buildProvisionDeps("enc:old").markReady("w1")).rejects.toThrow(/stale/i);
    expect(wsUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantDbConnectionEnc: "enc:old" }),
      }),
    );
  });

  it("store is a no-op (connection is already persisted at onboarding)", async () => {
    await expect(
      buildProvisionDeps("enc:old").store("w1", "postgres://t/acme"),
    ).resolves.toBeUndefined();
    expect(wsUpdateMany).not.toHaveBeenCalled();
  });
});
