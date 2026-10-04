/**
 * pgPoolTls — the TLS settings the `pg` pool really ends up with.
 *
 * Each case feeds pgPoolTls's output to pg's own ConnectionParameters, the
 * step that merges the URL and the options when a Pool connects, so the
 * assertion is on the effective setting, not on what we passed in. On the
 * 04/10/2026 prod outage a `?sslmode=require` URL resolved to a verifying
 * TLS config and every query failed with "self-signed certificate".
 */
import { describe, expect, it } from "vitest";
import ConnectionParameters from "pg/lib/connection-parameters";
import { pgPoolTls } from "@/lib/prisma-pool-config";

const BASE = "postgresql://doadmin:pw@db.example.com:25060/defaultdb";

function effectiveSsl(url: string) {
  return new ConnectionParameters(pgPoolTls(url)).ssl;
}

describe("pgPoolTls", () => {
  it("does not verify the certificate for a ?sslmode=require URL", () => {
    expect(effectiveSsl(`${BASE}?sslmode=require`)).toEqual({
      rejectUnauthorized: false,
    });
  });

  it("keeps the other query parameters when sslmode=require is removed", () => {
    expect(pgPoolTls(`${BASE}?sslmode=require&application_name=ra`)).toEqual({
      connectionString: `${BASE}?application_name=ra`,
      ssl: { rejectUnauthorized: false },
    });
    expect(
      pgPoolTls(`${BASE}?application_name=ra&sslmode=require&x=1`)
        .connectionString,
    ).toBe(`${BASE}?application_name=ra&x=1`);
  });

  it("does not verify when sslmode=require is repeated or followed by a fragment", () => {
    expect(effectiveSsl(`${BASE}?sslmode=require&sslmode=require`)).toEqual({
      rejectUnauthorized: false,
    });
    expect(effectiveSsl(`${BASE}?sslmode=require#primary`)).toEqual({
      rejectUnauthorized: false,
    });
  });

  it("leaves sslmode=no-verify to pg, which already skips verification", () => {
    const url = `${BASE}?sslmode=no-verify`;
    expect(pgPoolTls(url)).toEqual({ connectionString: url, ssl: undefined });
    expect(effectiveSsl(url)).toMatchObject({ rejectUnauthorized: false });
  });

  it("leaves a local URL without TLS", () => {
    const url = "postgresql://postgres:postgres@localhost:5432/test";
    expect(pgPoolTls(url)).toEqual({ connectionString: url, ssl: undefined });
    expect(effectiveSsl(url)).toBe(false);
  });

  it("uses TLS without verification for a Supabase URL", () => {
    expect(
      effectiveSsl("postgresql://u:p@db.abc.supabase.co:5432/postgres"),
    ).toEqual({ rejectUnauthorized: false });
  });
});
