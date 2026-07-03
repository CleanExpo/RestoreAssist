/**
 * lib/auth/__tests__/two-factor.test.ts
 *
 * RA-6966 — lib/auth/two-factor.ts (TOTP verify, recovery-code gen/consume)
 * was only ever vi.mock'd by callers, never unit-tested directly. This is a
 * pure unit test of the real module — no mocking — so a broken TOTP
 * comparison or a broken single-use recovery-code consumption fails here
 * directly rather than being hidden behind a caller's mock.
 */

import { describe, expect, it } from "vitest";
import * as OTPAuth from "otpauth";
import {
  consumeRecoveryCode,
  generateRecoveryCodes,
  generateSecret,
  looksLikeRecoveryCode,
  otpauthUrlFor,
  parseRecoveryCodes,
  serializeRecoveryCodes,
  verifyToken,
} from "@/lib/auth/two-factor";

// Mirrors the private constants inside two-factor.ts so the test can mint
// codes independently of `generateSecret`/`verifyToken`.
const ISSUER = "RestoreAssist";
const PERIOD_SECONDS = 30;
const DIGITS = 6;
const ALGORITHM = "SHA1";

function totpFor(secretBase32: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

describe("two-factor.ts — TOTP generation + verification", () => {
  it("verifyToken accepts a code freshly generated from the same secret", () => {
    const { secretBase32 } = generateSecret("tech@example.com");
    const code = totpFor(secretBase32).generate();

    expect(verifyToken(secretBase32, code)).toBe(true);
  });

  it("verifyToken rejects a code generated far outside the clock-skew window", () => {
    const { secretBase32 } = generateSecret("tech@example.com");
    // 10 minutes = 20 periods away; the ±1-step (±30s) window in verifyToken
    // cannot accept it.
    const staleCode = totpFor(secretBase32).generate({
      timestamp: Date.now() + 10 * 60 * 1000,
    });

    expect(verifyToken(secretBase32, staleCode)).toBe(false);
  });

  it("verifyToken rejects a code generated from a different secret", () => {
    const { secretBase32 } = generateSecret("tech@example.com");
    const { secretBase32: otherSecret } = generateSecret("other@example.com");
    const codeForOtherSecret = totpFor(otherSecret).generate();

    expect(verifyToken(secretBase32, codeForOtherSecret)).toBe(false);
  });

  it("verifyToken rejects malformed input without throwing", () => {
    const { secretBase32 } = generateSecret("tech@example.com");

    expect(verifyToken(secretBase32, "12345")).toBe(false); // too short
    expect(verifyToken(secretBase32, "abcdef")).toBe(false); // not digits
    expect(verifyToken(secretBase32, "")).toBe(false); // empty
    expect(verifyToken("", "123456")).toBe(false); // no secret
    expect(verifyToken("not-a-valid-base32-secret!!", "123456")).toBe(false);
  });

  it("verifyToken tolerates whitespace in the submitted code", () => {
    const { secretBase32 } = generateSecret("tech@example.com");
    const code = totpFor(secretBase32).generate();
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;

    expect(verifyToken(secretBase32, spaced)).toBe(true);
  });

  it("otpauthUrlFor rebuilds an otpauth:// URL for the same secret", () => {
    const { secretBase32 } = generateSecret("tech@example.com");
    const url = otpauthUrlFor(secretBase32, "tech@example.com");

    expect(url).toMatch(/^otpauth:\/\/totp\//);
    expect(url).toContain("RestoreAssist");
  });
});

describe("two-factor.ts — recovery codes", () => {
  it("generateRecoveryCodes mints 10 codes in XXXXX-XXXXX shape with matching bcrypt hashes", async () => {
    const { plain, hashed } = await generateRecoveryCodes();

    expect(plain).toHaveLength(10);
    expect(hashed).toHaveLength(10);
    for (const code of plain) {
      expect(code).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
    }
    // No duplicate codes within a single batch.
    expect(new Set(plain).size).toBe(plain.length);
  });

  it("consumeRecoveryCode accepts a valid code and single-use consumes it", async () => {
    const { plain, hashed } = await generateRecoveryCodes();

    const remaining = await consumeRecoveryCode(plain[3], hashed);
    expect(remaining).not.toBeNull();
    expect(remaining).toHaveLength(hashed.length - 1);
    expect(remaining).not.toContain(hashed[3]);

    // Replaying the same code against the shrunk list must fail — this is
    // the entire point of "single-use".
    const replay = await consumeRecoveryCode(plain[3], remaining!);
    expect(replay).toBeNull();
  });

  it("consumeRecoveryCode is case/whitespace tolerant", async () => {
    const { plain, hashed } = await generateRecoveryCodes();
    const messy = ` ${plain[0].toLowerCase()} `;

    const remaining = await consumeRecoveryCode(messy, hashed);
    expect(remaining).not.toBeNull();
    expect(remaining).toHaveLength(hashed.length - 1);
  });

  it("consumeRecoveryCode rejects a code that was never issued", async () => {
    const { hashed } = await generateRecoveryCodes();

    const result = await consumeRecoveryCode("ZZZZZ-ZZZZZ", hashed);
    expect(result).toBeNull();
  });

  it("consumeRecoveryCode rejects an empty submission", async () => {
    const { hashed } = await generateRecoveryCodes();

    const result = await consumeRecoveryCode("   ", hashed);
    expect(result).toBeNull();
  });

  it("parseRecoveryCodes / serializeRecoveryCodes round-trip", () => {
    const hashes = ["$2a$10$hash1", "$2a$10$hash2"];
    const serialized = serializeRecoveryCodes(hashes);

    expect(parseRecoveryCodes(serialized)).toEqual(hashes);
  });

  it("parseRecoveryCodes tolerates missing/malformed input", () => {
    expect(parseRecoveryCodes(null)).toEqual([]);
    expect(parseRecoveryCodes(undefined)).toEqual([]);
    expect(parseRecoveryCodes("not json")).toEqual([]);
    expect(parseRecoveryCodes(JSON.stringify({ not: "an array" }))).toEqual(
      [],
    );
  });

  it("looksLikeRecoveryCode distinguishes a 6-digit TOTP from the recovery-code shape", () => {
    expect(looksLikeRecoveryCode("123456")).toBe(false);
    expect(looksLikeRecoveryCode("ABCDE-FGHJK")).toBe(true);
    expect(looksLikeRecoveryCode("ABCDEFGHJK")).toBe(true); // dash optional
    expect(looksLikeRecoveryCode("too-short")).toBe(false);
  });
});
