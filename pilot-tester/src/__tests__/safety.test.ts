import { describe, expect, it } from "vitest";
import { assertSandbox, ProdAccessRefused } from "../client/safety.js";

describe("assertSandbox", () => {
  it("accepts localhost", () => {
    expect(() =>
      assertSandbox({ baseUrl: "http://localhost:3000" }),
    ).not.toThrow();
  });

  it("accepts the sandbox subdomain", () => {
    expect(() =>
      assertSandbox({
        baseUrl: "https://restoreassist-sandbox.vercel.app",
      }),
    ).not.toThrow();
  });

  it("accepts a Vercel preview deployment", () => {
    expect(() =>
      assertSandbox({
        baseUrl: "https://restoreassist-preview-foo.vercel.app",
      }),
    ).not.toThrow();
  });

  it("refuses the prod root domain", () => {
    expect(() =>
      assertSandbox({ baseUrl: "https://app.restoreassist.com.au" }),
    ).toThrow(ProdAccessRefused);
  });

  it("refuses the bare prod domain", () => {
    expect(() =>
      assertSandbox({ baseUrl: "https://restoreassist.com.au" }),
    ).toThrow(ProdAccessRefused);
  });

  it("refuses an unknown hostname without a sandbox marker", () => {
    expect(() => assertSandbox({ baseUrl: "https://example.com" })).toThrow(
      ProdAccessRefused,
    );
  });

  it("refuses an empty baseUrl", () => {
    expect(() => assertSandbox({ baseUrl: "" })).toThrow(ProdAccessRefused);
  });

  it("refuses an unparseable baseUrl", () => {
    expect(() => assertSandbox({ baseUrl: "not-a-url" })).toThrow(
      ProdAccessRefused,
    );
  });

  it("refuses a database URL containing the REAL prod Supabase ref (RA-7008)", () => {
    expect(() =>
      assertSandbox({
        baseUrl: "https://restoreassist-sandbox.vercel.app",
        databaseUrl:
          "postgresql://user:pwd@db.udooysjajglluvuxkijp.supabase.co:5432/postgres",
      }),
    ).toThrow(ProdAccessRefused);
  });

  it("refuses a database URL marked with the prod ref", () => {
    expect(() =>
      assertSandbox({
        baseUrl: "https://restoreassist-sandbox.vercel.app",
        databaseUrl:
          "postgresql://user:pwd@db.RA_PROD_DB_REF.supabase.co:5432/postgres",
      }),
    ).toThrow(ProdAccessRefused);
  });

  it("accepts a non-prod database URL when baseUrl is sandbox", () => {
    expect(() =>
      assertSandbox({
        baseUrl: "https://restoreassist-sandbox.vercel.app",
        databaseUrl:
          "postgresql://user:pwd@db.sandbox-ref.supabase.co:5432/postgres",
      }),
    ).not.toThrow();
  });
});
