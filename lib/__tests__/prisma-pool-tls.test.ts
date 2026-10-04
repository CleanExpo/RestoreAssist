/**
 * pgPoolTls — the TLS settings the `pg` pool really ends up with.
 *
 * Each case feeds pgPoolTls's output to pg's own ConnectionParameters, the
 * step that merges the URL and the options when a Pool connects, so the
 * assertion is on the effective setting, not on what we passed in. On the
 * 04/10/2026 prod outage a `?sslmode=require` URL resolved to a verifying
 * TLS config and every query failed with "self-signed certificate".
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

  it("follows the sslmode pg actually uses when modes are mixed (the last one)", () => {
    // Ends in verify-full: pg verifies, and so must we.
    expect(pgPoolTls(`${BASE}?sslmode=require&sslmode=verify-full`)).toEqual({
      connectionString: `${BASE}?sslmode=require&sslmode=verify-full`,
      ssl: undefined,
    });
    expect(
      effectiveSsl(`${BASE}?sslmode=require&sslmode=verify-full`),
    ).not.toMatchObject({ rejectUnauthorized: false });
    // Ends in require: treated like a plain require, whatever came first.
    expect(effectiveSsl(`${BASE}?sslmode=no-verify&sslmode=require`)).toEqual({
      rejectUnauthorized: false,
    });
    expect(effectiveSsl(`${BASE}?sslmode=verify-full&sslmode=require`)).toEqual(
      { rejectUnauthorized: false },
    );
  });

  it.each([
    "ssl=true",
    "ssl=0",
    "sslrootcert=/dev/null",
    "sslcert=/dev/null",
    "sslkey=/dev/null",
    "sslnegotiation=direct",
    "uselibpqcompat=true",
  ])("leaves require with %s exactly as pg reads it", (extra) => {
    const url = `${BASE}?sslmode=require&${extra}`;
    expect(pgPoolTls(url).connectionString).toBe(url);
    expect(effectiveSsl(url)).toEqual(
      new ConnectionParameters({ connectionString: url }).ssl,
    );
  });

  it("reads the sslmode case-insensitively, as pg does", () => {
    expect(effectiveSsl(`${BASE}?sslmode=REQUIRE`)).toEqual({
      rejectUnauthorized: false,
    });
    expect(effectiveSsl(`${BASE}?sslmode=require&sslmode=Require`)).toEqual({
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

  it("is used by every TypeScript pg Pool built from a connection string", () => {
    const files = execFileSync(
      "git",
      ["ls-files", "--", "app", "lib", "scripts", "prisma", "*.ts"],
      { encoding: "utf8" },
    )
      .split("\n")
      .filter((f) => f.endsWith(".ts") && !/__tests__|\.test\.ts$/.test(f));
    // The argument text of every `new Pool(...)` call, parentheses balanced.
    const poolArgs = (src: string) => {
      const args: string[] = [];
      for (let at = src.indexOf("new Pool("); at !== -1;) {
        let depth = 0;
        let end = at + "new Pool".length;
        do {
          if (src[end] === "(") depth++;
          if (src[end] === ")") depth--;
          end++;
        } while (depth > 0 && end < src.length);
        args.push(src.slice(at, end));
        at = src.indexOf("new Pool(", end);
      }
      return args;
    };
    const bare = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      // Migrate-style scripts rewrite the URL with withRequireAsNoVerify.
      if (src.includes("withRequireAsNoVerify(")) return false;
      return poolArgs(src).some(
        (arg) =>
          /\bconnectionString\b/.test(arg) && !arg.includes("pgPoolTls("),
      );
    });
    expect(bare).toEqual([]);
  });
});
