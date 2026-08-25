import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { canonicalEmail, lockEmailIdentity } from "@/lib/email-identity";

describe("canonical email identity", () => {
  it("normalises case, whitespace and compatibility characters", () => {
    expect(canonicalEmail("  PHILL@Example.COM  ")).toBe("phill@example.com");
    expect(canonicalEmail("Ａ@example.com")).toBe("a@example.com");
    expect(canonicalEmail("\uFEFFUser@example.com\uFEFF")).toBe(
      "user@example.com",
    );
  });

  it("takes a transaction-scoped advisory lock", async () => {
    const execute = vi.fn().mockResolvedValue(1);
    await lockEmailIdentity(
      { $executeRaw: execute } as any,
      "Phill@Example.com",
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("uses NFKC at the database collision and uniqueness boundary", () => {
    const migration = readFileSync(
      "prisma/migrations/20260825123000_canonical_email_identity/migration.sql",
      "utf8",
    );
    expect(migration).toContain("restoreassist_canonical_email");
    expect(migration).toContain("chr(65279)");
    expect(migration).toContain(
      'UPDATE "UserInvite" SET "email" = restoreassist_canonical_email("email")',
    );
    expect(migration).toContain('count(DISTINCT "email") > 1');
    expect(migration).toContain(
      'CREATE INDEX "UserInvite_email_canonical_idx"',
    );
    const preflight = readFileSync(
      "scripts/audit-email-identity-collisions.sql",
      "utf8",
    );
    expect(preflight).toContain('FROM "UserInvite"');
    expect(preflight).toContain("chr(65279)");
    expect(preflight).not.toContain("restoreassist_canonical_email(");
  });
});
