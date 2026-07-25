/**
 * RA-7090 slice 2: deterministic manifest canonicalization — shared by the
 * client signer (lib/evidence/device-signing.ts) and the server verifier
 * (app/api/inspections/[id]/evidence). Signature verification only works if
 * both sides serialise the manifest to the EXACT same bytes, so this module
 * is deliberately dependency-free and pure.
 *
 * Format: JSON with object keys sorted lexicographically (UTF-16 code-unit
 * order, applied recursively) and no whitespace — a JCS (RFC 8785)-style
 * canonical form. JavaScript's JSON.stringify already emits shortest
 * round-trip number form, which both Node and browsers share.
 *
 * Rejections are deliberate: NaN/Infinity, BigInt, functions and symbols
 * throw instead of silently serialising to null/undefined — a manifest that
 * cannot canonicalise deterministically must never be signed.
 */

/** The signed capture manifest (RA-7090 acceptance criteria). */
export interface SignedEvidenceManifest {
  /** Present only when re-signing an existing record; absent at capture. */
  evidenceId?: string;
  inspectionId: string;
  workflowStepId: string | null;
  evidenceClass: string;
  /** ISO-8601 capture timestamp. */
  capturedAt: string;
  gps: {
    lat: number | null;
    lng: number | null;
    accuracy: number | null;
  };
  userId: string;
  /** DeviceSigningKey.publicKeyId of the key that signed this manifest. */
  deviceKeyId: string;
  /** SHA-256 (hex) over the exact captured bytes. */
  sha256: string;
}

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new Error(
          "Cannot canonicalize non-finite number in signed manifest",
        );
      }
      return JSON.stringify(value);
    case "string":
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value
          .map((item) => canonicalize(item === undefined ? null : item))
          .join(",")}]`;
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort();
      return `{${keys
        .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
        .join(",")}}`;
    }
    default:
      // undefined, bigint, function, symbol
      throw new Error(
        `Cannot canonicalize value of type ${typeof value} in signed manifest`,
      );
  }
}

/**
 * Serialise a manifest to its canonical byte-form string. Both signer and
 * verifier MUST call this on the (parsed) manifest object — never sign or
 * verify raw client-provided text.
 */
export function canonicalizeManifest(manifest: unknown): string {
  if (
    manifest === null ||
    typeof manifest !== "object" ||
    Array.isArray(manifest)
  ) {
    throw new Error("Signed manifest must be a plain object");
  }
  return canonicalize(manifest);
}
