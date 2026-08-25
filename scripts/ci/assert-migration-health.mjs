const SHA256_HEX = /^[0-9a-f]{64}$/i;

/**
 * Validate the public migration-health receipt against the fingerprint proven
 * from the release's direct database connection.
 */
export function assertMigrationHealthPayload(
  payload,
  expectedFingerprint,
  expectedCount,
  expectedLedgerFingerprint,
) {
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
  if (expectedCount !== undefined) {
    const count = Number(expectedCount);
    if (!Number.isSafeInteger(count) || count <= 0 || payload.counts.total !== count) {
      throw new Error("migration health count does not match the reviewed repository");
    }
  }
  if (expectedLedgerFingerprint !== undefined) {
    if (
      !SHA256_HEX.test(expectedLedgerFingerprint) ||
      payload.migrationLedgerFingerprint !== expectedLedgerFingerprint.toLowerCase()
    ) {
      throw new Error("migration ledger fingerprint does not match the reviewed repository");
    }
  }
  return true;
}
