import { describe, expect, it, vi } from "vitest";
import {
  backfillEmailConnectionTokens,
  parseMode,
  type EmailConnectionBackfillRow,
  type EmailConnectionBackfillStore,
} from "../backfill-encrypt-email-connections";
import { isEncryptedEmailConnectionToken } from "@/lib/email/email-connection-tokens";

process.env.CREDENTIAL_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function createStore(initial: EmailConnectionBackfillRow[], updateCount = 1) {
  let rows = structuredClone(initial);
  const validateConstraints = vi.fn(async () => undefined);
  const updateIfUnchanged = vi.fn(
    async (
      before: EmailConnectionBackfillRow,
      encrypted: Pick<
        EmailConnectionBackfillRow,
        "accessToken" | "refreshToken"
      >,
    ) => {
      if (updateCount === 1) {
        rows = rows.map((row) =>
          row.id === before.id ? { ...row, ...encrypted } : row,
        );
      }
      return updateCount;
    },
  );
  const store: EmailConnectionBackfillStore = {
    findMany: async () => structuredClone(rows),
    updateIfUnchanged,
    validateConstraints,
  };
  return { store, updateIfUnchanged, validateConstraints, rows: () => rows };
}

describe("EmailConnection token backfill", () => {
  it("requires exactly one explicit mode", () => {
    expect(parseMode(["--dry-run"])).toBe("dry-run");
    expect(parseMode(["--apply"])).toBe("apply");
    expect(() => parseMode([])).toThrow(/exactly one/i);
    expect(() => parseMode(["--dry-run", "--apply"])).toThrow(/exactly one/i);
  });

  it("dry-run reports legacy rows without writing or validating constraints", async () => {
    const { store, updateIfUnchanged, validateConstraints } = createStore([
      { id: "c1", accessToken: "plain-access", refreshToken: "plain-refresh" },
    ]);

    await expect(
      backfillEmailConnectionTokens(store, "dry-run"),
    ).resolves.toEqual({
      total: 1,
      alreadyEncrypted: 0,
      encrypted: 1,
      invalid: 0,
      dryRun: true,
    });
    expect(updateIfUnchanged).not.toHaveBeenCalled();
    expect(validateConstraints).not.toHaveBeenCalled();
  });

  it("encrypts with an optimistic compare-and-swap before validating constraints", async () => {
    const { store, updateIfUnchanged, validateConstraints, rows } = createStore(
      [
        {
          id: "c1",
          accessToken: "plain-access",
          refreshToken: "plain-refresh",
        },
      ],
    );

    await backfillEmailConnectionTokens(store, "apply");

    expect(updateIfUnchanged).toHaveBeenCalledTimes(1);
    expect(isEncryptedEmailConnectionToken(rows()[0].accessToken)).toBe(true);
    expect(isEncryptedEmailConnectionToken(rows()[0].refreshToken)).toBe(true);
    expect(validateConstraints).toHaveBeenCalledTimes(1);
    expect(updateIfUnchanged.mock.invocationCallOrder[0]).toBeLessThan(
      validateConstraints.mock.invocationCallOrder[0],
    );
  });

  it("fails on a concurrent change and never validates the constraints", async () => {
    const { store, validateConstraints } = createStore(
      [
        {
          id: "c1",
          accessToken: "plain-access",
          refreshToken: "plain-refresh",
        },
      ],
      0,
    );

    await expect(backfillEmailConnectionTokens(store, "apply")).rejects.toThrow(
      /changed concurrently/i,
    );
    expect(validateConstraints).not.toHaveBeenCalled();
  });

  it("rejects cipher-shaped garbage before validating the constraints", async () => {
    const garbage = `${"0".repeat(32)}:${"1".repeat(32)}:22`;
    const { store, updateIfUnchanged, validateConstraints } = createStore([
      { id: "c1", accessToken: garbage, refreshToken: garbage },
    ]);

    await expect(backfillEmailConnectionTokens(store, "apply")).rejects.toThrow(
      /credentials are unavailable/i,
    );
    expect(updateIfUnchanged).not.toHaveBeenCalled();
    expect(validateConstraints).not.toHaveBeenCalled();
  });

  it("fails closed on an empty legacy token instead of encrypting an unusable credential", async () => {
    const { store, updateIfUnchanged, validateConstraints } = createStore([
      { id: "c1", accessToken: "plain-access", refreshToken: "" },
    ]);

    await expect(backfillEmailConnectionTokens(store, "apply")).rejects.toThrow(
      /provider reconnection/i,
    );
    expect(updateIfUnchanged).not.toHaveBeenCalled();
    expect(validateConstraints).not.toHaveBeenCalled();
  });
});
