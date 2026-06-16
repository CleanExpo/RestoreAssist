/**
 * B3 — unit tests for Account OAuth-token encryption helpers.
 * No DB: exercises the pure encrypt/decrypt wrappers against a known key.
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  encryptAccountTokens,
  decryptAccountTokens,
  isEncryptedToken,
} from "../account-tokens";

beforeAll(() => {
  // A real 32-byte key so credential-vault's resolveKey accepts it (rejects
  // all-zero/short). Deterministic for the test, not a secret.
  process.env.INTEGRATION_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
});

const PLAINTEXT = {
  access_token: "ya29.a0AeXRPp-live-access-token",
  refresh_token: "1//0gReFrEsHtOkEn_withSlashes/and.dots",
  id_token: "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig",
};

describe("encryptAccountTokens", () => {
  it("encrypts all three token fields to cipher shape, not plaintext", () => {
    const enc = encryptAccountTokens(PLAINTEXT);
    for (const f of ["access_token", "refresh_token", "id_token"] as const) {
      expect(enc[f]).not.toBe(PLAINTEXT[f]);
      expect(isEncryptedToken(enc[f]!)).toBe(true);
    }
  });

  it("round-trips: decrypt(encrypt(x)) === x", () => {
    const enc = encryptAccountTokens(PLAINTEXT);
    const dec = decryptAccountTokens(enc);
    expect(dec).toEqual(PLAINTEXT);
  });

  it("is idempotent — does not double-encrypt an already-ciphertext value", () => {
    const once = encryptAccountTokens(PLAINTEXT);
    const twice = encryptAccountTokens(once);
    expect(twice).toEqual(once);
    expect(decryptAccountTokens(twice)).toEqual(PLAINTEXT);
  });

  it("passes null/undefined token fields through untouched", () => {
    const enc = encryptAccountTokens({
      access_token: null,
      refresh_token: undefined,
      id_token: "",
    });
    expect(enc.access_token).toBeNull();
    expect(enc.refresh_token).toBeUndefined();
    expect(enc.id_token).toBe("");
  });

  it("leaves non-token fields untouched", () => {
    const enc = encryptAccountTokens({
      access_token: "ya29.x",
      expires_at: 1700000000,
      provider: "google",
    } as Record<string, unknown>);
    expect(enc.expires_at).toBe(1700000000);
    expect(enc.provider).toBe("google");
  });
});

describe("decryptAccountTokens legacy fallback", () => {
  it("returns plaintext unchanged when a row was never encrypted (pre-backfill)", () => {
    const dec = decryptAccountTokens(PLAINTEXT);
    expect(dec).toEqual(PLAINTEXT);
  });

  it("returns null/undefined account unchanged", () => {
    expect(decryptAccountTokens(null)).toBeNull();
  });

  it("does not throw on a cipher-shaped but undecryptable value", () => {
    const garbage = { access_token: "deadbeef:deadbeef:deadbeef" };
    expect(() => decryptAccountTokens(garbage)).not.toThrow();
  });
});
