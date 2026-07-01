import { describe, it, expect } from "vitest";
import {
  validateConnectionString,
  canDeployFirstClaim,
  type TenantDbStatus,
} from "../onboarding-helpers";

describe("validateConnectionString", () => {
  it("accepts a Postgres URL", () => {
    expect(validateConnectionString("postgres://u:p@host:5432/db").ok).toBe(true);
    expect(validateConnectionString("postgresql://u:p@host/db").ok).toBe(true);
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
});

describe("canDeployFirstClaim (tenantDbStatus gate)", () => {
  it("allows first claim only when the tenant DB is ready", () => {
    expect(canDeployFirstClaim("ready")).toBe(true);
  });

  it("blocks first claim in every non-ready state", () => {
    const blocked: TenantDbStatus[] = ["none", "provisioning", "error"];
    for (const s of blocked) expect(canDeployFirstClaim(s)).toBe(false);
  });
});
