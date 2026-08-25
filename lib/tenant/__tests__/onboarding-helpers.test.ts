import { afterEach, beforeEach, describe, it, expect } from "vitest";
import {
  validateConnectionString,
  canDeployFirstClaim,
  hostFromConnectionString,
  isAllowlistedTenantDatabaseHost,
  type TenantDbStatus,
} from "../onboarding-helpers";

const ORIGINAL_ALLOWLIST = process.env.TENANT_DATABASE_HOST_ALLOWLIST;

beforeEach(() => {
  process.env.TENANT_DATABASE_HOST_ALLOWLIST = "host,*.supabase.co,h.example.com";
});

afterEach(() => {
  if (ORIGINAL_ALLOWLIST === undefined) delete process.env.TENANT_DATABASE_HOST_ALLOWLIST;
  else process.env.TENANT_DATABASE_HOST_ALLOWLIST = ORIGINAL_ALLOWLIST;
});

describe("validateConnectionString", () => {
  it("accepts a Postgres URL", () => {
    expect(validateConnectionString("postgres://u:p@host:5432/db?sslmode=verify-full").ok).toBe(
      true,
    );
    expect(validateConnectionString("postgresql://u:p@host/db?sslmode=verify-full").ok).toBe(
      true,
    );
  });

  it("rejects a non-Postgres scheme (v1 is Postgres only)", () => {
    const r = validateConnectionString("mysql://u:p@host/db");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/postgres/i);
  });

  it("rejects an empty or malformed string", () => {
    expect(validateConnectionString("").ok).toBe(false);
    expect(validateConnectionString("not a url").ok).toBe(false);
  });

  it("rejects a Postgres URL with no host", () => {
    expect(validateConnectionString("postgres:///db").ok).toBe(false);
  });

  it("keeps structural validation browser-safe when the server allowlist is absent", () => {
    delete process.env.TENANT_DATABASE_HOST_ALLOWLIST;
    expect(validateConnectionString("postgres://u:p@host/db?sslmode=verify-full").ok).toBe(true);
    expect(isAllowlistedTenantDatabaseHost("host")).toBe(false);
  });

  it("supports exact and suffix-only wildcard managed hosts", () => {
    expect(isAllowlistedTenantDatabaseHost("host")).toBe(true);
    expect(isAllowlistedTenantDatabaseHost("db.abcdef.supabase.co")).toBe(true);
    expect(isAllowlistedTenantDatabaseHost("supabase.co")).toBe(false);
    expect(isAllowlistedTenantDatabaseHost("evil-supabase.co")).toBe(false);
  });

  it.each(["host", "hostaddr", "port", "database", "dbname", "options", "service"])(
    "rejects the PostgreSQL query-parameter identity override %s",
    (parameter) => {
      const result = validateConnectionString(
        `postgresql://u:p@host/tenant?${parameter}=127.0.0.1`,
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/unsupported parameter/i);
    },
  );

  it("requires certificate and hostname verification for tenant database TLS", () => {
    for (const suffix of ["", "?sslmode=disable", "?sslmode=allow", "?sslmode=prefer", "?sslmode=require", "?sslmode=verify-ca"]) {
      const result = validateConnectionString(`postgresql://u:p@host/tenant${suffix}`);
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/sslmode=verify-full/i);
    }
  });

  it("accepts one safe schema and verified TLS parameter but rejects duplicates", () => {
    expect(
      validateConnectionString(
        "postgresql://u:p@host/tenant?schema=tenant_one&sslmode=verify-full",
      ).ok,
    ).toBe(true);
    expect(
      validateConnectionString(
        "postgresql://u:p@host/tenant?schema=public&schema=other&sslmode=verify-full",
      ).ok,
    ).toBe(false);
  });

  it("bounds connection and pool parameters that can consume the worker budget", () => {
    for (const query of [
      "connect_timeout=999",
      "connection_limit=0",
      "pool_timeout=999",
      "statement_cache_size=1001",
      "pgbouncer=false",
      `application_name=${"a".repeat(65)}`,
    ]) {
      expect(
        validateConnectionString(
          `postgresql://u:p@host/tenant?sslmode=verify-full&${query}`,
        ).ok,
      ).toBe(false);
    }
  });
});

describe("hostFromConnectionString (confidence signal)", () => {
  it("returns the hostname with credentials stripped", () => {
    expect(
      hostFromConnectionString("postgres://user:secret@db.abcdef.supabase.co:5432/postgres"),
    ).toBe("db.abcdef.supabase.co");
  });

  it("never leaks the user or password", () => {
    const out = hostFromConnectionString("postgres://admin:hunter2@h.example.com/db");
    expect(out).not.toMatch(/admin|hunter2/);
  });

  it("returns null for an unparseable or empty string", () => {
    expect(hostFromConnectionString("not a url")).toBeNull();
    expect(hostFromConnectionString("")).toBeNull();
  });
});

describe("canDeployFirstClaim (tenantDbStatus gate)", () => {
  it("allows first claim only when the tenant DB is ready", () => {
    expect(canDeployFirstClaim("ready")).toBe(true);
  });

  it("blocks first claim in every non-ready state", () => {
    const blocked: TenantDbStatus[] = [
      "none",
      "provisioning",
      "error",
      "credential_error",
    ];
    for (const s of blocked) expect(canDeployFirstClaim(s)).toBe(false);
  });
});
