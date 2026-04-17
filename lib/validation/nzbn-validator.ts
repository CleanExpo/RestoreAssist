/**
 * NZBN (New Zealand Business Number) validator.
 *
 * An NZBN is a 13-digit identifier issued by the NZ Companies Office.
 * The check digit is computed using the GS1 GLN / EAN-13 algorithm
 * (the same modulo-10 weighted checksum used for retail barcodes).
 *
 * Algorithm (per https://www.nzbn.govt.nz/ and GS1 General Specifications):
 *   1. Take the first 12 digits.
 *   2. Multiply digits at odd positions (0-indexed: 0, 2, 4, ... 10) by 1
 *      and digits at even positions (1, 3, 5, ... 11) by 3.
 *   3. Sum the weighted products; compute (sum mod 10).
 *      - If the remainder is 0, the check digit is 0.
 *      - Otherwise, the check digit is 10 - remainder.
 *   4. The check digit must equal the 13th digit.
 *
 * RestoreAssist is an AU/NZ platform — use ABN validation for AU entities
 * and NZBN validation for NZ entities. Never conflate the two.
 */

export interface NZBNValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Normalises an NZBN by stripping all whitespace. Returns the resulting
 * string unchanged in length/content aside from whitespace removal — callers
 * should pass the result to `validateNZBN` to confirm it is a 13-digit NZBN.
 */
export function normalizeNZBN(nzbn: string): string {
  if (typeof nzbn !== "string") return "";
  return nzbn.replace(/\s+/g, "");
}

/**
 * Validates an NZBN. Returns `{ valid: true }` when the input is a 13-digit
 * numeric string whose final digit matches the GS1 mod-10 check digit of
 * the first 12. Otherwise returns `{ valid: false, error }` with a
 * human-readable reason.
 */
export function validateNZBN(nzbn: string): NZBNValidationResult {
  if (typeof nzbn !== "string" || nzbn.length === 0) {
    return { valid: false, error: "NZBN is required" };
  }

  const normalised = normalizeNZBN(nzbn);

  if (normalised.length === 0) {
    return { valid: false, error: "NZBN is required" };
  }

  if (!/^\d+$/.test(normalised)) {
    return { valid: false, error: "NZBN must contain digits only" };
  }

  if (normalised.length !== 13) {
    return { valid: false, error: "NZBN must be exactly 13 digits" };
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number(normalised[i]);
    // Odd positions (0, 2, 4, ... 10) weight 1; even positions (1, 3, 5, ... 11) weight 3.
    const weight = i % 2 === 0 ? 1 : 3;
    sum += digit * weight;
  }

  const remainder = sum % 10;
  const expectedCheckDigit = remainder === 0 ? 0 : 10 - remainder;
  const actualCheckDigit = Number(normalised[12]);

  if (expectedCheckDigit !== actualCheckDigit) {
    return { valid: false, error: "NZBN checksum is invalid" };
  }

  return { valid: true };
}
