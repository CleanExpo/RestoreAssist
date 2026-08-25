import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "node:crypto";

const applyRateLimit = vi.fn();
const queryRaw = vi.fn();

vi.mock("@/lib/rate-limiter", () => ({
  applyRateLimit: (...args: unknown[]) => applyRateLimit(...args),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: (...args: unknown[]) => queryRaw(...args) },
}));

import { GET } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  applyRateLimit.mockResolvedValue(null);
  queryRaw.mockResolvedValue([
    {
      migration_name: "20260822000000_init",
      finished_at: new Date("2026-08-22T00:00:00Z"),
      rolled_back_at: null,
      applied_steps_count: 1,
      database_name: "postgres",
      schema_name: "public",
      instance_sentinel: "11111111-1111-4111-8111-111111111111",
      server_address: "10.0.0.7",
      server_port: 5432,
    },
  ]);
});

describe("GET /api/health/migrations", () => {
  it("uses memory-only rate limiting before the migration query", async () => {
    const request = new NextRequest("http://localhost/api/health/migrations");
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(applyRateLimit).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ memoryOnly: true }),
    );
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(response.headers.get("cache-control")).toBe(
      "no-store, must-revalidate",
    );
  });

  it("reports the direct connection's logical fingerprint through a pooled runtime endpoint", async () => {
    // Poolers intentionally have a different host and port from DIRECT_URL.
    // The migration-owned sentinel proves the same physical database instance.
    queryRaw.mockResolvedValueOnce([
      {
        migration_name: "20260822000000_init",
        finished_at: new Date("2026-08-22T00:00:00Z"),
        rolled_back_at: null,
        applied_steps_count: 1,
        database_name: "postgres",
        schema_name: "public",
        instance_sentinel: "11111111-1111-4111-8111-111111111111",
        server_address: "aws-0-ap-southeast-2.pooler.supabase.com",
        server_port: 6543,
      },
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/health/migrations"),
    );
    const payload = await response.json();
    const directFingerprint = createHash("sha256")
      .update(
        "restoreassist-logical-db-v2\0postgres\0public\0" +
          "11111111-1111-4111-8111-111111111111",
      )
      .digest("hex");

    expect(response.status).toBe(200);
    expect(payload.databaseFingerprint).toBe(directFingerprint);
  });

  it("produces a mismatch-detectable fingerprint for the wrong database or schema", async () => {
    const row = {
      migration_name: "20260822000000_init",
      finished_at: new Date("2026-08-22T00:00:00Z"),
      rolled_back_at: null,
      applied_steps_count: 1,
      database_name: "postgres",
      schema_name: "public",
      instance_sentinel: "11111111-1111-4111-8111-111111111111",
    };
    queryRaw.mockResolvedValueOnce([row]);
    queryRaw.mockResolvedValueOnce([{ ...row, database_name: "decoy" }]);
    queryRaw.mockResolvedValueOnce([{ ...row, schema_name: "decoy" }]);
    queryRaw.mockResolvedValueOnce([
      { ...row, instance_sentinel: "22222222-2222-4222-8222-222222222222" },
    ]);

    const request = new NextRequest("http://localhost/api/health/migrations");
    const direct = await (await GET(request)).json();
    const wrongDatabase = await (await GET(request)).json();
    const wrongSchema = await (await GET(request)).json();
    const wrongInstance = await (await GET(request)).json();

    expect(direct.databaseFingerprint).not.toBe(wrongDatabase.databaseFingerprint);
    expect(direct.databaseFingerprint).not.toBe(wrongSchema.databaseFingerprint);
    expect(direct.databaseFingerprint).not.toBe(wrongInstance.databaseFingerprint);
  });

  it("marks rate-limit responses as non-cacheable", async () => {
    applyRateLimit.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
      }),
    );

    const response = await GET(
      new NextRequest("http://localhost/api/health/migrations"),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe(
      "no-store, must-revalidate",
    );
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("treats a successful retry as healthy after a historical rollback", async () => {
    queryRaw.mockResolvedValueOnce([
      {
        migration_name: "retry",
        finished_at: null,
        rolled_back_at: new Date("2026-08-21T00:00:00Z"),
        applied_steps_count: 0,
      database_name: "postgres",
      schema_name: "public",
      instance_sentinel: "11111111-1111-4111-8111-111111111111",
      server_address: "10.0.0.7",
        server_port: 5432,
      },
      {
        migration_name: "retry",
        finished_at: new Date("2026-08-22T00:00:00Z"),
        rolled_back_at: null,
        applied_steps_count: 1,
      database_name: "postgres",
      schema_name: "public",
      instance_sentinel: "11111111-1111-4111-8111-111111111111",
      server_address: "10.0.0.7",
        server_port: 5432,
      },
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/health/migrations"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      counts: { applied: 1, failed: 0, rolled_back: 0, total: 1 },
    });
  });

  it("fails on a rollback-only migration without exposing its name", async () => {
    queryRaw.mockResolvedValueOnce([
      {
        migration_name: "internal_security_feature",
        finished_at: null,
        rolled_back_at: new Date("2026-08-22T00:00:00Z"),
        applied_steps_count: 0,
      database_name: "postgres",
      schema_name: "public",
      instance_sentinel: "11111111-1111-4111-8111-111111111111",
      server_address: "10.0.0.7",
        server_port: 5432,
      },
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/health/migrations"),
    );
    const payload = await response.json();
    expect(response.status).toBe(503);
    expect(payload).toMatchObject({
      status: "drift",
      counts: { applied: 0, failed: 0, rolled_back: 1, total: 1 },
    });
    expect(JSON.stringify(payload)).not.toContain("internal_security_feature");
  });

  it("fails on an unresolved attempt even when another attempt succeeded", async () => {
    queryRaw.mockResolvedValueOnce([
      {
        migration_name: "stuck",
        finished_at: new Date("2026-08-21T00:00:00Z"),
        rolled_back_at: null,
        applied_steps_count: 1,
      database_name: "postgres",
      schema_name: "public",
      instance_sentinel: "11111111-1111-4111-8111-111111111111",
      server_address: "10.0.0.7",
        server_port: 5432,
      },
      {
        migration_name: "stuck",
        finished_at: null,
        rolled_back_at: null,
        applied_steps_count: 0,
      database_name: "postgres",
      schema_name: "public",
      instance_sentinel: "11111111-1111-4111-8111-111111111111",
      server_address: "10.0.0.7",
        server_port: 5432,
      },
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/health/migrations"),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      counts: { applied: 0, failed: 1, rolled_back: 0, total: 1 },
    });
  });

  it("fails closed when the migration ledger is empty", async () => {
    queryRaw.mockResolvedValueOnce([]);
    const response = await GET(
      new NextRequest("http://localhost/api/health/migrations"),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: "drift",
      counts: { applied: 0, failed: 0, rolled_back: 0, total: 0 },
    });
  });

  it("fails closed when the logical database identity is incomplete", async () => {
    queryRaw.mockResolvedValueOnce([
      {
        migration_name: "20260822000000_init",
        finished_at: new Date("2026-08-22T00:00:00Z"),
        rolled_back_at: null,
        applied_steps_count: 1,
        database_name: "postgres",
        schema_name: null,
        instance_sentinel: "11111111-1111-4111-8111-111111111111",
      },
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/health/migrations"),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: "drift",
      databaseFingerprint: null,
    });
  });

  it("fails closed when the migration ledger cannot be read", async () => {
    queryRaw.mockRejectedValueOnce(new Error("ledger unavailable"));
    const response = await GET(
      new NextRequest("http://localhost/api/health/migrations"),
    );

    expect(response.status).toBe(503);
    const payload = await response.json();
    expect(payload).toMatchObject({ status: "drift" });
    expect(JSON.stringify(payload)).not.toContain("_prisma_migrations");
    expect(response.headers.get("cache-control")).toBe(
      "no-store, must-revalidate",
    );
  });
});
