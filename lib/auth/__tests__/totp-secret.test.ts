/**
 * TOTP secret at-rest encryption (security review M3).
 *
 * The stored value must not be a usable base32 secret (a DB dump must not yield
 * working second factors), must round-trip back to the original for
 * verification, and must transparently read legacy plaintext rows.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  encryptTotpSecret,
  readTotpSecret,
  isEncryptedTotpSecret,
} from "../totp-secret";

const SECRET = "JBSWY3DPEHPK3PXP"; // valid base32

beforeAll(() => {
  // credential-vault needs a 32-byte key; provide a deterministic hex one.
  process.env.CREDENTIAL_ENCRYPTION_KEY = "a".repeat(64);
});

describe("TOTP secret encryption", () => {
  it("stored value is NOT the plaintext secret (DB dump is useless)", () => {
    const stored = encryptTotpSecret(SECRET);
    expect(stored).not.toBe(SECRET);
    expect(stored).not.toContain(SECRET);
    expect(isEncryptedTotpSecret(stored)).toBe(true);
  });

  it("round-trips back to the original secret for verification", () => {
    const stored = encryptTotpSecret(SECRET);
    expect(readTotpSecret(stored)).toBe(SECRET);
  });

  it("reads a legacy plaintext secret unchanged (fallback)", () => {
    expect(isEncryptedTotpSecret(SECRET)).toBe(false);
    expect(readTotpSecret(SECRET)).toBe(SECRET);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptTotpSecret(SECRET)).not.toBe(encryptTotpSecret(SECRET));
  });
});
