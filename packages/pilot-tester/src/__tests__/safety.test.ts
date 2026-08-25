import { describe, expect, it } from "vitest";
import {
  assertRuntimeRevision,
  assertSandbox,
  probeSandboxRuntimeRevision,
  ProdAccessRefused,
} from "../client/safety.js";

describe("assertSandbox", () => {
  const allowedBaseUrls = ["https://restoreassist-sandbox.vercel.app"];
  const allowedDatabaseHosts = ["db.sandbox-ref.supabase.co"];

  it("accepts localhost", () => {
    expect(() =>
      assertSandbox({ baseUrl: "http://localhost:3000" }),
    ).not.toThrow();
  });

  it("accepts the sandbox subdomain", () => {
    expect(() =>
      assertSandbox({
        baseUrl: "https://restoreassist-sandbox.vercel.app",
        allowedBaseUrls,
      }),
    ).not.toThrow();
  });

  it("refuses an unlisted Vercel preview deployment", () => {
    expect(() =>
      assertSandbox({
        baseUrl: "https://restoreassist-preview-foo.vercel.app",
        allowedBaseUrls,
      }),
    ).toThrow(ProdAccessRefused);
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

  it("refuses the current production .app origins even if allowlisted", () => {
    for (const baseUrl of [
      "https://restoreassist.app",
      "https://www.restoreassist.app",
    ]) {
      expect(() =>
        assertSandbox({ baseUrl, allowedBaseUrls: [baseUrl] }),
      ).toThrow(ProdAccessRefused);
    }
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
        allowedBaseUrls,
        allowedDatabaseHosts,
        databaseUrl:
          "postgresql://user:pwd@db.udooysjajglluvuxkijp.supabase.co:5432/postgres",
      }),
    ).toThrow(ProdAccessRefused);
  });

  it("refuses a database URL marked with the prod ref", () => {
    expect(() =>
      assertSandbox({
        baseUrl: "https://restoreassist-sandbox.vercel.app",
        allowedBaseUrls,
        allowedDatabaseHosts,
        databaseUrl:
          "postgresql://user:pwd@db.RA_PROD_DB_REF.supabase.co:5432/postgres",
      }),
    ).toThrow(ProdAccessRefused);
  });

  it("accepts a non-prod database URL when baseUrl is sandbox", () => {
    expect(() =>
      assertSandbox({
        baseUrl: "https://restoreassist-sandbox.vercel.app",
        allowedBaseUrls,
        allowedDatabaseHosts,
        databaseUrl:
          "postgresql://user:pwd@db.sandbox-ref.supabase.co:5432/postgres",
      }),
    ).not.toThrow();
  });

  it("refuses sandbox-looking attacker suffixes and remote HTTP", () => {
    for (const baseUrl of [
      "https://restoreassist-sandbox.vercel.app.attacker.example",
      "http://sandbox.attacker.example",
    ]) {
      expect(() => assertSandbox({ baseUrl, allowedBaseUrls })).toThrow(
        ProdAccessRefused,
      );
    }
  });

  it("refuses an unknown database host", () => {
    expect(() =>
      assertSandbox({
        baseUrl: "https://restoreassist-sandbox.vercel.app",
        databaseUrl:
          "postgresql://user:pwd@db.new-production-ref.supabase.co:5432/postgres",
        allowedBaseUrls,
        allowedDatabaseHosts,
      }),
    ).toThrow(ProdAccessRefused);
  });
});

describe("sandbox runtime revision binding", () => {
  const revision = "a".repeat(40);

  it("accepts only the exact deployment SHA returned by health", () => {
    expect(assertRuntimeRevision({ deploymentSha: revision }, revision)).toBe(revision);
    expect(() =>
      assertRuntimeRevision({ deploymentSha: "b".repeat(40) }, revision),
    ).toThrow(/does not match release/);
  });

  it.each([
    {},
    { deploymentSha: null },
    { deploymentSha: "main" },
  ])("fails closed when the runtime revision is absent or malformed", (payload) => {
    expect(() => assertRuntimeRevision(payload, revision)).toThrow(
      /exposes no exact deploymentSha/,
    );
  });

  it("rejects a redirected health probe before trusting its body", async () => {
    await expect(
      probeSandboxRuntimeRevision(
        "https://restoreassist-sandbox.vercel.app",
        revision,
        async () => ({
          ok: true,
          status: 200,
          url: "https://attacker.example/api/health",
          json: async () => ({ deploymentSha: revision }),
        }),
      ),
    ).rejects.toThrow(/redirected/);
  });

  it("proves the positive runtime path", async () => {
    await expect(
      probeSandboxRuntimeRevision(
        "https://restoreassist-sandbox.vercel.app",
        revision,
        async (url) => ({
          ok: true,
          status: 200,
          url,
          json: async () => ({ deploymentSha: revision }),
        }),
      ),
    ).resolves.toBe(revision);
  });
});
