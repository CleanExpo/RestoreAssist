/**
 * Server custody for RoomPlan CapturedRoom JSON (RA-7090 bridge).
 *
 * Hash is always computed over the exact UTF-8 bytes of the JSON we persist —
 * never over a client digest or Data URL. This is custody-of-bytes; it does
 * not claim Ed25519 tamper-evidence unless a signed EvidenceItem is attached
 * separately.
 */
import { createHash } from "node:crypto";
import { stableStringify } from "@/lib/sketch/roomplan-custody-queue";

export function hashRoomPlanPayloadBytes(utf8: string): string {
  return createHash("sha256").update(utf8, "utf8").digest("hex");
}

/**
 * Canonicalise then serialise so client + server digests converge when both
 * use stableStringify on the same CapturedRoom shape.
 */
export function serializeRoomPlanPayload(payload: unknown): string {
  return stableStringify(payload);
}

export function verifyClientSha256(
  serverSha256: string,
  clientSha256: string | null | undefined,
): boolean {
  if (!clientSha256) return true;
  return clientSha256.toLowerCase() === serverSha256.toLowerCase();
}
