import { describe, expect, it } from "vitest";
import {
  applyMigrateSslToEnv,
  pgMigrateSslOption,
  withPgMigrateSsl,
  withRequireAsNoVerify,
} from "../pg-ssl-for-migrate.mjs";

describe("withPgMigrateSsl", () => {
  it("leaves localhost URLs unchanged", () => {
    const local = "postgresql://u:p@localhost:5432/db";
    expect(withPgMigrateSsl(local)).toBe(local);
    expect(withPgMigrateSsl("postgresql://u:p@127.0.0.1:5432/db")).toBe(
      "postgresql://u:p@127.0.0.1:5432/db",
    );
  });

  it("appends sslmode=no-verify for remote Heroku-style URLs", () => {
    const url =
      "postgres://u:p@ec2-1-2-3-4.compute-1.amazonaws.com:5432/d";
    expect(withPgMigrateSsl(url)).toBe(`${url}?sslmode=no-verify`);
  });

  it("replaces sslmode=require (pg verify-full alias) with no-verify", () => {
    const url =
      "postgresql://u:p@db.example.com:5432/d?sslmode=require&schema=public";
    const out = withPgMigrateSsl(url);
    expect(out).toContain("sslmode=no-verify");
    expect(out).not.toContain("sslmode=require");
    expect(out).toContain("schema=public");
  });

  it("is idempotent when no-verify already set", () => {
    const url = "postgresql://u:p@db.example.com:5432/d?sslmode=no-verify";
    expect(withPgMigrateSsl(url)).toBe(url);
  });
});

describe("applyMigrateSslToEnv", () => {
  it("rewrites DATABASE_URL and mirrors to DIRECT_URL when unset", () => {
    const env = {
      DATABASE_URL: "postgres://u:p@remote.host:5432/db",
    };
    applyMigrateSslToEnv(env);
    expect(env.DATABASE_URL).toContain("sslmode=no-verify");
    expect(env.DIRECT_URL).toBe(env.DATABASE_URL);
  });
});

describe("pgMigrateSslOption", () => {
  it("returns rejectUnauthorized:false for remote URLs", () => {
    expect(
      pgMigrateSslOption("postgres://u:p@remote.host:5432/db?sslmode=no-verify"),
    ).toEqual({ rejectUnauthorized: false });
  });

  it("returns undefined for localhost", () => {
    expect(pgMigrateSslOption("postgresql://u:p@localhost:5432/db")).toBeUndefined();
  });
});

describe("withRequireAsNoVerify", () => {
  // Effective TLS as pg's Pool resolves it, with the option the scripts pass.
  const effective = async (url: string) => {
    const { default: ConnectionParameters } = await import(
      "pg/lib/connection-parameters"
    );
    const target = withRequireAsNoVerify(url) ?? url;
    return new ConnectionParameters({
      connectionString: target,
      ssl: pgMigrateSslOption(target),
    }).ssl;
  };
  const remote = "postgresql://u:p@db.example.com:25060/defaultdb";

  it("stops sslmode=require (and a repeat of it) from verifying", async () => {
    expect(await effective(`${remote}?sslmode=require`)).toEqual({
      rejectUnauthorized: false,
    });
    expect(
      await effective(`${remote}?sslmode=require&sslmode=require`),
    ).toEqual({ rejectUnauthorized: false });
  });

  it("keeps an explicit verify-full or verify-ca verifying", async () => {
    expect(withRequireAsNoVerify(`${remote}?sslmode=verify-full`)).toBe(
      `${remote}?sslmode=verify-full`,
    );
    expect(await effective(`${remote}?sslmode=verify-full`)).not.toMatchObject(
      { rejectUnauthorized: false },
    );
    expect(withRequireAsNoVerify(`${remote}?sslmode=verify-ca`)).toBe(
      `${remote}?sslmode=verify-ca`,
    );
  });

  it("follows the sslmode pg actually uses when modes are mixed (the last one)", async () => {
    for (const last of ["verify-full", "verify-ca"]) {
      const url = `${remote}?sslmode=require&sslmode=${last}`;
      expect(withRequireAsNoVerify(url)).toBe(url);
    }
    expect(
      await effective(`${remote}?sslmode=require&sslmode=verify-full`),
    ).not.toMatchObject({ rejectUnauthorized: false });
    expect(
      await effective(`${remote}?sslmode=verify-full&sslmode=require`),
    ).toEqual({ rejectUnauthorized: false });
    expect(
      await effective(`${remote}?sslmode=no-verify&sslmode=require`),
    ).toEqual({ rejectUnauthorized: false });
  });

  it("leaves require with another TLS parameter exactly as pg reads it", async () => {
    const { default: ConnectionParameters } = await import(
      "pg/lib/connection-parameters"
    );
    for (const extra of [
      "uselibpqcompat=true",
      "ssl=true",
      "sslrootcert=/dev/null",
    ]) {
      const url = `${remote}?sslmode=require&${extra}`;
      expect(withRequireAsNoVerify(url)).toBe(url);
    }
    const libpq = `${remote}?sslmode=require&uselibpqcompat=true`;
    expect(await effective(libpq)).toEqual(
      new ConnectionParameters({ connectionString: libpq }).ssl,
    );
  });

  it("rewrites a local URL whose host parameter points at a remote server", async () => {
    expect(
      await effective(
        "postgresql://u:p@localhost/d?host=db.example.com&sslmode=require",
      ),
    ).toEqual({ rejectUnauthorized: false });
  });

  it("reads the sslmode case-insensitively, as pg does", async () => {
    expect(await effective(`${remote}?sslmode=REQUIRE`)).toEqual({
      rejectUnauthorized: false,
    });
  });

  it("leaves a URL with no sslmode unchanged", () => {
    expect(withRequireAsNoVerify(remote)).toBe(remote);
  });
});
