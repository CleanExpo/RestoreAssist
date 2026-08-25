import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique, upsert } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    emailConnection: { findUnique, upsert },
  },
}));

import {
  EmailConnectionCredentialUnavailableError,
  decryptEmailConnectionTokens,
  encryptEmailConnectionTokens,
  getEmailConnectionForUser,
  isEncryptedEmailConnectionToken,
  saveEmailConnection,
} from "../email-connection-tokens";

const KEY_A =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const KEY_B =
  "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

const plaintext = {
  accessToken: "ya29.restoreassist-access",
  refreshToken: "1//restoreassist-refresh",
};

beforeEach(() => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = KEY_A;
  delete process.env.INTEGRATION_ENCRYPTION_KEY;
  delete process.env.NEXTAUTH_SECRET;
  findUnique.mockReset();
  upsert.mockReset();
});

describe("EmailConnection encrypted token boundary", () => {
  it("encrypts both OAuth tokens and round-trips them", () => {
    const encrypted = encryptEmailConnectionTokens(plaintext);

    expect(encrypted.accessToken).not.toContain(plaintext.accessToken);
    expect(encrypted.refreshToken).not.toContain(plaintext.refreshToken);
    expect(isEncryptedEmailConnectionToken(encrypted.accessToken)).toBe(true);
    expect(isEncryptedEmailConnectionToken(encrypted.refreshToken)).toBe(true);
    expect(decryptEmailConnectionTokens(encrypted)).toEqual(plaintext);
  });

  it("authenticates already-encrypted values instead of double-encrypting", () => {
    const once = encryptEmailConnectionTokens(plaintext);
    expect(encryptEmailConnectionTokens(once)).toEqual(once);
  });

  it.each([
    ["legacy plaintext", plaintext],
    [
      "cipher-shaped garbage",
      {
        accessToken: `${"0".repeat(32)}:${"1".repeat(32)}:22`,
        refreshToken: `${"0".repeat(32)}:${"1".repeat(32)}:22`,
      },
    ],
  ])("fails closed on %s without returning either token", (_label, row) => {
    expect(() => decryptEmailConnectionTokens(row)).toThrow(
      EmailConnectionCredentialUnavailableError,
    );
  });

  it("fails closed when ciphertext was produced with a different key", () => {
    const encrypted = encryptEmailConnectionTokens(plaintext);
    process.env.CREDENTIAL_ENCRYPTION_KEY = KEY_B;

    expect(() => decryptEmailConnectionTokens(encrypted)).toThrow(
      EmailConnectionCredentialUnavailableError,
    );
  });

  it("refuses empty credentials", () => {
    expect(() =>
      encryptEmailConnectionTokens({
        accessToken: "",
        refreshToken: plaintext.refreshToken,
      }),
    ).toThrow(EmailConnectionCredentialUnavailableError);
  });

  it("refuses the NEXTAUTH_SECRET fallback even outside production", () => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    process.env.NEXTAUTH_SECRET = KEY_B;

    expect(() => encryptEmailConnectionTokens(plaintext)).toThrow(
      EmailConnectionCredentialUnavailableError,
    );
  });
});

describe("EmailConnection persistence service", () => {
  it("never passes plaintext tokens to Prisma", async () => {
    upsert.mockImplementation(async (args) => args.create);
    const input = {
      userId: "user-1",
      provider: "google" as const,
      email: "owner@example.com",
      expiresAt: new Date("2026-08-25T00:00:00.000Z"),
      ...plaintext,
    };

    await saveEmailConnection(input);

    const args = upsert.mock.calls[0][0];
    expect(args.create.accessToken).not.toBe(plaintext.accessToken);
    expect(args.create.refreshToken).not.toBe(plaintext.refreshToken);
    expect(args.update.accessToken).toBe(args.create.accessToken);
    expect(args.update.refreshToken).toBe(args.create.refreshToken);
    expect(decryptEmailConnectionTokens(args.create)).toMatchObject(plaintext);
  });

  it("returns authenticated plaintext only through the service read", async () => {
    const encrypted = encryptEmailConnectionTokens(plaintext);
    findUnique.mockResolvedValue({
      id: "connection-1",
      userId: "user-1",
      ...encrypted,
    });

    await expect(getEmailConnectionForUser("user-1")).resolves.toMatchObject({
      id: "connection-1",
      ...plaintext,
    });
  });

  it("rejects a legacy plaintext database row", async () => {
    findUnique.mockResolvedValue({
      id: "connection-1",
      userId: "user-1",
      ...plaintext,
    });

    await expect(getEmailConnectionForUser("user-1")).rejects.toBeInstanceOf(
      EmailConnectionCredentialUnavailableError,
    );
  });

  it("returns null when no connection exists", async () => {
    findUnique.mockResolvedValue(null);
    await expect(getEmailConnectionForUser("missing")).resolves.toBeNull();
  });
});
