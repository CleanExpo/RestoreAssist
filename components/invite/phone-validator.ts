/**
 * Normalise an Australian mobile number to the canonical "0XXXXXXXXX" form.
 * Strips whitespace and converts a "+61" prefix to "0".
 *
 * Examples:
 *   "0412 345 678"  -> "0412345678"
 *   "+61 412 345 678" -> "0412345678"
 *   "+61412345678"  -> "0412345678"
 */
export function normaliseAuMobile(input: string): string {
  const stripped = input.replace(/\s+/g, "").trim();
  if (stripped.startsWith("+61")) {
    return "0" + stripped.slice(3);
  }
  return stripped;
}

/**
 * AU mobile validator.
 * Accepts inputs with or without spaces and an optional +61 prefix.
 * The canonical form after normalisation must match /^04\d{8}$/.
 */
export function isValidAuMobile(input: string): boolean {
  if (!input) return false;
  return /^04\d{8}$/.test(normaliseAuMobile(input));
}
