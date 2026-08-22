import { describe, expect, it } from "vitest";
import {
  applyMigrateSslToEnv,
  pgMigrateSslOption,
  withPgMigrateSsl,
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
