import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SERVICE = "lib/email/email-connection-tokens.ts";
const MIGRATION =
  "prisma/migrations/20260825141000_email_connection_token_encryption_guard/migration.sql";

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(join(ROOT, directory), {
    withFileTypes: true,
  })) {
    const path = join(ROOT, directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__")
        files.push(...sourceFiles(relative(ROOT, path)));
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.(?:test|spec)\.tsx?$/.test(entry.name)
    ) {
      files.push(relative(ROOT, path));
    }
  }
  return files;
}

function findDirectEmailConnectionAccess(
  sources: Array<{ path: string; text: string }>,
): string[] {
  const directAccess = /\bemailConnection\s*\./;
  return sources
    .filter(({ text }) => directAccess.test(text))
    .map(({ path }) => path)
    .sort();
}

describe("EmailConnection encrypted persistence boundary", () => {
  it("keeps every application write behind the encrypted service", () => {
    const sources = [...sourceFiles("app"), ...sourceFiles("lib")].map(
      (path) => ({
        path,
        text: readFileSync(join(ROOT, path), "utf8"),
      }),
    );

    expect(findDirectEmailConnectionAccess(sources)).toEqual([SERVICE]);
  });

  it("detects a planted direct-write mutant", () => {
    expect(
      findDirectEmailConnectionAccess([
        {
          path: "app/api/mutant/route.ts",
          text: "prisma.emailConnection.upsert({})",
        },
      ]),
    ).toEqual(["app/api/mutant/route.ts"]);
  });

  it("enforces both ciphertext shapes on new writes without blocking legacy migration deploy", () => {
    const sql = readFileSync(join(ROOT, MIGRATION), "utf8");
    expect(sql).toContain("EmailConnection_accessToken_ciphertext_check");
    expect(sql).toContain("EmailConnection_refreshToken_ciphertext_check");
    expect(sql.match(/\) NOT VALID;/g)).toHaveLength(2);
    expect(sql).not.toMatch(/VALIDATE\s+CONSTRAINT/i);
  });

  it("keeps the live backfill bound to direct identity and the expected fingerprint", () => {
    const script = readFileSync(
      join(ROOT, "scripts/backfill-encrypt-email-connections.ts"),
      "utf8",
    );
    for (const required of [
      "DIRECT_URL",
      "EXPECTED_DIRECT_DATABASE_HOST",
      "EXPECTED_DIRECT_DATABASE_NAME",
      "EXPECTED_DIRECT_DATABASE_SCHEMA",
      "EXPECTED_DATABASE_FINGERPRINT",
    ]) {
      expect(script).toContain(required);
    }
    expect(script).toContain("updateMany");
    expect(script).toContain("VALIDATE CONSTRAINT");
  });
});
