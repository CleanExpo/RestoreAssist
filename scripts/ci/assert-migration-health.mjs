const SHA256_HEX = /^[0-9a-f]{64}$/i;

/**
 * Validate the public migration-health receipt against the fingerprint proven
 * from the release's direct database connection.
 */
export function assertMigrationHealthPayload(payload, expectedFingerprint) {
  if (!SHA256_HEX.test(expectedFingerprint ?? "")) {
    throw new Error("EXPECTED_DATABASE_FINGERPRINT must be a 64-character SHA-256 value");
  }
  if (!payload || typeof payload !== "object") {
    throw new Error("migration health response is not a JSON object");
  }
  if (payload.status !== "ok") {
    throw new Error(`migration health is not ok: ${JSON.stringify(payload.status)}`);
  }
  if (
    typeof payload.databaseFingerprint !== "string" ||
    payload.databaseFingerprint.toLowerCase() !== expectedFingerprint.toLowerCase()
  ) {
    throw new Error("migration health database fingerprint does not match the release receipt");
  }
  if (
    !payload.counts ||
    !Number.isInteger(payload.counts.applied) ||
    payload.counts.applied < 1 ||
    payload.counts.failed !== 0 ||
    payload.counts.rolled_back !== 0
  ) {
    throw new Error("migration health counts do not prove a clean applied ledger");
  }
  return true;
}
