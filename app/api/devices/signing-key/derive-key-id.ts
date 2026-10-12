import crypto from "crypto";

/**
 * The ID is derived from key material server-side. A revoked key collides
 * with its old record instead of returning under a different client alias.
 */
export function deriveDeviceKeyId(publicKey: crypto.KeyObject): string {
  const spkiDer = publicKey.export({ format: "der", type: "spki" });
  return crypto.createHash("sha256").update(spkiDer).digest("hex").slice(0, 16);
}
